import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { CartService } from '../cart/cart.service.js';
import { PAYMENT_GATEWAY, PaymentGatewayUnavailableError } from '../payments/gateway/payment-gateway.interface.js';
import { StockReservationService } from '../products/stock/stock-reservation.service.js';
import { AddressesService } from '../users/addresses.service.js';
import { UsersService } from '../users/users.service.js';
import {
  CheckoutService,
  CheckoutStaleException,
  EmptyCartException,
  PaymentGatewayFailedException,
} from './checkout.service.js';
import { Order } from './entities/order.entity.js';
import { ShippingMethod } from './entities/shipping-method.entity.js';
import { OrderStatus } from './order-status.js';
import { OrdersService } from './orders.service.js';

const address = (overrides: Record<string, unknown> = {}) => ({
  id: 'addr-1',
  userId: 'user-1',
  alias: 'Casa',
  street: 'Calle',
  number: '123',
  floorApt: null,
  city: 'Córdoba',
  province: 'Córdoba',
  postalCode: '5000',
  phone: '351555',
  notes: null,
  ...overrides,
});

const shipping = { id: 'ship-1', name: 'Estándar', cost: '500.00', isActive: true };

const cartItem = (overrides: { price?: string; snapshot?: string; isPublished?: boolean; quantity?: number } = {}) => ({
  id: 'item-1',
  productId: 'product-1',
  variantId: 'variant-1',
  quantity: overrides.quantity ?? 2,
  unitPriceSnapshot: overrides.snapshot ?? '100.00',
  product: { id: 'product-1', name: 'Remera', price: overrides.price ?? '100.00', isActive: true, isPublished: overrides.isPublished ?? true },
  variant: { id: 'variant-1', attributes: { talle: 'M' } },
});

