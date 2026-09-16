import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { Category } from '../entities/category.entity.js';
import { CategoriesService } from './categories.service.js';

const baseCategory = (overrides: Partial<Category> = {}): Category =>
  ({
    id: 'cat-1',
    name: 'Indumentaria',
    parentId: null,
    order: 0,
    isVisible: true,
    isActive: true,
    ...overrides,
  }) as Category;

describe('CategoriesService', () => {
  let service: CategoriesService;
  let qb: {
    where: ReturnType<typeof vi.fn>;
    andWhere: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
    getCount: ReturnType<typeof vi.fn>;
  };
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    qb = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(null),
      getCount: vi.fn().mockResolvedValue(0),
    };
    repo = {
      findOne: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      save: vi.fn((data) => Promise.resolve(data)),
      create: vi.fn((data) => data),
      createQueryBuilder: vi.fn(() => qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: getRepositoryToken(Category), useValue: repo }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('CU-17 ABM de categorías', () => {
    it('6b: rechaza crear una subcategoría cuyo padre ya es una subcategoría', async () => {
      repo.findOne.mockResolvedValue(baseCategory({ id: 'sub-1', parentId: 'cat-1' }));

      await expect(
        service.create({ name: 'Nueva', parentId: 'sub-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('6b: rechaza si la categoría padre indicada no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Nueva', parentId: 'inexistente' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('6a: rechaza un nombre duplicado en el mismo nivel', async () => {
      qb.getOne.mockResolvedValue(baseCategory({ name: 'Indumentaria' }));

      await expect(service.create({ name: 'Indumentaria' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('crea una categoría de primer nivel cuando los datos son válidos', async () => {
      const result = await service.create({ name: 'Calzado' });

      expect(result).toMatchObject({ name: 'Calzado', parentId: null, isVisible: true });
    });

    it('3c-2: bloquea la baja si la categoría tiene subcategorías activas', async () => {
      repo.findOne.mockResolvedValue(baseCategory());
      repo.count.mockResolvedValueOnce(2); // countChildren

      await expect(service.remove('cat-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('3c-1: bloquea la baja si la categoría tiene productos activos asociados', async () => {
      repo.findOne.mockResolvedValue(baseCategory());
      repo.count.mockResolvedValueOnce(0); // countChildren
      qb.getCount.mockResolvedValue(3); // productos activos

      await expect(service.remove('cat-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('3c: da de baja lógica cuando no hay subcategorías ni productos asociados', async () => {
      const category = baseCategory();
      repo.findOne.mockResolvedValue(category);
      repo.count.mockResolvedValueOnce(0);
      qb.getCount.mockResolvedValue(0);

      await service.remove('cat-1');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });

  describe('findDescendantIds (soporte de CU-04)', () => {
    it('expande una categoría padre a sus hijos directos', async () => {
      qb.getOne.mockReturnValue(undefined);
      const getMany = vi.fn().mockResolvedValue([baseCategory({ id: 'sub-1', parentId: 'cat-1' })]);
      repo.createQueryBuilder.mockReturnValue({ ...qb, getMany });

      const ids = await service.findDescendantIds(['cat-1']);

      expect(ids).toEqual(['cat-1', 'sub-1']);
    });
  });
});
