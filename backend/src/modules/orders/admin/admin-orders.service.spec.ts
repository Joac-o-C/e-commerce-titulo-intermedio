import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { RefundOrigin, RefundStatus } from '../../payments/entities/refund.entity.js';
import { PaymentLedgerService } from '../../payments/ledger/payment-ledger.service.js';
import { RefundsService } from '../../payments/refunds/refunds.service.js';
import { UsersService } from '../../users/users.service.js';
import { Order } from '../entities/order.entity.js';
import { OrderCancellationService } from '../order-cancellation.service.js';
import { OrderCancellationCause, OrderStatus } from '../order-status.js';
import { OrdersService } from '../orders.service.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { AdminCancelReason } from './dto/admin-cancel-order.dto.js';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    orderNumber: 7,
    userId: 'user-1',
    status: OrderStatus.PAGADO,
    paidAt: new Date('2026-09-01T12:00:00Z'),
    createdAt: new Date('2026-09-01T15:30:00Z'),
    subtotal: '600.00',
    shippingCost: '100.00',
    total: '700.00',
    trackingCarrier: null,
    trackingNumber: null,
    dispatchedAt: null,
    reservationExpiresAt: null,
    cancellationCause: null,
    deliveredAt: null,
    shippingMethodSnapshot: { name: 'Envío estándar', cost: '100.00' },
    shippingAddressSnapshot: { street: 'Calle', number: '1', floorApt: null, city: 'Córdoba', province: 'Córdoba', postalCode: '5000' },
    user: { id: 'user-1', firstName: 'Ana', lastName: 'Cliente', email: 'ana@example.com', passwordHash: 'secreto' },
    items: [],
    ...overrides,
  }) as unknown as Order;