describe('CheckoutService', () => {
  let service: CheckoutService;
  let manager: { create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let cartService: Record<string, ReturnType<typeof vi.fn>>;
  let addressesService: { findOwnedActive: ReturnType<typeof vi.fn> };
  let shippingRepo: { find: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let orderRepo: { update: ReturnType<typeof vi.fn> };
  let stockReservation: { reserve: ReturnType<typeof vi.fn> };
  let ordersService: Record<string, ReturnType<typeof vi.fn>>;
  let gateway: { createPreference: ReturnType<typeof vi.fn> };

  const confirmDto = { addressId: 'addr-1', shippingMethodId: 'ship-1', expectedTotal: '700.00' };

  beforeEach(async () => {
    manager = {
      create: vi.fn((_entity, data) => data),
      save: vi.fn((data) => Promise.resolve(Array.isArray(data) ? data : { id: 'order-1', ...data })),
    };
    cartService = {
      revalidateForCheckout: vi.fn(),
      getCart: vi.fn(),
      lockActiveCartForCheckout: vi.fn().mockResolvedValue({ cart: { id: 'cart-1' }, items: [cartItem()] }),
      markAssociatedToOrder: vi.fn(),
      restoreAfterFailedCheckout: vi.fn().mockResolvedValue(true),
    };
    addressesService = { findOwnedActive: vi.fn().mockResolvedValue(address()) };
    shippingRepo = { find: vi.fn().mockResolvedValue([shipping]), findOne: vi.fn().mockResolvedValue(shipping) };
    orderRepo = { update: vi.fn() };
    stockReservation = { reserve: vi.fn().mockResolvedValue({ ok: true }) };
    ordersService = {
      recordHistory: vi.fn(),
      lockWithItems: vi.fn(),
      releaseReservation: vi.fn(),
      changeStatus: vi.fn(),
    };
    gateway = {
      createPreference: vi.fn().mockResolvedValue({ preferenceId: 'pref-1', redirectUrl: 'https://mp/checkout' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
        { provide: getRepositoryToken(ShippingMethod), useValue: shippingRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: CartService, useValue: cartService },
        { provide: AddressesService, useValue: addressesService },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'c@example.com' }) } },
        { provide: StockReservationService, useValue: stockReservation },
        { provide: OrdersService, useValue: ordersService },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(24) } },
      ],
    }).compile();

    service = moduleRef.get(CheckoutService);
  });

  describe('CU-03 Realizar checkout', () => {
    it('crea el pedido pendiente de pago, reserva stock, asocia el carrito y devuelve la URL de la pasarela', async () => {
      const result = await service.confirm('user-1', confirmDto);

      expect(result).toEqual({ orderId: 'order-1', redirectUrl: 'https://mp/checkout' });
      expect(manager.create).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          status: OrderStatus.PENDIENTE_PAGO,
          subtotal: '200.00',
          shippingCost: '500.00',
          total: '700.00',
          stockReservationActive: true,
          shippingAddressSnapshot: expect.objectContaining({ street: 'Calle', number: '123' }),
        }),
      );
      expect(stockReservation.reserve).toHaveBeenCalledWith(manager, [{ variantId: 'variant-1', quantity: 2 }]);
      expect(cartService.markAssociatedToOrder).toHaveBeenCalledWith(manager, 'cart-1');
      // Ítems + envío como línea aparte: la suma coincide con el total del pedido.
      expect(gateway.createPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          items: [
            expect.objectContaining({ title: 'Remera (M)', quantity: 2, unitPrice: 100 }),
            expect.objectContaining({ quantity: 1, unitPrice: 500 }),
          ],
        }),
      );
      expect(orderRepo.update).toHaveBeenCalledWith('order-1', { paymentPreferenceId: 'pref-1' });
    });

    it('2a: rechaza el checkout de un carrito vacío (o ya asociado por un doble click)', async () => {
      cartService.lockActiveCartForCheckout.mockResolvedValue(null);

      await expect(service.confirm('user-1', confirmDto)).rejects.toBeInstanceOf(EmptyCartException);
      expect(stockReservation.reserve).not.toHaveBeenCalled();
    });

    it('6a: rechaza una dirección incompleta', async () => {
      addressesService.findOwnedActive.mockResolvedValue(address({ phone: '  ' }));

      await expect(service.confirm('user-1', confirmDto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('6a: rechaza una dirección que no es del cliente', async () => {
      addressesService.findOwnedActive.mockResolvedValue(null);

      await expect(service.listShippingMethods('user-1', 'addr-ajena')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('7a: informa que no hay métodos de envío para la dirección', async () => {
      shippingRepo.find.mockResolvedValue([]);

      await expect(service.listShippingMethods('user-1', 'addr-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('13a: no crea el pedido si un producto dejó de estar disponible', async () => {
      cartService.lockActiveCartForCheckout.mockResolvedValue({
        cart: { id: 'cart-1' },
        items: [cartItem({ isPublished: false })],
      });

      const error = await service.confirm('user-1', confirmDto).catch((e) => e);
      expect(error).toBeInstanceOf(CheckoutStaleException);
      expect(error.problems).toEqual([{ type: 'unavailable', productName: 'Remera' }]);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('13a: no crea el pedido si el precio cambió desde la revalidación', async () => {
      cartService.lockActiveCartForCheckout.mockResolvedValue({
        cart: { id: 'cart-1' },
        items: [cartItem({ price: '120.00', snapshot: '100.00' })],
      });

      const error = await service.confirm('user-1', confirmDto).catch((e) => e);
      expect(error.problems).toEqual([expect.objectContaining({ type: 'price_changed', from: '100.00', to: '120.00' })]);
    });

    it('13a: no crea el pedido si el total recalculado difiere del que vio el cliente', async () => {
      const error = await service.confirm('user-1', { ...confirmDto, expectedTotal: '650.00' }).catch((e) => e);

      expect(error.problems).toEqual([{ type: 'total_changed', expected: '650.00', actual: '700.00' }]);
    });

    it('13a: no crea el pedido si otro pedido se llevó el stock (reserva atómica fallida)', async () => {
      stockReservation.reserve.mockResolvedValue({ ok: false, variantId: 'variant-1' });

      const error = await service.confirm('user-1', confirmDto).catch((e) => e);
      expect(error.problems).toEqual([{ type: 'insufficient_stock', productName: 'Remera' }]);
      // El throw dentro de la transacción hace rollback del pedido ya insertado.
      expect(cartService.markAssociatedToOrder).not.toHaveBeenCalled();
      expect(gateway.createPreference).not.toHaveBeenCalled();
    });

    it('17a: si la pasarela falla, cancela el pedido, libera el stock y restaura el carrito', async () => {
      gateway.createPreference.mockRejectedValue(new PaymentGatewayUnavailableError('timeout'));
      const order = { id: 'order-1', status: OrderStatus.PENDIENTE_PAGO, items: [] };
      ordersService.lockWithItems.mockResolvedValue(order);

      await expect(service.confirm('user-1', confirmDto)).rejects.toBeInstanceOf(PaymentGatewayFailedException);
      expect(ordersService.releaseReservation).toHaveBeenCalledWith(manager, order);
      expect(ordersService.changeStatus).toHaveBeenCalledWith(manager, order, OrderStatus.CANCELADO, expect.anything());
      expect(cartService.restoreAfterFailedCheckout).toHaveBeenCalledWith(manager, 'cart-1', 'user-1');
    });

    it('9-10: el resumen suma subtotal de ítems y costo fijo del envío', async () => {
      cartService.getCart.mockResolvedValue({ items: [{ subtotal: '200.00' }, { subtotal: '0.30' }] });

      const quote = await service.quote('user-1', 'addr-1', 'ship-1');

      expect(quote).toEqual(expect.objectContaining({ subtotal: '200.30', shippingCost: '500.00', total: '700.30' }));
    });
  });
});
