import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { RefundOrigin } from '../../payments/entities/refund.entity.js';
import { PaymentLedgerService } from '../../payments/ledger/payment-ledger.service.js';
import { RefundsService } from '../../payments/refunds/refunds.service.js';
import { ProductsService } from '../../products/products.service.js';
import { StockReservationService } from '../../products/stock/stock-reservation.service.js';
import { UsersService } from '../../users/users.service.js';
import type { Order } from '../entities/order.entity.js';
import { OrderStatus } from '../order-status.js';
import { OrdersService } from '../orders.service.js';
import { ReplacementStatus, ReturnReplacement } from '../returns/entities/return-replacement.entity.js';
import { ReturnItemCondition, type ReturnRequestItem } from '../returns/entities/return-request-item.entity.js';
import { ReturnRequest, ReturnRequestStatus, ReturnRequestType } from '../returns/entities/return-request.entity.js';
import { RETURN_INSTRUCTIONS } from '../returns/returns.service.js';
import { AdminReturnsService } from './admin-returns.service.js';

const DAY = 24 * 60 * 60 * 1000;

/** Pedido entregado con dos ítems: 2 remeras a $1000 y 1 pantalón a $3000. */
const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    orderNumber: 7,
    userId: 'user-1',
    status: OrderStatus.ENTREGADO,
    items: [
      { id: 'item-1', quantity: 2 },
      { id: 'item-2', quantity: 1 },
    ],
    ...overrides,
  }) as Order;

const requestItem = (orderItemId: string, overrides: Partial<ReturnRequestItem> = {}): ReturnRequestItem =>
  ({
    orderItemId,
    quantityRequested: 1,
    quantityApproved: null,
    quantityReceived: null,
    condition: null,
    refundApproved: null,
    orderItem:
      orderItemId === 'item-1'
        ? { id: 'item-1', productId: 'p-remera', variantId: 'v-remera-m', productNameSnapshot: 'Remera', unitPriceSnapshot: '1000.00', quantity: 2 }
        : { id: 'item-2', productId: 'p-pantalon', variantId: 'v-pantalon-40', productNameSnapshot: 'Pantalón', unitPriceSnapshot: '3000.00', quantity: 1 },
    ...overrides,
  }) as ReturnRequestItem;

const returnRequest = (overrides: Partial<ReturnRequest> = {}): ReturnRequest =>
  ({
    id: 'req-1',
    requestNumber: 3,
    orderId: 'order-1',
    type: ReturnRequestType.DEVOLUCION,
    status: ReturnRequestStatus.SOLICITADA,
    approvedAt: null,
    internalNote: null,
    resolutionNote: null,
    ...overrides,
  }) as ReturnRequest;

