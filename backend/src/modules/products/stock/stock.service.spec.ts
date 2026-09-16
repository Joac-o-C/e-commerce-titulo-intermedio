import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service.js';
import { Product } from '../entities/product.entity.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from '../entities/stock-movement.entity.js';
import { StockService } from './stock.service.js';

const baseVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant =>
  ({
    id: 'variant-1',
    productId: 'product-1',
    sku: 'SKU-1',
    attributes: {},
    stockTotal: 10,
    stockReserved: 2,
    product: { id: 'product-1', name: 'Producto', isActive: true, lowStockThreshold: null } as Product,
    ...overrides,
  }) as ProductVariant;

describe('StockService', () => {
  let service: StockService;
  let variantRepo: { findOne: ReturnType<typeof vi.fn>; createQueryBuilder: ReturnType<typeof vi.fn> };
  let movementRepo: { find: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    variantRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn() };
    movementRepo = { find: vi.fn() };
    dataSource = {
      transaction: vi.fn(async (cb) =>
        cb({
          save: vi.fn((_entity, data) => Promise.resolve(data)),
          create: vi.fn((_entity, data) => data),
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(StockMovement), useValue: movementRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: CategoriesService, useValue: { findDescendantIds: vi.fn() } },
      ],
    }).compile();

    service = moduleRef.get(StockService);
  });

  describe('CU-18 Gestionar stock', () => {
    it('reposición: suma la cantidad al stock total', async () => {
      variantRepo.findOne.mockResolvedValue(baseVariant({ stockTotal: 10 }));

      const result = await service.adjust(
        'variant-1',
        { type: StockMovementType.REPOSICION, quantity: 5, reason: 'ingreso' },
        'admin-1',
      );

      expect(result.stockTotal).toBe(15);
    });

    it('merma: resta la cantidad al stock total', async () => {
      variantRepo.findOne.mockResolvedValue(baseVariant({ stockTotal: 10, stockReserved: 0 }));

      const result = await service.adjust(
        'variant-1',
        { type: StockMovementType.MERMA, quantity: 3, reason: 'rotura' },
        'admin-1',
      );

      expect(result.stockTotal).toBe(7);
    });

    it('ajuste: fija el stock total al valor indicado', async () => {
      variantRepo.findOne.mockResolvedValue(baseVariant({ stockTotal: 10, stockReserved: 0 }));

      const result = await service.adjust(
        'variant-1',
        { type: StockMovementType.AJUSTE, quantity: 20, reason: 'conteo físico' },
        'admin-1',
      );

      expect(result.stockTotal).toBe(20);
    });

    it('6b: rechaza un ajuste que dejaría el stock total por debajo del reservado', async () => {
      variantRepo.findOne.mockResolvedValue(baseVariant({ stockTotal: 10, stockReserved: 8 }));

      await expect(
        service.adjust('variant-1', { type: StockMovementType.MERMA, quantity: 5, reason: 'x' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('2a: rechaza ajustar el stock de un producto dado de baja', async () => {
      variantRepo.findOne.mockResolvedValue(
        baseVariant({ product: { id: 'product-1', name: 'Producto', isActive: false, lowStockThreshold: null } as Product }),
      );

      await expect(
        service.adjust('variant-1', { type: StockMovementType.REPOSICION, quantity: 1, reason: 'x' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza ajustar una variante inexistente', async () => {
      variantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.adjust('no-existe', { type: StockMovementType.REPOSICION, quantity: 1, reason: 'x' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marca isLowStock cuando el disponible cae dentro del umbral (CU-09)', async () => {
      variantRepo.findOne.mockResolvedValue(
        baseVariant({
          stockTotal: 10,
          stockReserved: 0,
          product: { id: 'product-1', name: 'Producto', isActive: true, lowStockThreshold: 3 } as Product,
        }),
      );

      const result = await service.adjust(
        'variant-1',
        { type: StockMovementType.AJUSTE, quantity: 2, reason: 'conteo' },
        'admin-1',
      );

      expect(result.isLowStock).toBe(true);
      expect(result.isOutOfStock).toBe(false);
    });

    it('3b: el historial no expone el passwordHash del actor', async () => {
      variantRepo.findOne.mockResolvedValue(baseVariant());
      movementRepo.find.mockResolvedValue([
        {
          id: 'mov-1',
          type: StockMovementType.REPOSICION,
          quantity: 5,
          resultingStockTotal: 15,
          reason: 'ingreso',
          createdAt: new Date(),
          actor: { id: 'admin-1', firstName: 'Admin', lastName: 'Test', passwordHash: 'secret' },
        },
      ]);

      const history = await service.history('variant-1');

      expect(history[0].actor).not.toHaveProperty('passwordHash');
    });
  });
});
