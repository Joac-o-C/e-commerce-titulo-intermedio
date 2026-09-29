import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ShippingMethod, ShippingMethodType } from '../entities/shipping-method.entity.js';
import { AdminShippingMethodsService } from './admin-shipping-methods.service.js';

describe('AdminShippingMethodsService', () => {
  let service: AdminShippingMethodsService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  const method = (overrides: Partial<ShippingMethod> = {}) =>
    ({ id: 'm-1', name: 'Envío estándar', description: null, cost: '4500.00', isActive: true, ...overrides }) as ShippingMethod;

  beforeEach(async () => {
    repo = {
      find: vi.fn(),
      findOneBy: vi.fn().mockResolvedValue(method()),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve({ id: 'm-new', ...data })),
      countBy: vi.fn().mockResolvedValue(2),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AdminShippingMethodsService, { provide: getRepositoryToken(ShippingMethod), useValue: repo }],
    }).compile();
    service = moduleRef.get(AdminShippingMethodsService);
  });

  describe('ABM de métodos de envío (alcance extra de la Fase 6)', () => {
    it('crea un método activo, con el costo con 2 decimales; costo 0 permitido', async () => {
      const created = await service.create({ name: 'Retiro en local', cost: 0, type: ShippingMethodType.RETIRO });

      expect(created).toEqual(
        expect.objectContaining({ name: 'Retiro en local', cost: '0.00', isActive: true, description: null, type: 'retiro' }),
      );
    });

    it('nombre repetido (sin distinguir mayúsculas, lo detecta el índice único): 409', async () => {
      repo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

      await expect(service.create({ name: 'envío ESTÁNDAR', cost: 10, type: ShippingMethodType.DOMICILIO })).rejects.toBeInstanceOf(ConflictException);
    });

    it('otro error de base no se disfraza de nombre repetido', async () => {
      repo.save.mockRejectedValue(new Error('conexión caída'));

      await expect(service.create({ name: 'X', cost: 10, type: ShippingMethodType.DOMICILIO })).rejects.toThrow('conexión caída');
    });

    it('edita sólo los campos enviados', async () => {
      const updated = await service.update('m-1', { cost: 5000.5 });

      expect(updated).toEqual(expect.objectContaining({ name: 'Envío estándar', cost: '5000.50' }));
    });

    it('cambia el tipo (domicilio / retiro) sin tocar el resto', async () => {
      const updated = await service.update('m-1', { type: ShippingMethodType.RETIRO });

      expect(updated).toEqual(expect.objectContaining({ name: 'Envío estándar', type: 'retiro' }));
    });

    it('editar un método inexistente: 404', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('desactivar con otros activos: sin advertencia', async () => {
      const result = await service.setActive('m-1', false);

      expect(result).toEqual(expect.objectContaining({ lastActiveDisabled: false }));
      expect(result.method.isActive).toBe(false);
    });

    it('desactivar el último activo se permite, con advertencia (decisión de la Fase 6)', async () => {
      repo.countBy.mockResolvedValue(0);

      const result = await service.setActive('m-1', false);

      expect(result.lastActiveDisabled).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('activar nunca advierte', async () => {
      repo.findOneBy.mockResolvedValue(method({ isActive: false }));
      repo.countBy.mockResolvedValue(0);

      expect((await service.setActive('m-1', true)).lastActiveDisabled).toBe(false);
    });
  });
});