describe('AdminReturnsService', () => {
  let service: AdminReturnsService;
  let manager: Record<string, ReturnType<typeof vi.fn>>;
  /** Lo que `manager` devuelve para cada entidad. */
  let db: { request: ReturnRequest | null; items: ReturnRequestItem[]; resolved: ReturnRequest[]; pendingReplacements: ReturnReplacement[] };
  let ordersService: Record<string, ReturnType<typeof vi.fn>>;
  let productsService: { findReplacementOptions: ReturnType<typeof vi.fn> };
  let stock: { restockReturn: ReturnType<typeof vi.fn>; takeForReplacement: ReturnType<typeof vi.fn> };
  let ledger: { requestRefund: ReturnType<typeof vi.fn> };
  let refunds: { dispatch: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };
  let o: Order;

  /** El último `save` de la solicitud (la entidad, no la lista de ítems). */
  const savedRequest = () =>
    manager.save.mock.calls.map(([arg]) => arg).filter((arg) => !Array.isArray(arg) && arg?.requestNumber !== undefined).at(-1);
  const sentEvent = () => notifications.send.mock.calls.at(-1)?.[0];

  const withRequest = (request: ReturnRequest, items: ReturnRequestItem[]) => {
    db.request = request;
    db.items = items;
  };

  beforeEach(async () => {
    o = order();
    db = { request: null, items: [], resolved: [], pendingReplacements: [] };
    manager = {
      findOne: vi.fn((entity) => Promise.resolve(entity === ReturnRequest && db.request ? Object.assign({}, db.request) : null)),
      find: vi.fn((entity) => {
        if (entity === ReturnRequest) return Promise.resolve(db.resolved);
        if (entity === ReturnReplacement) return Promise.resolve(db.pendingReplacements);
        return Promise.resolve(db.items);
      }),
      save: vi.fn((x) => Promise.resolve(x)),
      create: vi.fn((_entity, data) => data),
    };
    ordersService = {
      lockWithItems: vi.fn(() => Promise.resolve(o)),
      changeStatus: vi.fn((_m, target: Order, to: OrderStatus) => {
        target.status = to;
      }),
      appendInternalNote: vi.fn(),
    };
    productsService = {
      findReplacementOptions: vi.fn().mockResolvedValue(
        new Map([['p-remera', [{ id: 'v-remera-l', attributes: { talle: 'L' }, stockAvailable: 5 }]]]),
      ),
    };
    stock = { restockReturn: vi.fn(), takeForReplacement: vi.fn().mockResolvedValue(true) };
    ledger = { requestRefund: vi.fn().mockResolvedValue({ id: 'refund-1' }) };
    refunds = { dispatch: vi.fn().mockResolvedValue(undefined) };
    notifications = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReturnsService,
        { provide: getRepositoryToken(ReturnRequest), useValue: { findOne: vi.fn(), count: vi.fn(), createQueryBuilder: vi.fn() } },
        { provide: getRepositoryToken(ReturnReplacement), useValue: { count: vi.fn() } },
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
        { provide: OrdersService, useValue: ordersService },
        { provide: ProductsService, useValue: productsService },
        { provide: StockReservationService, useValue: stock },
        { provide: PaymentLedgerService, useValue: ledger },
        { provide: RefundsService, useValue: refunds },
        { provide: NotificationsService, useValue: notifications },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'ana@example.com' }) } },
      ],
    }).compile();

    service = moduleRef.get(AdminReturnsService);
  });

  describe('CU-22 Resolver solicitud de cambio o devolución — aprobación y rechazo', () => {
    it('3-7: aprueba todo lo pedido y avisa con las instrucciones de envío y el plazo de recepción (include CU-20)', async () => {
      const items = [requestItem('item-1', { quantityRequested: 2 }), requestItem('item-2')];
      withRequest(returnRequest(), items);

      await service.approve('admin-1', 'req-1', {
        items: [
          { orderItemId: 'item-1', quantityApproved: 2 },
          { orderItemId: 'item-2', quantityApproved: 1 },
        ],
        internalNote: 'Cliente frecuente',
      });

      expect(items.map((i) => i.quantityApproved)).toEqual([2, 1]);
      const saved = savedRequest();
      expect(saved).toEqual(
        expect.objectContaining({
          status: ReturnRequestStatus.APROBADA,
          resolvedByUserId: 'admin-1',
          internalNote: 'Cliente frecuente',
          resolutionNote: null,
        }),
      );
      expect(sentEvent()).toEqual(
        expect.objectContaining({
          template: EmailTemplate.RESULTADO_POSVENTA,
          data: expect.objectContaining({
            event: 'aprobada',
            requestNumber: 3,
            instructions: RETURN_INSTRUCTIONS,
            receptionDeadline: new Date(saved.approvedAt.getTime() + 10 * DAY),
            partialRejectionReason: null,
          }),
        }),
      );
      expect(stock.restockReturn).not.toHaveBeenCalled();
    });

    it('4a: aprueba una parte; el resto queda rechazado con su motivo y se informa en el aviso', async () => {
      withRequest(returnRequest(), [requestItem('item-1', { quantityRequested: 2 }), requestItem('item-2')]);

      await service.approve('admin-1', 'req-1', {
        items: [
          { orderItemId: 'item-1', quantityApproved: 1 },
          { orderItemId: 'item-2', quantityApproved: 0 },
        ],
        rejectionReason: 'El pantalón tiene uso',
      });

      expect(savedRequest()).toEqual(expect.objectContaining({ status: ReturnRequestStatus.APROBADA, resolutionNote: 'El pantalón tiene uso' }));
      expect(sentEvent().data).toEqual(expect.objectContaining({ partialRejectionReason: 'El pantalón tiene uso' }));
    });

    it('4a: una aprobación parcial exige el motivo de lo que no se aprueba', async () => {
      withRequest(returnRequest(), [requestItem('item-1', { quantityRequested: 2 })]);

      await expect(
        service.approve('admin-1', 'req-1', { items: [{ orderItemId: 'item-1', quantityApproved: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(savedRequest()).toBeUndefined();
    });

    it.each([
      ['más de lo que pidió el Cliente', [{ orderItemId: 'item-1', quantityApproved: 2 }]],
      ['ninguna unidad (eso es un rechazo)', [{ orderItemId: 'item-1', quantityApproved: 0 }]],
      ['sin indicar todos los ítems de la solicitud', [{ orderItemId: 'item-2', quantityApproved: 1 }]],
    ])('no aprueba %s', async (_label, approved) => {
      withRequest(returnRequest(), [requestItem('item-1')]);

      await expect(service.approve('admin-1', 'req-1', { items: approved, rejectionReason: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('2a: no resuelve otra vez una solicitud ya resuelta o rechazada (u otro admin se adelantó)', async () => {
      withRequest(returnRequest({ status: ReturnRequestStatus.RECHAZADA }), [requestItem('item-1')]);

      const error = await service
        .approve('admin-1', 'req-1', { items: [{ orderItemId: 'item-1', quantityApproved: 1 }] })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'RETURN_STATUS_CHANGED', currentStatus: ReturnRequestStatus.RECHAZADA }),
      );
    });

    it('una solicitud inexistente responde 404', async () => {
      await expect(
        service.approve('admin-1', 'nope', { items: [{ orderItemId: 'item-1', quantityApproved: 1 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('3a: rechaza sin tocar stock ni pago, el pedido sigue "entregado" y se avisa con el motivo', async () => {
      const items = [requestItem('item-1')];
      withRequest(returnRequest(), items);

      await service.reject('admin-1', 'req-1', { reason: 'Fuera de las condiciones' });

      expect(items[0].quantityApproved).toBe(0);
      expect(savedRequest()).toEqual(
        expect.objectContaining({ status: ReturnRequestStatus.RECHAZADA, resolutionNote: 'Fuera de las condiciones' }),
      );
      expect(stock.restockReturn).not.toHaveBeenCalled();
      expect(ledger.requestRefund).not.toHaveBeenCalled();
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
      expect(sentEvent().data).toEqual(expect.objectContaining({ event: 'rechazada', reason: 'Fuera de las condiciones' }));
    });
  });

  describe('CU-22 Resolver solicitud de cambio o devolución — recepción', () => {
    const approved = (overrides: Partial<ReturnRequest> = {}) =>
      returnRequest({ status: ReturnRequestStatus.APROBADA, approvedAt: new Date(), ...overrides });

    it('8-12: una devolución total reingresa el stock, reembolsa sólo productos (include CU-21), pasa el pedido a "devuelto" y avisa', async () => {
      const items = [
        requestItem('item-1', { quantityRequested: 2, quantityApproved: 2 }),
        requestItem('item-2', { quantityApproved: 1 }),
      ];
      withRequest(approved(), items);

      await service.receive('admin-1', 'req-1', {
        items: [
          { orderItemId: 'item-1', quantityReceived: 2, condition: ReturnItemCondition.OK },
          { orderItemId: 'item-2', quantityReceived: 1, condition: ReturnItemCondition.OK },
        ],
      });

      expect(stock.restockReturn).toHaveBeenCalledWith(
        manager,
        [
          { variantId: 'v-remera-m', quantity: 2, damaged: false },
          { variantId: 'v-pantalon-40', quantity: 1, damaged: false },
        ],
        { reason: 'Solicitud #3 — pedido #7', actorId: 'admin-1' },
      );
      expect(ledger.requestRefund).toHaveBeenCalledWith(manager, {
        orderId: 'order-1',
        amount: '5000.00',
        originCu: RefundOrigin.CU_22,
        reason: 'Solicitud #3 — pedido #7',
      });
      expect(ordersService.changeStatus).toHaveBeenCalledWith(manager, o, OrderStatus.DEVUELTO, expect.objectContaining({ actorId: 'admin-1' }));
      expect(savedRequest()).toEqual(expect.objectContaining({ status: ReturnRequestStatus.RESUELTA, refundId: 'refund-1' }));
      expect(refunds.dispatch).toHaveBeenCalledWith('refund-1');
      expect(sentEvent().data).toEqual(expect.objectContaining({ event: 'resuelta' }));
    });

    it('10: una devolución parcial reembolsa lo recibido y el pedido sigue "entregado"', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityApproved: 1 })]);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK }],
      });

      expect(ledger.requestRefund).toHaveBeenCalledWith(manager, expect.objectContaining({ amount: '1000.00' }));
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
    });

    it('10: pasa a "devuelto" cuando esta solicitud completa lo que devolvieron las anteriores', async () => {
      db.resolved = [
        returnRequest({
          id: 'req-0',
          status: ReturnRequestStatus.RESUELTA,
          items: [requestItem('item-1', { quantityReceived: 2 })],
        }),
      ];
      withRequest(approved(), [requestItem('item-2', { quantityApproved: 1 })]);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-2', quantityReceived: 1, condition: ReturnItemCondition.OK }],
      });

      expect(ordersService.changeStatus).toHaveBeenCalledWith(manager, o, OrderStatus.DEVUELTO, expect.anything());
    });

    it('9a: lo dañado va como merma y, si el Administrador decide no reembolsarlo, no genera reembolso', async () => {
      const items = [requestItem('item-2', { quantityApproved: 1 })];
      withRequest(approved(), items);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-2', quantityReceived: 1, condition: ReturnItemCondition.DANADO, refund: false }],
      });

      expect(stock.restockReturn).toHaveBeenCalledWith(manager, [{ variantId: 'v-pantalon-40', quantity: 1, damaged: true }], expect.anything());
      expect(items[0]).toEqual(expect.objectContaining({ condition: ReturnItemCondition.DANADO, refundApproved: false }));
      expect(ledger.requestRefund).not.toHaveBeenCalled();
      expect(refunds.dispatch).not.toHaveBeenCalled();
      // Volvió todo lo comprado del pantalón, pero no las remeras: sigue "entregado".
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
      expect(savedRequest()).toEqual(expect.objectContaining({ status: ReturnRequestStatus.RESUELTA, refundId: null }));
    });

    it('9a: lo dañado se reembolsa si el Administrador así lo decide', async () => {
      withRequest(approved(), [requestItem('item-2', { quantityApproved: 1 })]);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-2', quantityReceived: 1, condition: ReturnItemCondition.DANADO, refund: true }],
      });

      expect(ledger.requestRefund).toHaveBeenCalledWith(manager, expect.objectContaining({ amount: '3000.00' }));
    });

    it('10b: si el reembolso no se puede registrar, la solicitud se resuelve igual y queda anotado para el Administrador', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityApproved: 1 })]);
      ledger.requestRefund.mockResolvedValue(null);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK }],
      });

      expect(ordersService.appendInternalNote).toHaveBeenCalledWith(manager, o, expect.stringContaining('gestionarlo a mano'));
      expect(savedRequest()).toEqual(expect.objectContaining({ status: ReturnRequestStatus.RESUELTA, refundId: null }));
      expect(refunds.dispatch).not.toHaveBeenCalled();
    });

    it('8a: si no llegó nada, no reingresa stock ni reembolsa y la solicitud sigue "aprobada"', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityApproved: 1 })]);

      await expect(
        service.receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 0, condition: ReturnItemCondition.OK }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.restockReturn).not.toHaveBeenCalled();
      expect(savedRequest()).toBeUndefined();
    });

    it('no registra más unidades de las aprobadas', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityRequested: 2, quantityApproved: 1 })]);

      await expect(
        service.receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 2, condition: ReturnItemCondition.OK }],
        }),
      ).rejects.toThrow('se aprobaron 1 unidad(es)');
    });

    it('exige indicar qué llegó de cada producto aprobado', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityApproved: 1 }), requestItem('item-2', { quantityApproved: 1 })]);

      await expect(
        service.receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('10a: un cambio descuenta la variante de reposición elegida, la deja pendiente de despacho y no reembolsa', async () => {
      withRequest(approved({ type: ReturnRequestType.CAMBIO }), [requestItem('item-1', { quantityApproved: 1 })]);

      await service.receive('admin-1', 'req-1', {
        items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK, replacementVariantId: 'v-remera-l' }],
      });

      expect(stock.takeForReplacement).toHaveBeenCalledWith(
        manager,
        { variantId: 'v-remera-l', quantity: 1 },
        expect.objectContaining({ actorId: 'admin-1' }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        ReturnReplacement,
        expect.objectContaining({
          orderItemId: 'item-1',
          variantId: 'v-remera-l',
          variantAttributesSnapshot: { talle: 'L' },
          status: ReplacementStatus.PENDIENTE_DESPACHO,
        }),
      );
      expect(ordersService.appendInternalNote).toHaveBeenCalledWith(manager, o, expect.stringContaining('reposición pendiente'), 'admin-1');
      expect(ledger.requestRefund).not.toHaveBeenCalled();
      expect(ordersService.changeStatus).not.toHaveBeenCalled();
      expect(savedRequest()).toEqual(expect.objectContaining({ status: ReturnRequestStatus.RESUELTA }));
    });

    it('10a: la variante de reposición tiene que ser del mismo producto', async () => {
      withRequest(approved({ type: ReturnRequestType.CAMBIO }), [requestItem('item-1', { quantityApproved: 1 })]);

      await expect(
        service.receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK, replacementVariantId: 'v-pantalon-40' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.takeForReplacement).not.toHaveBeenCalled();
    });

    it('10a: sin stock de la variante elegida, se rechaza para que el Administrador elija otra', async () => {
      withRequest(approved({ type: ReturnRequestType.CAMBIO }), [requestItem('item-1', { quantityApproved: 1 })]);
      stock.takeForReplacement.mockResolvedValue(false);

      const error = await service
        .receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK, replacementVariantId: 'v-remera-l' }],
        })
        .catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'REPLACEMENT_OUT_OF_STOCK', orderItemId: 'item-1' }));
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('12: si falla el correo, la resolución queda firme', async () => {
      withRequest(approved(), [requestItem('item-1', { quantityApproved: 1 })]);
      notifications.send.mockRejectedValue(new Error('EmailLog caído'));

      await expect(
        service.receive('admin-1', 'req-1', {
          items: [{ orderItemId: 'item-1', quantityReceived: 1, condition: ReturnItemCondition.OK }],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('CU-22 Resolver solicitud de cambio o devolución — despacho de la reposición (10a)', () => {
    it('marca las reposiciones pendientes como despachadas con el seguimiento y avisa al Cliente', async () => {
      db.request = returnRequest({ type: ReturnRequestType.CAMBIO, status: ReturnRequestStatus.RESUELTA });
      const pending = { id: 'rep-1', status: ReplacementStatus.PENDIENTE_DESPACHO } as ReturnReplacement;
      db.pendingReplacements = [pending];

      await service.dispatchReplacement('req-1', { carrier: 'Andreani', number: 'AB1' });

      expect(pending).toEqual(
        expect.objectContaining({ status: ReplacementStatus.DESPACHADO, trackingCarrier: 'Andreani', trackingNumber: 'AB1' }),
      );
      expect(sentEvent().data).toEqual(
        expect.objectContaining({ event: 'reposicion_despachada', tracking: { carrier: 'Andreani', number: 'AB1' } }),
      );
    });

    it('sin seguimiento el aviso sale igual, sin datos de envío', async () => {
      db.request = returnRequest({ type: ReturnRequestType.CAMBIO, status: ReturnRequestStatus.RESUELTA });
      db.pendingReplacements = [{ id: 'rep-1', status: ReplacementStatus.PENDIENTE_DESPACHO } as ReturnReplacement];

      await service.dispatchReplacement('req-1', {});

      expect(sentEvent().data).toEqual(expect.objectContaining({ tracking: null }));
    });

    it('no despacha si no hay reposiciones pendientes', async () => {
      db.request = returnRequest({ status: ReturnRequestStatus.RESUELTA });

      const error = await service.dispatchReplacement('req-1', {}).catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'NO_PENDING_REPLACEMENT' }));
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });
});
