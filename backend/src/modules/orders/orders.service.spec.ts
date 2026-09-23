import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { StockReservationService } from '../products/stock/stock-reservation.service.js';
import { Order } from './entities/order.entity.js';
import { OrderCancellationCause, OrderStatus } from './order-status.js';
import { OrdersService } from './orders.service.js';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    status: OrderStatus.PENDIENTE_PAGO,
    stockReservationActive: true,
    reservationExpiresAt: new Date('2026-01-02T00:00:00Z'),
    internalNotes: null,
    items: [{ variantId: 'variant-1', quantity: 2, productNameSnapshot: 'Remera' }],
    ...overrides,
  }) as Order;

describe('OrdersService', () => {
  let service: OrdersService;
  let manager: {
    update: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let orderRepo: { find: ReturnType<typeof vi.fn> };
  let stock: { release: ReturnType<typeof vi.fn>; confirmSale: ReturnType<typeof vi.fn>; reserve: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    manager = {
      update: vi.fn(),
      save: vi.fn(),
      create: vi.fn((_entity, data) => data),
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
    };
    orderRepo = { find: vi.fn() };
    stock = { release: vi.fn(), confirmSale: vi.fn().mockResolvedValue([]), reserve: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
        { provide: StockReservationService, useValue: stock },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('exige la causa al cancelar un pedido', async () => {
    await expect(service.changeStatus(manager as never, order(), OrderStatus.CANCELADO)).rejects.toThrow('causa');
  });

  it('rechaza una transición de estado que no está en el grafo', async () => {
    await expect(service.changeStatus(manager as never, order({ status: OrderStatus.ENTREGADO }), OrderStatus.PAGADO)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('CU-05 Procesar confirmación de pago', () => {
    it('7.a: aprobado → "pagado" con descuento firme del stock reservado', async () => {
      const o = order();

      const result = await service.applyPaymentOutcome(manager as never, o, 'aprobado', 'pay-1');

      expect(result.changed).toBe(true);
      expect(o.status).toBe(OrderStatus.PAGADO);
      expect(stock.confirmSale).toHaveBeenCalledWith(manager, [{ variantId: 'variant-1', quantity: 2 }], expect.objectContaining({ reservationActive: true }));
      expect(o.stockReservationActive).toBe(false);
    });

    it('7a-1: aprobado con la reserva vencida y sin stock → "pagado" igual, con el faltante anotado', async () => {
      const o = order({
        status: OrderStatus.CANCELADO,
        cancellationCause: OrderCancellationCause.RESERVA_VENCIDA,
        stockReservationActive: false,
      });
      stock.confirmSale.mockResolvedValue([{ variantId: 'variant-1', quantity: 2 }]);

      const result = await service.applyPaymentOutcome(manager as never, o, 'aprobado', 'pay-1');

      expect(stock.confirmSale).toHaveBeenCalledWith(manager, expect.anything(), expect.objectContaining({ reservationActive: false }));
      expect(o.status).toBe(OrderStatus.PAGADO);
      expect(result.shortages).toHaveLength(1);
      expect(o.internalNotes).toContain('Remera ×2');
    });

    it('aprobado sobre un pedido ya pagado: no descuenta stock de nuevo y lo marca como discrepancia (doble cobro)', async () => {
      const result = await service.applyPaymentOutcome(manager as never, order({ status: OrderStatus.PAGADO }), 'aprobado', 'pay-2');

      expect(result).toEqual({ changed: false, discrepancy: expect.stringContaining('doble cobro') });
      expect(stock.confirmSale).not.toHaveBeenCalled();
    });

    it('aprobado sobre un pedido cancelado a propósito (cliente/admin/pasarela): no lo revive, queda para reembolso', async () => {
      const o = order({ status: OrderStatus.CANCELADO, cancellationCause: OrderCancellationCause.CLIENTE, stockReservationActive: false });

      const result = await service.applyPaymentOutcome(manager as never, o, 'aprobado', 'pay-1');

      expect(result).toEqual({ changed: false, discrepancy: expect.stringContaining('requiere reembolso') });
      expect(o.status).toBe(OrderStatus.CANCELADO);
      expect(stock.confirmSale).not.toHaveBeenCalled();
    });

    it('7.c tras un rechazo: vuelve a reservar el stock y pasa a "pago pendiente de acreditación"', async () => {
      const o = order({ status: OrderStatus.PAGO_RECHAZADO, stockReservationActive: false });
      stock.reserve.mockResolvedValue({ ok: true });

      const result = await service.applyPaymentOutcome(manager as never, o, 'pendiente', 'pay-2');

      expect(result.changed).toBe(true);
      expect(o.status).toBe(OrderStatus.PAGO_PENDIENTE_ACREDITACION);
      expect(o.stockReservationActive).toBe(true);
    });

    it('7.c tras un rechazo sin stock para re-reservar: pasa a pendiente igual y lo anota', async () => {
      const o = order({ status: OrderStatus.PAGO_RECHAZADO, stockReservationActive: false });
      stock.reserve.mockResolvedValue({ ok: false, variantId: 'variant-1' });

      await service.applyPaymentOutcome(manager as never, o, 'pendiente', 'pay-2');

      expect(o.status).toBe(OrderStatus.PAGO_PENDIENTE_ACREDITACION);
      expect(o.stockReservationActive).toBe(false);
      expect(o.internalNotes).toContain('no se pudo volver a reservar');
    });

    it('7.b: rechazado → "pago rechazado" y libera la reserva', async () => {
      const o = order();

      const result = await service.applyPaymentOutcome(manager as never, o, 'rechazado', 'pay-1');

      expect(result.changed).toBe(true);
      expect(o.status).toBe(OrderStatus.PAGO_RECHAZADO);
      expect(stock.release).toHaveBeenCalledWith(manager, [{ variantId: 'variant-1', quantity: 2 }]);
    });

    it('7b-1: rechazado sobre un pedido ya pagado no lo revierte', async () => {
      const o = order({ status: OrderStatus.PAGADO, stockReservationActive: false });

      const result = await service.applyPaymentOutcome(manager as never, o, 'rechazado', 'pay-1');

      expect(result.changed).toBe(false);
      expect(result.discrepancy).toBeDefined();
      expect(o.status).toBe(OrderStatus.PAGADO);
      expect(stock.release).not.toHaveBeenCalled();
    });

    it('7.c: pendiente → "pago pendiente de acreditación" manteniendo la reserva', async () => {
      const o = order();

      const result = await service.applyPaymentOutcome(manager as never, o, 'pendiente', 'pay-1');

      expect(result.changed).toBe(true);
      expect(o.status).toBe(OrderStatus.PAGO_PENDIENTE_ACREDITACION);
      expect(stock.release).not.toHaveBeenCalled();
      expect(o.stockReservationActive).toBe(true);
    });
  });

  describe('CU-03 Realizar checkout', () => {
    it('18a: al vencer la reserva libera el stock y pasa el pedido a "cancelado"', async () => {
      orderRepo.find.mockResolvedValue([{ id: 'order-1' }]);
      const o = order();
      manager.findOne.mockResolvedValue(o);
      manager.find.mockResolvedValue(o.items);

      const expired = await service.expireReservations(new Date('2026-01-03T00:00:00Z'));

      expect(expired).toBe(1);
      expect(stock.release).toHaveBeenCalled();
      expect(o.status).toBe(OrderStatus.CANCELADO);
      expect(o.cancellationCause).toBe(OrderCancellationCause.RESERVA_VENCIDA);
    });

    it('18a: no cancela si al tomar el lock el pedido ya se pagó (el webhook ganó la carrera)', async () => {
      orderRepo.find.mockResolvedValue([{ id: 'order-1' }]);
      manager.findOne.mockResolvedValue(order({ status: OrderStatus.PAGADO }));

      const expired = await service.expireReservations(new Date('2026-01-03T00:00:00Z'));

      expect(expired).toBe(0);
      expect(stock.release).not.toHaveBeenCalled();
    });
  });
});
