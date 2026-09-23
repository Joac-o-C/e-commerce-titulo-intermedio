import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart, CartStatus } from './entities/cart.entity.js';
import { CartService } from './cart.service.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ProductsService } from '../products/products.service.js';

const baseCart = (overrides: Partial<Cart> = {}): Cart =>
  ({ id: 'cart-1', userId: 'user-1', status: CartStatus.ACTIVO, ...overrides }) as Cart;

const baseProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'product-1',
  name: 'Producto',
  price: '100.00',
  isActive: true,
  isPublished: true,
  ...overrides,
});

const baseVariant = (overrides: Record<string, unknown> = {}) => ({
  id: 'variant-1',
  attributes: {},
  stockTotal: 10,
  stockReserved: 0,
  get stockAvailable() {
    return (this.stockTotal as number) - (this.stockReserved as number);
  },
  ...overrides,
});

describe('CartService', () => {
  let service: CartService;
  let cartRepo: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let itemRepo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let productsService: { resolveVariantForPurchase: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    cartRepo = {
      findOne: vi.fn(),
      save: vi.fn((data) => Promise.resolve({ ...data, id: data.id ?? 'cart-1' })),
      create: vi.fn((data) => data),
    };
    itemRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn((data) => Promise.resolve({ ...data, id: data.id ?? 'item-1' })),
      create: vi.fn((data) => data),
      remove: vi.fn(),
      delete: vi.fn(),
    };
    productsService = { resolveVariantForPurchase: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: cartRepo },
        { provide: getRepositoryToken(CartItem), useValue: itemRepo },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    service = moduleRef.get(CartService);
  });

  describe('CU-02 Agregar producto al carrito', () => {
    it('agrega un ítem nuevo con el precio vigente del catálogo', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValueOnce(null); // no existía la variante en el carrito
      productsService.resolveVariantForPurchase.mockResolvedValue({
        product: baseProduct({ price: '150.00' }),
        variant: baseVariant(),
      });
      itemRepo.find.mockResolvedValue([]);

      await service.addItem('user-1', 'variant-1', 2);

      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ cartId: 'cart-1', variantId: 'variant-1', quantity: 2, unitPriceSnapshot: '150.00' }),
      );
    });

    it('incrementa la cantidad si la variante ya estaba en el carrito', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 1 });
      productsService.resolveVariantForPurchase.mockResolvedValue({
        product: baseProduct(),
        variant: baseVariant(),
      });

      await service.addItem('user-1', 'variant-1', 2);

      expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }));
    });

    it('3a: informa el máximo disponible sin ajustar la cantidad', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue(null);
      productsService.resolveVariantForPurchase.mockResolvedValue({
        product: baseProduct(),
        variant: baseVariant({ stockTotal: 3, stockReserved: 0 }),
      });

      await expect(service.addItem('user-1', 'variant-1', 5)).rejects.toMatchObject({ maxAvailable: 3 });
      expect(itemRepo.save).not.toHaveBeenCalled();
    });

    it('3b: rechaza producto/variante dado de baja o despublicado', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue(null);
      productsService.resolveVariantForPurchase.mockRejectedValue(new NotFoundException());

      await expect(service.addItem('user-1', 'variant-1', 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(itemRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('CU-11 Modificar o quitar ítem del carrito', () => {
    it('actualiza cantidad y precio si cambió en el catálogo', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 1 });
      productsService.resolveVariantForPurchase.mockResolvedValue({
        product: baseProduct({ price: '200.00' }),
        variant: baseVariant(),
      });

      await service.updateItemQuantity('user-1', 'item-1', 4);

      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 4, unitPriceSnapshot: '200.00' }),
      );
    });

    it('3a: quita un ítem del carrito', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      const item = { id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 1 };
      itemRepo.findOne.mockResolvedValue(item);

      await service.removeItem('user-1', 'item-1');

      expect(itemRepo.remove).toHaveBeenCalledWith(item);
    });

    it('3b: vacía el carrito', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());

      await service.clearCart('user-1');

      expect(itemRepo.delete).toHaveBeenCalledWith({ cartId: 'cart-1' });
    });

    it('5a: rechaza cantidad inválida (0, negativa o no entera) antes de llegar al service', async () => {
      // La validación vive en el DTO (ValidationPipe global), no en el
      // service: el ítem nunca cambia porque el request ni pasa el pipe.
      for (const quantity of [0, -1, 1.5]) {
        const dto = plainToInstance(UpdateItemDto, { quantity });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });

    it('6a: informa el máximo disponible al subir cantidad', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 1 });
      productsService.resolveVariantForPurchase.mockResolvedValue({
        product: baseProduct(),
        variant: baseVariant({ stockTotal: 3, stockReserved: 0 }),
      });

      await expect(service.updateItemQuantity('user-1', 'item-1', 5)).rejects.toMatchObject({ maxAvailable: 3 });
    });

    it('6b: permite bajar/quitar pero no subir un ítem no disponible', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 5 });
      productsService.resolveVariantForPurchase.mockRejectedValue(new NotFoundException());

      // Bajar: no consulta disponibilidad, se permite.
      await service.updateItemQuantity('user-1', 'item-1', 2);
      expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));

      // Subir: rechazado porque el producto ya no está disponible.
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 2 });
      await expect(service.updateItemQuantity('user-1', 'item-1', 3)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('6c: rechaza un itemId que no pertenece al carrito del usuario', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue(null);

      await expect(service.removeItem('user-1', 'item-ajeno')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('9a: rechaza cualquier mutación si el carrito ya está asociado a un pedido', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart({ status: CartStatus.ASOCIADO_A_PEDIDO }));

      await expect(service.clearCart('user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Fusión de carrito de invitado (CU-06)', () => {
    it('preview: reporta ok/recortado/no-disponible sin persistir nada', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue(null);
      productsService.resolveVariantForPurchase.mockImplementation((variantId: string) => {
        if (variantId === 'variant-ok') return Promise.resolve({ product: baseProduct(), variant: baseVariant() });
        if (variantId === 'variant-corto')
          return Promise.resolve({ product: baseProduct(), variant: baseVariant({ stockTotal: 1, stockReserved: 0 }) });
        return Promise.reject(new NotFoundException());
      });

      const results = await service.previewMerge('user-1', [
        { variantId: 'variant-ok', quantity: 1 },
        { variantId: 'variant-corto', quantity: 5 },
        { variantId: 'variant-baja', quantity: 1 },
      ]);

      expect(results).toEqual([
        { variantId: 'variant-ok', requestedQuantity: 1, outcome: 'ok' },
        { variantId: 'variant-corto', requestedQuantity: 5, outcome: 'insufficient_stock', maxAvailable: 1 },
        { variantId: 'variant-baja', requestedQuantity: 1, outcome: 'unavailable' },
      ]);
      expect(itemRepo.save).not.toHaveBeenCalled();
    });

    it('confirm: aplica sólo lo que el usuario confirmó', async () => {
      cartRepo.findOne.mockResolvedValue(baseCart());
      itemRepo.findOne.mockResolvedValue(null);
      productsService.resolveVariantForPurchase.mockImplementation((variantId: string) => {
        if (variantId === 'variant-ok') return Promise.resolve({ product: baseProduct(), variant: baseVariant() });
        return Promise.reject(new NotFoundException());
      });

      const result = await service.confirmMerge('user-1', [
        { variantId: 'variant-ok', quantity: 1 },
        { variantId: 'variant-baja', quantity: 1 },
      ]);

      expect(result.merged).toEqual([{ variantId: 'variant-ok', requestedQuantity: 1, outcome: 'ok' }]);
      expect(result.skipped).toEqual([{ variantId: 'variant-baja', requestedQuantity: 1, outcome: 'unavailable' }]);
      expect(itemRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
