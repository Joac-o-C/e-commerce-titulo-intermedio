import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EmailTemplate } from '../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RefundOrigin } from '../payments/entities/refund.entity.js';
import { PAYMENT_GATEWAY } from '../payments/gateway/payment-gateway.interface.js';
import { PaymentLedgerService } from '../payments/ledger/payment-ledger.service.js';
import { RefundsService } from '../payments/refunds/refunds.service.js';
import { UsersService } from '../users/users.service.js';
import type { Order } from './entities/order.entity.js';
import { OrderCancellationService } from './order-cancellation.service.js';
import { OrderCancellationCause, OrderStatus } from './order-status.js';
import { OrdersService } from './orders.service.js';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    orderNumber: 7,
    userId: 'user-1',
    status: OrderStatus.PENDIENTE_PAGO,
    total: '700.00',
    paidAt: null,
    paymentPreferenceId: 'pref-1',
    items: [],
    ...overrides,
  }) as Order;

describe('OrderCancellationService', () => {
  let service: OrderCancellationService;
  const manager = {};
  let ordersService: Record<string, ReturnType<typeof vi.fn>>;
  let ledger: { requestRefund: ReturnType<typeof vi.fn> };
  let gateway: { expirePreference: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };
  let refunds: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ordersService = {
      lockWithItems: vi.fn(),
      // Simula el cambio real de estado para que el resto del flujo lo vea.
      changeStatus: vi.fn((_m, o: Order, to: OrderStatus) => {
        o.status = to;
      }),
      returnStockOnCancel: vi.fn(),
      appendInternalNote: vi.fn(),
    };
    ledger = { requestRefund: vi.fn().mockResolvedValue({ id: 'refund-1' }) };
    gateway = { expirePreference: vi.fn().mockResolvedValue(undefined) };
    notifications = { send: vi.fn() };

    refunds = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderCancellationService,
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: OrdersService, useValue: ordersService },
        { provide: PaymentLedgerService, useValue: ledger },
        { provide: NotificationsService, useValue: notifications },
        { provide: RefundsService, useValue: refunds },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'c@example.com' }) } },
      ],
    }).compile();

    service = moduleRef.get(OrderCancellationService);
  });

  describe('CU-14 Cancelar pedido', () => {
    it('cancela un pedido impago: estado, stock, sin reembolso (7b), vence la preferencia y avisa por correo', async () => {
      const o = order();
      ordersService.lockWithItems.mockResolvedValue(o);

      const result = await service.cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO });

      expect(result).toEqual({ refundRequested: false });
      expect(ordersService.changeStatus).toHaveBeenCalledWith(
        manager,
        o,
        OrderStatus.CANCELADO,
        expect.objectContaining({ actorId: 'user-1', cancellationCause: OrderCancellationCause.CLIENTE }),
      );
      expect(ordersService.returnStockOnCancel).toHaveBeenCalledWith(manager, o, 'user-1');
      expect(ledger.requestRefund).not.toHaveBeenCalled();
      expect(gateway.expirePreference).toHaveBeenCalledWith('pref-1');
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ template: EmailTemplate.CANCELACION }));
    });

    it('7: con pago acreditado registra el reembolso del total (include CU-21) y no toca la preferencia', async () => {
      const o = order({ status: OrderStatus.PAGADO, paidAt: new Date() });
      ordersService.lockWithItems.mockResolvedValue(o);

      const result = await service.cancelByCustomer('user-1', 'order-1', {
        expectedStatus: OrderStatus.PAGADO,
        reason: 'Me equivoqué de talle',
      });

      expect(result).toEqual({ refundRequested: true });
      expect(ledger.requestRefund).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ orderId: 'order-1', amount: '700.00', originCu: RefundOrigin.CU_14 }),
      );
      expect(gateway.expirePreference).not.toHaveBeenCalled();
    });

    it('7a: si el reembolso no se puede registrar, la cancelación queda firme y se anota para el Administrador', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.PAGADO, paidAt: new Date() }));
      ledger.requestRefund.mockResolvedValue(null);

      const result = await service.cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PAGADO });

      expect(result).toEqual({ refundRequested: false });
      expect(ordersService.appendInternalNote).toHaveBeenCalled();
    });

    it('2b: un pedido ajeno responde como inexistente', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ userId: 'otro' }));

      await expect(
        service.cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('2a: no cancela un pedido ya despachado', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.DESPACHADO }));

      const error = await service
        .cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.DESPACHADO })
        .catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ORDER_NOT_CANCELLABLE' }));
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
    });

    it('2c: no cancela si pasaron más de 24 h desde la acreditación del pago', async () => {
      const paidAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.EN_PREPARACION, paidAt }));

      const error = await service
        .cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.EN_PREPARACION })
        .catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'CANCEL_WINDOW_EXPIRED' }));
    });

    it('5a: si el estado cambió desde que el Cliente lo vio, informa el nuevo y no cancela', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.PAGADO, paidAt: new Date() }));

      const error = await service
        .cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'ORDER_STATUS_CHANGED', currentStatus: OrderStatus.PAGADO }),
      );
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
    });

    it('8a: si vencer la preferencia falla, la cancelación no se revierte', async () => {
      ordersService.lockWithItems.mockResolvedValue(order());
      gateway.expirePreference.mockRejectedValue(new Error('timeout'));

      await expect(
        service.cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO }),
      ).resolves.toEqual({ refundRequested: false });
      expect(notifications.send).toHaveBeenCalled();
    });
  
    it('8a: si falla el correo después del commit, la cancelación responde bien igual', async () => {
      ordersService.lockWithItems.mockResolvedValue(order());
      notifications.send.mockRejectedValue(new Error('EmailLog caído'));

      await expect(
        service.cancelByCustomer('user-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO }),
      ).resolves.toEqual({ refundRequested: false });
    });
  });

  describe('CU-19 Ver y gestionar pedidos (admin), flujo 5a', () => {
    const adminCancel = (o: Order) =>
      service.applyCancellation(manager as never, o, {
        actorId: 'admin-1',
        cause: OrderCancellationCause.ADMINISTRADOR,
        reason: 'Sospecha de fraude',
        refundOrigin: RefundOrigin.CU_19,
      });

    it('antes del despacho reingresa el stock y reembolsa el total, como CU-14', async () => {
      const o = order({ status: OrderStatus.EN_PREPARACION, paidAt: new Date(), subtotal: '600.00' });

      await adminCancel(o);

      expect(ordersService.returnStockOnCancel).toHaveBeenCalledWith(manager, o, 'admin-1');
      expect(ledger.requestRefund).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ amount: '700.00', originCu: RefundOrigin.CU_19 }),
      );
    });

    it('un pedido despachado no reingresa stock (vuelve por CU-18) y se reembolsa sin el envío', async () => {
      const o = order({ status: OrderStatus.DESPACHADO, paidAt: new Date(), subtotal: '600.00' });

      const effects = await adminCancel(o);

      expect(ordersService.returnStockOnCancel).not.toHaveBeenCalled();
      expect(ledger.requestRefund).toHaveBeenCalledWith(manager, expect.objectContaining({ amount: '600.00' }));
      expect(effects).toEqual({ refundRequested: true, refundId: 'refund-1', previousStatus: OrderStatus.DESPACHADO });
    });
  });
});