/** QueryBuilder encadenable: registra cada llamada y resuelve lo que se le indique. */
function queryBuilder(result: { many?: unknown[]; count?: number; raw?: unknown[] } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const qb: Record<string, unknown> = {};
  for (const method of ['innerJoinAndSelect', 'andWhere', 'orderBy', 'addOrderBy', 'offset', 'limit', 'select', 'addSelect', 'where', 'groupBy']) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getManyAndCount = () => Promise.resolve([result.many ?? [], result.count ?? 0]);
  qb.getMany = () => Promise.resolve(result.many ?? []);
  qb.getRawMany = () => Promise.resolve(result.raw ?? []);
  return { qb, calls, sql: () => calls.map((c) => String(c.args[0])).join(' | ') };
}

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;
  const manager = { findOne: vi.fn(), update: vi.fn() };
  let orderRepo: { findOne: ReturnType<typeof vi.fn>; createQueryBuilder: ReturnType<typeof vi.fn> };
  let itemsQb: ReturnType<typeof queryBuilder>;
  let repos: Record<string, { find: ReturnType<typeof vi.fn> }>;
  let ordersService: Record<string, ReturnType<typeof vi.fn>>;
  let cancellation: { applyCancellation: ReturnType<typeof vi.fn>; afterCancellation: ReturnType<typeof vi.fn> };
  let ledger: { findByOrder: ReturnType<typeof vi.fn> };
  let refunds: { countNeedingAttention: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };

  const changeStatusDto = (to: OrderStatus, extra: Record<string, unknown> = {}) => ({
    expectedStatus: OrderStatus.EN_PREPARACION,
    to,
    ...extra,
  });

  beforeEach(async () => {
    manager.findOne.mockReset();
    manager.update.mockReset();
    orderRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn() };
    itemsQb = queryBuilder();
    repos = {
      OrderStatusHistory: { find: vi.fn().mockResolvedValue([]) },
      OrderNote: { find: vi.fn().mockResolvedValue([]) },
      ReturnRequest: { find: vi.fn().mockResolvedValue([]) },
    };
    ordersService = {
      lockWithItems: vi.fn(),
      changeStatus: vi.fn((_m, o: Order, to: OrderStatus) => {
        o.status = to;
      }),
      appendInternalNote: vi.fn(),
    };
    cancellation = {
      applyCancellation: vi.fn().mockResolvedValue({ refundRequested: true, refundId: 'refund-1', previousStatus: OrderStatus.PAGADO }),
      afterCancellation: vi.fn().mockResolvedValue(undefined),
    };
    ledger = { findByOrder: vi.fn().mockResolvedValue({ payments: [], refunds: [] }) };
    refunds = { countNeedingAttention: vi.fn().mockResolvedValue(2) };
    notifications = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: (cb: (m: unknown) => unknown) => cb(manager),
            getRepository: (entity: { name: string }) =>
              entity.name === 'OrderItem' ? { createQueryBuilder: () => itemsQb.qb } : repos[entity.name],
          },
        },
        { provide: OrdersService, useValue: ordersService },
        { provide: OrderCancellationService, useValue: cancellation },
        { provide: PaymentLedgerService, useValue: ledger },
        { provide: RefundsService, useValue: refunds },
        { provide: NotificationsService, useValue: notifications },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'ana@example.com' }) } },
      ],
    }).compile();

    service = moduleRef.get(AdminOrdersService);
  });

  describe('CU-19 Ver y gestionar pedidos (admin)', () => {
    it('2: lista una página con la cantidad de productos, el estado de pago y la alerta de reembolsos (CU-21 4a/5a)', async () => {
      const { qb, calls } = queryBuilder({ many: [order()], count: 45 });
      orderRepo.createQueryBuilder.mockReturnValue(qb);
      itemsQb = queryBuilder({ raw: [{ orderId: 'order-1', count: '3' }] });

      const result = await service.list({ page: 3 });

      expect(calls).toEqual(expect.arrayContaining([{ method: 'offset', args: [40] }, { method: 'limit', args: [20] }]));
      expect(result).toEqual(
        expect.objectContaining({ page: 3, pageSize: 20, total: 45, totalPages: 3, refundsNeedingAttention: 2 }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          orderNumber: 7,
          itemCount: 3,
          paymentStatus: 'aprobado',
          customer: { name: 'Ana Cliente', email: 'ana@example.com' },
        }),
      );
    });

    it('2: filtra por estado de pago, por reembolsos que requieren gestión y ordena por ciclo de vida', async () => {
      const built = queryBuilder();
      orderRepo.createQueryBuilder.mockReturnValue(built.qb);

      await service.list({ paymentStatus: 'aprobado', refunds: 'requieren_gestion', sort: 'estado' });

      expect(built.sql()).toContain('o.paidAt IS NOT NULL');
      expect(built.sql()).toContain('FROM refunds r');
      expect(built.sql()).toMatch(/CASE o\.status WHEN 'pendiente_pago' THEN 0 .* WHEN 'cancelado' THEN 8 END/);
      // Desempate estable para la paginación.
      expect(built.calls).toContainEqual({ method: 'addOrderBy', args: ['o.orderNumber', 'DESC'] });
    });

    it('2a: exporta el listado a CSV con BOM, «;» y comillas donde hace falta', async () => {
      const built = queryBuilder({
        many: [
          order({ trackingCarrier: 'Andreani', trackingNumber: 'AB;12' }),
          order({
            id: 'order-2',
            orderNumber: 8,
            status: OrderStatus.CANCELADO,
            paidAt: null,
            user: { firstName: 'Juan "Juancho"', lastName: 'Pérez', email: 'juan@example.com' } as Order['user'],
          }),
        ],
      });
      orderRepo.createQueryBuilder.mockReturnValue(built.qb);
      itemsQb = queryBuilder({ raw: [{ orderId: 'order-1', count: '2' }] });

      const csv = await service.exportCsv({});

      expect(csv.startsWith('﻿')).toBe(true);
      const [header, first, second] = csv.slice(1).split('\r\n');
      expect(header.split(';')).toHaveLength(12);
      expect(first).toBe(
        '7;1/9/2026, 12:30:00;Ana Cliente;ana@example.com;Pagado;Aprobado;2;700.00;Envío estándar;Calle 1, Córdoba, Córdoba (5000);Andreani;"AB;12"',
      );
      expect(second).toContain(';"Juan ""Juancho"" Pérez";');
      expect(second).toContain(';Cancelado;Sin pago;0;');
      expect(built.calls).toContainEqual({ method: 'limit', args: [5000] });
    });

    it('4: el detalle trae notas internas, reembolsos y acciones, y nunca la entidad User completa', async () => {
      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.DESPACHADO }));
      repos.OrderNote.find.mockResolvedValue([
        { id: 'n-1', text: 'Llamar al Cliente', createdAt: new Date(), author: { id: 'admin-1', firstName: 'Ada', lastName: 'Admin' } },
      ]);
      ledger.findByOrder.mockResolvedValue({
        payments: [],
        refunds: [{ id: 'refund-1', amount: '700.00', status: RefundStatus.PENDIENTE_DE_GESTION, originCu: RefundOrigin.CU_19 }],
      });

      const detail = await service.getDetail('order-1');

      expect(detail.customer).toEqual({ id: 'user-1', name: 'Ana Cliente', email: 'ana@example.com' });
      expect(JSON.stringify(detail)).not.toContain('secreto');
      expect(detail.notes).toEqual([expect.objectContaining({ text: 'Llamar al Cliente', author: { id: 'admin-1', name: 'Ada Admin' } })]);
      expect(detail.refunds[0].needsAttention).toBe(true);
      expect(detail.actions).toEqual({ transitions: [OrderStatus.ENTREGADO], canCancel: true, canEditTracking: true });
    });

    it('4: un pedido inexistente responde 404', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.getDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('5-9: aplica una transición válida con actor y nota, y avisa al Cliente (include CU-20)', async () => {
      const o = order({ status: OrderStatus.PAGADO });
      ordersService.lockWithItems.mockResolvedValue(o);

      await service.changeStatus('admin-1', 'order-1', {
        expectedStatus: OrderStatus.PAGADO,
        to: OrderStatus.EN_PREPARACION,
        note: '  armado  ',
      });

      expect(ordersService.changeStatus).toHaveBeenCalledWith(manager, o, OrderStatus.EN_PREPARACION, {
        actorId: 'admin-1',
        reason: 'armado',
      });
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: EmailTemplate.CAMBIO_ESTADO_PEDIDO,
          data: { orderNumber: 7, status: OrderStatus.EN_PREPARACION, tracking: null },
        }),
      );
    });

    it('6: al despachar guarda el seguimiento y lo incluye en el aviso', async () => {
      const o = order({ status: OrderStatus.EN_PREPARACION });
      ordersService.lockWithItems.mockResolvedValue(o);

      await service.changeStatus(
        'admin-1',
        'order-1',
        changeStatusDto(OrderStatus.DESPACHADO, { tracking: { carrier: ' Andreani ', number: 'AB123', dispatchedAt: '2026-09-02' } }),
      );

      expect(manager.update).toHaveBeenCalledWith(Order, 'order-1', {
        trackingCarrier: 'Andreani',
        trackingNumber: 'AB123',
        dispatchedAt: new Date('2026-09-02'),
      });
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tracking: { carrier: 'Andreani', number: 'AB123' } }) }),
      );
    });

    it('7b: despacha sin datos de envío igual, sin tocar el seguimiento', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.EN_PREPARACION }));

      await service.changeStatus('admin-1', 'order-1', changeStatusDto(OrderStatus.DESPACHADO));

      expect(ordersService.changeStatus).toHaveBeenCalledWith(manager, expect.anything(), OrderStatus.DESPACHADO, expect.anything());
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('7a: rechaza una transición no permitida e informa las válidas', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.EN_PREPARACION }));

      const error = await service
        .changeStatus('admin-1', 'order-1', changeStatusDto(OrderStatus.ENTREGADO))
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'INVALID_TRANSITION', validTransitions: [OrderStatus.DESPACHADO] }),
      );
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
    });

    it('7a: "devuelto" no es una transición manual (la aplica sólo CU-22)', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.ENTREGADO }));

      const error = await service
        .changeStatus('admin-1', 'order-1', { expectedStatus: OrderStatus.ENTREGADO, to: OrderStatus.DEVUELTO })
        .catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'INVALID_TRANSITION', validTransitions: [] }));
    });

    it('8a: si el estado cambió mientras el Administrador lo miraba, informa el actual y no cambia nada', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.CANCELADO }));

      const error = await service
        .changeStatus('admin-1', 'order-1', changeStatusDto(OrderStatus.DESPACHADO))
        .catch((e) => e);

      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'ORDER_STATUS_CHANGED', currentStatus: OrderStatus.CANCELADO }),
      );
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('9a: si falla el correo, el cambio de estado queda firme', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.PAGADO }));
      notifications.send.mockRejectedValue(new Error('EmailLog caído'));

      await expect(
        service.changeStatus('admin-1', 'order-1', { expectedStatus: OrderStatus.PAGADO, to: OrderStatus.EN_PREPARACION }),
      ).resolves.toBeUndefined();
      expect(ordersService.changeStatus).toHaveBeenCalled();
    });

    it('cambiar el estado de un pedido inexistente responde 404', async () => {
      ordersService.lockWithItems.mockResolvedValue(null);

      await expect(
        service.changeStatus('admin-1', 'nope', changeStatusDto(OrderStatus.DESPACHADO)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('7b: el seguimiento se carga después del despacho, sin avisar al Cliente', async () => {
      manager.findOne.mockResolvedValue(order({ status: OrderStatus.DESPACHADO }));

      await service.updateTracking('order-1', { carrier: 'OCA', number: '', dispatchedAt: undefined });

      expect(manager.update).toHaveBeenCalledWith(Order, 'order-1', { trackingCarrier: 'OCA', trackingNumber: null, dispatchedAt: null });
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('7b: no carga seguimiento en un pedido que todavía no se despachó', async () => {
      manager.findOne.mockResolvedValue(order({ status: OrderStatus.EN_PREPARACION }));

      const error = await service.updateTracking('order-1', { carrier: 'OCA' }).catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'TRACKING_NOT_EDITABLE' }));
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('5a: cancela con los efectos de CU-14, causa "administrador", motivo de la lista + detalle y reembolso CU-19', async () => {
      const o = order({ status: OrderStatus.EN_PREPARACION });
      ordersService.lockWithItems.mockResolvedValue(o);

      const result = await service.cancel('admin-1', 'order-1', {
        expectedStatus: OrderStatus.EN_PREPARACION,
        reason: AdminCancelReason.FALTA_STOCK,
        detail: '  se rompió en el depósito ',
      });

      expect(result).toEqual({ refundRequested: true });
      expect(cancellation.applyCancellation).toHaveBeenCalledWith(manager, o, {
        actorId: 'admin-1',
        cause: OrderCancellationCause.ADMINISTRADOR,
        reason: 'Falta de stock: se rompió en el depósito',
        refundOrigin: RefundOrigin.CU_19,
      });
      expect(cancellation.afterCancellation).toHaveBeenCalledWith(o, expect.objectContaining({ refundId: 'refund-1' }));
    });

    it('5a: sin detalle, el motivo es sólo la etiqueta de la lista', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.PENDIENTE_PAGO }));

      await service.cancel('admin-1', 'order-1', { expectedStatus: OrderStatus.PENDIENTE_PAGO, reason: AdminCancelReason.PAGO_ABANDONADO });

      expect(cancellation.applyCancellation).toHaveBeenCalledWith(
        manager,
        expect.anything(),
        expect.objectContaining({ reason: 'Pago abandonado' }),
      );
    });

    it.each([OrderStatus.ENTREGADO, OrderStatus.CANCELADO, OrderStatus.DEVUELTO])(
      '5a: no cancela un pedido "%s"',
      async (status) => {
        ordersService.lockWithItems.mockResolvedValue(order({ status }));

        const error = await service
          .cancel('admin-1', 'order-1', { expectedStatus: status, reason: AdminCancelReason.OTRO })
          .catch((e) => e);

        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ORDER_NOT_CANCELLABLE' }));
        expect(cancellation.applyCancellation).not.toHaveBeenCalled();
      },
    );

    it('5a + 8a: no cancela si el estado cambió desde que el Administrador lo vio', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.DESPACHADO }));

      const error = await service
        .cancel('admin-1', 'order-1', { expectedStatus: OrderStatus.EN_PREPARACION, reason: AdminCancelReason.OTRO })
        .catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ORDER_STATUS_CHANGED' }));
      expect(cancellation.applyCancellation).not.toHaveBeenCalled();
    });

    it('5a: si falla lo posterior al commit (correo, preferencia), la cancelación responde bien igual', async () => {
      ordersService.lockWithItems.mockResolvedValue(order({ status: OrderStatus.PAGADO }));
      cancellation.afterCancellation.mockRejectedValue(new Error('EmailLog caído'));

      await expect(
        service.cancel('admin-1', 'order-1', { expectedStatus: OrderStatus.PAGADO, reason: AdminCancelReason.SOSPECHA_FRAUDE }),
      ).resolves.toEqual({ refundRequested: true });
    });

    it('5c: agrega una nota interna sin cambiar el estado', async () => {
      const o = order();
      manager.findOne.mockResolvedValue(o);

      await service.addNote('admin-1', 'order-1', 'Cliente avisó que no está el lunes');

      expect(ordersService.appendInternalNote).toHaveBeenCalledWith(manager, o, 'Cliente avisó que no está el lunes', 'admin-1');
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
    });

    it('5c: una nota sobre un pedido inexistente responde 404', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.addNote('admin-1', 'nope', 'nota')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
