import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { type Payment, PaymentStatus } from '../payments/entities/payment.entity.js';
import { PaymentLedgerService } from '../payments/ledger/payment-ledger.service.js';
import { QueryMyOrdersDto } from './dto/query-my-orders.dto.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderStatusHistory } from './entities/order-status-history.entity.js';
import { Order } from './entities/order.entity.js';
import { type ActionAvailability, customerCancellation, paymentRetry, returnWindow } from './order-policies.js';
import { AWAITING_PAYMENT_STATUSES, OrderStatus, PAID_STATUSES } from './order-status.js';
import { ReturnRequest } from './returns/entities/return-request.entity.js';

const PAGE_SIZE = 10;

/** CU-13 (paso 3): estado de pago que ve el Cliente, derivado del estado del pedido. */
export type CustomerPaymentStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'sin_pago';

/** Estados desde los que se muestran los datos de seguimiento (CU-13 paso 6). */
const TRACKING_VISIBLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
  OrderStatus.DEVUELTO,
];

/**
 * CU-13 Ver mis pedidos: listado y detalle, siempre acotados al Cliente
 * autenticado. Sólo lectura: los importes salen del snapshot del pedido
 * (CU-03), nunca del catálogo actual. Las acciones del paso 7 se calculan
 * con las mismas funciones que después validan cada acción
 * (`order-policies.ts`), así el botón nunca promete algo que el backend
 * rechaza.
 */
