import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories/categories.service.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { ProductsService } from './products.service.js';
import { STORAGE_SERVICE } from '../../providers/storage/storage.interface.js';

const baseProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'product-1',
    name: 'Remera',
    description: 'desc',
    price: '100.00',
    isPublished: true,
    isActive: true,
    lowStockThreshold: null,
    version: 1,
    categories: [],
    variants: [],
    images: [],
    ...overrides,
  }) as Product;

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    productRepo = { findOne: vi.fn(), save: vi.fn((data) => Promise.resolve(data)) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: {} },
        { provide: getDataSourceToken(), useValue: { transaction: vi.fn() } },
        { provide: CategoriesService, useValue: { findByIds: vi.fn() } },
        { provide: STORAGE_SERVICE, useValue: { upload: vi.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('CU-16 ABM de productos', () => {
    it('3c-1: bloquea la baja si alguna variante tiene stock reservado', async () => {
      productRepo.findOne.mockResolvedValue(
        baseProduct({ variants: [{ id: 'v1', stockReserved: 2 } as ProductVariant] }),
      );

      await expect(service.remove('product-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('da de baja lógica cuando ninguna variante tiene stock reservado', async () => {
      productRepo.findOne.mockResolvedValue(
        baseProduct({ variants: [{ id: 'v1', stockReserved: 0 } as ProductVariant] }),
      );

      await service.remove('product-1');

      expect(productRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('rechaza operar sobre un producto inexistente', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('2a: rechaza la edición si la versión enviada quedó desactualizada', async () => {
      productRepo.findOne.mockResolvedValue(baseProduct({ version: 3 }));

      await expect(
        service.update('product-1', { version: 1, name: 'Nuevo nombre' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
