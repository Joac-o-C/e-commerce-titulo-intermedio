import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Address } from './entities/address.entity.js';
import { AddressesService } from './addresses.service.js';

const baseAddress = (overrides: Partial<Address> = {}): Address =>
  ({
    id: 'addr-1',
    userId: 'user-1',
    alias: 'Casa',
    street: 'Calle Falsa',
    number: '123',
    city: 'CABA',
    province: 'Buenos Aires',
    postalCode: '1000',
    phone: '1122334455',
    isDefault: false,
    isActive: true,
    ...overrides,
  }) as Address;

describe('AddressesService', () => {
  let service: AddressesService;
  let repo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn((data) => data ?? {}),
      save: vi.fn((data) => Promise.resolve(data)),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AddressesService, { provide: getRepositoryToken(Address), useValue: repo }],
    }).compile();

    service = moduleRef.get(AddressesService);
  });

  describe('CU-12 Gestionar direcciones', () => {
    it('marca la primera dirección del usuario como predeterminada automáticamente', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.create('user-1', {
        alias: 'Casa',
        street: 'Calle Falsa',
        number: '123',
        city: 'CABA',
        province: 'Buenos Aires',
        postalCode: '1000',
        phone: '1122334455',
      });

      expect(result.isDefault).toBe(true);
    });

    it('quita la marca de la anterior si se pide marcar la nueva como predeterminada', async () => {
      repo.find.mockResolvedValue([baseAddress({ isDefault: true })]);

      await service.create('user-1', {
        alias: 'Trabajo',
        street: 'Otra calle',
        number: '456',
        city: 'CABA',
        province: 'Buenos Aires',
        postalCode: '2000',
        phone: '1155667788',
        isDefault: true,
      });

      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', isDefault: true },
        { isDefault: false },
      );
    });

    it('3b-1: permite eliminar la única dirección y deja la libreta vacía', async () => {
      const address = baseAddress({ isDefault: true });
      repo.findOne.mockResolvedValue(address);
      repo.find.mockResolvedValue([address]);

      await service.remove('user-1', 'addr-1');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, isDefault: false }),
      );
    });

    it('3b: exige elegir la nueva predeterminada si se elimina la actual y quedan otras', async () => {
      const toDelete = baseAddress({ id: 'addr-1', isDefault: true });
      const other = baseAddress({ id: 'addr-2', isDefault: false });
      repo.findOne.mockResolvedValue(toDelete);
      repo.find.mockResolvedValue([toDelete, other]);

      await expect(service.remove('user-1', 'addr-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('7a: informa si la dirección referenciada ya no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('user-1', 'addr-x', { alias: 'Nueva' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('3c: marca una dirección existente como predeterminada y quita la anterior', async () => {
      const address = baseAddress({ isDefault: false });
      repo.findOne.mockResolvedValue(address);

      const result = await service.markDefault('user-1', 'addr-1');

      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', isDefault: true },
        { isDefault: false },
      );
      expect(result.isDefault).toBe(true);
    });
  });
});