@Injectable()
export class CustomerOrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(ReturnRequest)
    private readonly returnRequestRepo: Repository<ReturnRequest>,
    private readonly ledger: PaymentLedgerService,
  ) {}

  /**
   * CU-13 (pasos 2-3, flujos 2a/3a).
   *
   * @usecase CU-13 Ver mis pedidos
   */
  async list(userId: string, query: QueryMyOrdersDto) {
    const page = query.page ?? 1;
    const qb = this.orderRepo
      .createQueryBuilder('o')
      // Paso 2: sólo pedidos cuyo titular es el Cliente autenticado.
      .where('o.userId = :userId', { userId })
      .orderBy('o.createdAt', 'DESC')
      // Desempate único: con OFFSET, dos pedidos del mismo instante podrían
      // repetirse o saltearse entre páginas.
      .addOrderBy('o.orderNumber', 'DESC')
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE);

    // CU-13 (flujo 3a): filtros por estado, rango de fechas y número.
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.from) qb.andWhere('o.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('o.createdAt <= :to', { to: query.to });
    if (query.number) qb.andWhere('o.orderNumber = :number', { number: query.number });

    const [orders, total] = await qb.getManyAndCount();
    const itemCounts = await this.countItems(orders.map((o) => o.id));

    return {
      // CU-13 (flujo 2a): una lista vacía sin filtros es el estado vacío.
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        itemCount: itemCounts.get(order.id) ?? 0,
        total: order.total,
        status: order.status,
        paymentStatus: this.paymentStatus(order),
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  /**
   * CU-13 (pasos 5-7, flujos 5a/6a/7a). También es lo que devuelve la
   * página de retorno de la pasarela (CU-05 paso 11).
   *
   * @usecase CU-13 Ver mis pedidos
   */
  async getDetail(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId }, relations: { items: true } });
    // CU-13 (flujo 5a): inexistente o ajeno responden igual, sin revelar cuál.
    if (!order) throw new NotFoundException('Pedido no disponible');

    const [history, ledger, returnRequests] = await Promise.all([
      this.historyRepo.find({ where: { orderId }, order: { createdAt: 'ASC' } }),
      this.ledger.findByOrder(orderId),
      this.returnRequestRepo.find({
        where: { orderId },
        relations: { items: true, photos: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const requestedItemIds = new Set(returnRequests.flatMap((r) => r.items.map((i) => i.orderItemId)));
    const now = new Date();
    const items = [...order.items].sort((a, b) => a.productNameSnapshot.localeCompare(b.productNameSnapshot));
    const showTracking = TRACKING_VISIBLE_STATUSES.includes(order.status);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      shippingMethod: order.shippingMethodSnapshot,
      shippingAddress: order.shippingAddressSnapshot,
      // Sólo tiene sentido mientras espera el pago (plazo para pagar).
      reservationExpiresAt: AWAITING_PAYMENT_STATUSES.includes(order.status) ? order.reservationExpiresAt : null,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      // Paso 6: tracking sólo desde "despachado" y si el Administrador lo cargó (es opcional).
      tracking:
        showTracking && (order.trackingCarrier || order.trackingNumber || order.dispatchedAt)
          ? { carrier: order.trackingCarrier, number: order.trackingNumber, dispatchedAt: order.dispatchedAt }
          : null,
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        variantAttributes: item.variantAttributesSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.subtotal,
        hasReturnRequest: requestedItemIds.has(item.id),
      })),
      payment: {
        status: this.paymentStatus(order),
        // CU-13 (flujo 6a): mientras espera el pago, lo mostrado es el
        // último estado conocido; la actualización firme llega por CU-05.
        mayBeOutdated: AWAITING_PAYMENT_STATUSES.includes(order.status),
        ...this.lastPaymentInfo(ledger.payments),
      },
      refunds: ledger.refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        createdAt: refund.createdAt,
        resolvedAt: refund.resolvedAt,
      })),
      statusHistory: history.map((entry) => ({
        from: entry.fromStatus,
        to: entry.toStatus,
        at: entry.createdAt,
      })),
      returnRequests: returnRequests.map((request) => ({
        id: request.id,
        requestNumber: request.requestNumber,
        type: request.type,
        status: request.status,
        reason: request.reason,
        createdAt: request.createdAt,
        resolvedAt: request.resolvedAt,
        resolutionNote: request.resolutionNote,
        photos: request.photos.map((photo) => photo.url),
        items: request.items.map((ri) => {
          const item = order.items.find((i) => i.id === ri.orderItemId);
          return {
            orderItemId: ri.orderItemId,
            productName: item?.productNameSnapshot ?? '',
            quantityRequested: ri.quantityRequested,
            quantityApproved: ri.quantityApproved,
          };
        }),
      })),
      // Paso 7 / flujo 7a: acciones que el estado admite.
      actions: {
        retryPayment: paymentRetry(order, now),
        cancel: customerCancellation(order, now),
        requestReturn: this.returnAvailability(order, requestedItemIds, now),
      },
    };
  }

  /** CU-15 (paso 2 + flujo 3a): ventana de posventa y al menos un ítem elegible. */
  private returnAvailability(order: Order, requestedItemIds: Set<string>, now: Date): ActionAvailability {
    const window = returnWindow(order, now);
    if (!window.allowed) return window;
    if (order.items.every((item) => requestedItemIds.has(item.id))) {
      return {
        allowed: false,
        code: 'NO_ELIGIBLE_ITEMS',
        message: 'Todos los productos de este pedido ya tienen una solicitud de cambio o devolución.',
      };
    }
    return window;
  }

  /**
   * CU-13 (paso 3): pendiente / aprobado / rechazado, más "sin pago" para
   * un pedido que se canceló sin haberse pagado.
   */
  private paymentStatus(order: Order): CustomerPaymentStatus {
    if (order.status === OrderStatus.PAGO_RECHAZADO) return 'rechazado';
    if (AWAITING_PAYMENT_STATUSES.includes(order.status)) return 'pendiente';
    if (PAID_STATUSES.includes(order.status) || order.paidAt) return 'aprobado';
    return 'sin_pago';
  }

  /** CU-13 (paso 6): medio de pago del pago acreditado o, si no hay, del último informado. */
  private lastPaymentInfo(payments: Payment[]): { method: string | null; installments: number | null } {
    const last = payments.findLast((p) => p.status === PaymentStatus.APROBADO) ?? payments.at(-1);
    return { method: last?.method ?? null, installments: last?.installments ?? null };
  }

  private async countItems(orderIds: string[]): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    const rows = await this.orderItemRepo
      .createQueryBuilder('i')
      .select('i.orderId', 'orderId')
      .addSelect('SUM(i.quantity)', 'count')
      .where({ orderId: In(orderIds) })
      .groupBy('i.orderId')
      .getRawMany<{ orderId: string; count: string }>();
    return new Map(rows.map((row) => [row.orderId, Number(row.count)]));
  }
}
