import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories/categories.service.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity.js';
import { ProductsService } from './products.service.js';
import { STORAGE_SERVICE } from '../../providers/storage/storage.interface.js';

const variant = (id: string, talle: string, overrides: Partial<ProductVariant> = {}) =>
  ({
    id,
    productId: 'product-1',
    sku: `REM-${talle}`,
    attributes: { Talle: talle },
    stockTotal: 10,
    stockReserved: 0,
    position: 0,
    isActive: true,
    get stockAvailable() {
      return this.stockTotal - this.stockReserved;
    },
    ...overrides,
  }) as ProductVariant;

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
  let variantRepo: { findOne: ReturnType<typeof vi.fn>; createQueryBuilder: ReturnType<typeof vi.fn> };
  // Variantes vigentes en la base y lo que se guardó en la transacción.
  let stored: ProductVariant[];
  let saved: { entity: unknown; rows: unknown[] }[];
  let manager: Record<string, ReturnType<typeof vi.fn>>;
  // Bump condicional de `version` (CU-16 2a): filas afectadas.
  let versionBump: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    productRepo = { findOne: vi.fn(), save: vi.fn((data) => Promise.resolve(data)) };
    const skuQuery = { where: vi.fn(), andWhere: vi.fn(), getOne: vi.fn().mockResolvedValue(null) };
    skuQuery.where.mockReturnValue(skuQuery);
    skuQuery.andWhere.mockReturnValue(skuQuery);
    variantRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn().mockReturnValue(skuQuery) };
    stored = [];
    saved = [];
    versionBump = { execute: vi.fn().mockResolvedValue({ affected: 1 }) };
    const updateQuery = { update: vi.fn(), set: vi.fn(), where: vi.fn(), execute: versionBump.execute };
    updateQuery.update.mockReturnValue(updateQuery);
    updateQuery.set.mockReturnValue(updateQuery);
    updateQuery.where.mockReturnValue(updateQuery);
    manager = {
      createQueryBuilder: vi.fn(() => updateQuery),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn(() => Promise.resolve(stored)),
      create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
      save: vi.fn((entity: unknown, rows: unknown) => {
        saved.push({ entity, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve(rows);
      }),
      findOne: vi.fn(() => Promise.resolve(baseProduct({ variants: stored }))),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
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

    it('2a: rechaza la edición si otro guardado subió la versión entre el chequeo y la transacción', async () => {
      productRepo.findOne.mockResolvedValue(baseProduct({ version: 1 }));
      versionBump.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.update('product-1', { version: 1, name: 'Nuevo nombre' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(saved).toEqual([]);
    });
  });

  describe('CU-16 ABM de productos (edición de variantes)', () => {
    const savedVariants = () => saved.filter((s) => s.entity === ProductVariant).flatMap((s) => s.rows) as ProductVariant[];
    const savedMovements = () => saved.filter((s) => s.entity === StockMovement).flatMap((s) => s.rows) as StockMovement[];
    const edit = (variants: object[]) =>
      service.update('product-1', { version: 1, variants } as never, [], 'admin-1');
    const asInput = (v: ProductVariant, extra: object = {}) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes,
      stockTotal: v.stockTotal,
      originalStockTotal: v.stockTotal,
      ...extra,
    });

    beforeEach(() => {
      stored = [variant('s', 'S', { position: 0 }), variant('m', 'M', { position: 1 }), variant('l', 'L', { position: 2 })];
      productRepo.findOne.mockResolvedValue(baseProduct({ variants: stored }));
    });

    it('3a: actualiza las variantes en su lugar (sin borrarlas) y la posición sigue el orden de la lista', async () => {
      const [s, m, l] = stored;
      await edit([asInput(l), asInput(s), asInput(m)]);

      expect(manager.delete).toBeUndefined();
      expect(savedVariants().map((v) => [v.id, v.position, v.isActive])).toEqual([
        ['l', 0, true],
        ['s', 1, true],
        ['m', 2, true],
      ]);
      expect(savedMovements()).toEqual([]);
    });

    it('3a: una variante nueva se crea al final con su stock inicial y sin movimiento', async () => {
      const [s, m, l] = stored;
      await edit([asInput(s), asInput(m), asInput(l), { sku: 'REM-XXL', attributes: { Talle: 'XXL' }, stockTotal: 4 }]);

      expect(savedVariants().at(-1)).toEqual({
        productId: 'product-1',
        sku: 'REM-XXL',
        attributes: { Talle: 'XXL' },
        stockTotal: 4,
        position: 3,
      });
      expect(savedMovements()).toEqual([]);
    });

    it('3a: la variante que no viene en la lista queda dada de baja lógica', async () => {
      const [s, , l] = stored;
      await edit([asInput(s), asInput(l)]);

      expect(savedVariants().find((v) => v.id === 'm')).toMatchObject({ isActive: false });
      expect(savedVariants().filter((v) => v.isActive).map((v) => [v.id, v.position])).toEqual([
        ['s', 0],
        ['l', 1],
      ]);
    });

    it('3a: una variante dada de baja que vuelve a la lista se reactiva, en la posición indicada', async () => {
      stored[1].isActive = false;
      const [s, m, l] = stored;
      await edit([asInput(s), asInput(l), asInput(m)]);

      expect(savedVariants().map((v) => [v.id, v.position, v.isActive])).toEqual([
        ['s', 0, true],
        ['l', 1, true],
        ['m', 2, true],
      ]);
    });

    it('3a: no crea una variante nueva con el SKU de una dada de baja (se reactiva esa)', async () => {
      stored[1].isActive = false;
      const [s, , l] = stored;

      await expect(edit([asInput(s), asInput(l), { sku: 'REM-M', stockTotal: 1 }])).rejects.toThrow(/dada de baja: reactivala/);
      expect(savedVariants()).toEqual([]);
    });

    it('3a: no deja quitar una variante con stock reservado por pedidos en curso', async () => {
      stored[1].stockReserved = 2;
      const [s, , l] = stored;

      await expect(edit([asInput(s), asInput(l)])).rejects.toThrow(/"M" \(REM-M\).*reservado/);
      expect(savedVariants()).toEqual([]);
    });

    it('3a: un cambio de stock queda como movimiento "ajuste" con el Administrador como actor (CU-18)', async () => {
      const [s, m, l] = stored;
      await edit([asInput(s, { stockTotal: 25 }), asInput(m), asInput(l)]);

      expect(savedVariants()[0]).toMatchObject({ id: 's', stockTotal: 25 });
      expect(savedMovements()).toEqual([
        expect.objectContaining({
          variantId: 's',
          type: StockMovementType.AJUSTE,
          quantity: 25,
          resultingStockTotal: 25,
          actorId: 'admin-1',
        }),
      ]);
    });

    it('3a: guardar sin tocar el stock conserva el de la base aunque se haya movido mientras tanto', async () => {
      const [s, m, l] = stored;
      const inputs = [asInput(s), asInput(m), asInput(l)];
      s.stockTotal = 8; // un pedido pagado descontó 2 con el formulario abierto

      await edit(inputs);

      expect(savedVariants()[0]).toMatchObject({ id: 's', stockTotal: 8 });
      expect(savedMovements()).toEqual([]);
    });

    it('3a: rechaza un cambio de stock si la base se movió mientras se editaba', async () => {
      const [s, m, l] = stored;
      const inputs = [asInput(s, { stockTotal: 25 }), asInput(m), asInput(l)];
      s.stockTotal = 8;

      await expect(edit(inputs)).rejects.toThrow(/cambió mientras editabas \(ahora es 8\)/);
      expect(savedVariants()).toEqual([]);
      expect(savedMovements()).toEqual([]);
    });

    it('3a: rechaza dejar el stock total por debajo del reservado (CU-18 6b)', async () => {
      stored[0].stockReserved = 6;
      const [s, m, l] = stored;

      await expect(edit([asInput(s, { stockTotal: 5 }), asInput(m), asInput(l)])).rejects.toBeInstanceOf(BadRequestException);
      expect(savedVariants()).toEqual([]);
      expect(savedMovements()).toEqual([]);
    });

    it('3a: quitar una fila y cargar otra con el mismo SKU reusa la variante, con su stock', async () => {
      stored[1].stockTotal = 7;
      const [s, , l] = stored;

      await edit([asInput(s), asInput(l), { sku: 'REM-M', attributes: { Talle: 'Mediano' }, stockTotal: 0 }]);

      expect(savedVariants().filter((v) => v.id === 'm')).toEqual([
        expect.objectContaining({ isActive: true, position: 2, attributes: { Talle: 'Mediano' }, stockTotal: 7 }),
      ]);
      expect(savedVariants().every((v) => v.id !== undefined)).toBe(true);
      expect(savedMovements()).toEqual([]);
    });

    it('3a: no deja renombrar una variante al SKU de otra que se está quitando', async () => {
      const [s, , l] = stored;

      await expect(edit([asInput(s, { sku: 'REM-M' }), asInput(l)])).rejects.toThrow(/"REM-M" es de la variante "M" \(REM-M\), que estás quitando/);
      expect(savedVariants()).toEqual([]);
    });

    it('3a: no deja renombrar una variante al SKU de una dada de baja', async () => {
      stored[1].isActive = false;
      const [s, , l] = stored;

      await expect(edit([asInput(s, { sku: 'REM-M' }), asInput(l)])).rejects.toThrow(/"REM-M" es de una variante dada de baja de este producto/);
    });

    it('3a: dos variantes pueden intercambiar sus SKU (pasan antes por uno temporal)', async () => {
      const [s, m, l] = stored;
      await edit([asInput(s, { sku: 'REM-M' }), asInput(m, { sku: 'REM-S' }), asInput(l)]);

      expect(manager.update).toHaveBeenCalledTimes(1);
      expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(manager.save.mock.invocationCallOrder.at(-1)!);
      expect(savedVariants().map((v) => [v.id, v.sku])).toEqual([
        ['s', 'REM-M'],
        ['m', 'REM-S'],
        ['l', 'REM-L'],
      ]);
    });

    it('3a: rechaza una variante que ya no existe (editada en paralelo)', async () => {
      await expect(edit([{ id: '00000000-0000-4000-8000-000000000000', sku: 'X', stockTotal: 1 }])).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('3a: la respuesta trae sólo las variantes vigentes, en su orden', async () => {
      manager.findOne.mockResolvedValue(
        baseProduct({
          variants: [variant('l', 'L', { position: 1 }), variant('m', 'M', { isActive: false }), variant('s', 'S', { position: 0 })],
        }),
      );
      const [s, , l] = stored;

      const result = await edit([asInput(s), asInput(l)]);

      expect(result.variants.map((v) => v.id)).toEqual(['s', 'l']);
      expect(result.inactiveVariants.map((v) => v.id)).toEqual(['m']);
    });
  });

  describe('CU-09 Ver detalle de producto', () => {
    it('muestra las variantes vigentes en el orden fijado por el Administrador', async () => {
      productRepo.findOne.mockResolvedValue(
        baseProduct({
          variants: [
            variant('xl', 'XL', { position: 3 }),
            variant('s', 'S', { position: 0 }),
            variant('m', 'M', { position: 1, isActive: false }),
            variant('l', 'L', { position: 2 }),
          ],
        }),
      );

      const detail = await service.findPublicDetail('product-1');

      expect(detail.variants.map((v) => v.attributes.Talle)).toEqual(['S', 'L', 'XL']);
      expect(detail.stockAvailable).toBe(30);
    });
  });

  describe('CU-02 Agregar producto al carrito', () => {
    it('una variante dada de baja no se puede comprar', async () => {
      variantRepo.findOne.mockResolvedValue(variant('m', 'M', { isActive: false, product: baseProduct() }));

      await expect(service.resolveVariantForPurchase('m')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
