import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, type EntityManager, In, Repository, type SelectQueryBuilder } from 'typeorm';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { REFUND_NEEDS_ATTENTION, RefundOrigin } from '../../payments/entities/refund.entity.js';
import { PaymentLedgerService } from '../../payments/ledger/payment-ledger.service.js';
import { RefundsService } from '../../payments/refunds/refunds.service.js';
import { UsersService } from '../../users/users.service.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { OrderNote } from '../entities/order-note.entity.js';
import { OrderStatusHistory } from '../entities/order-status-history.entity.js';
import { Order } from '../entities/order.entity.js';
import { OrderCancellationService } from '../order-cancellation.service.js';
import {
  ADMIN_NON_CANCELLABLE_STATUSES,
  ADMIN_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
  TRACKING_EDITABLE_STATUSES,
  customerPaymentStatus,
} from '../order-policies.js';
import {
  AWAITING_PAYMENT_STATUSES,
  ORDER_STATUS_LABELS,
  OrderCancellationCause,
  OrderStatus,
  PAID_STATUSES,
} from '../order-status.js';
import { OrdersService } from '../orders.service.js';
import { ReturnRequest } from '../returns/entities/return-request.entity.js';
import { ADMIN_CANCEL_REASON_LABELS, AdminCancelOrderDto } from './dto/admin-cancel-order.dto.js';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto.js';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto.js';
import { TrackingDto } from './dto/tracking.dto.js';

/** Decisión de la Fase 6. */
const PAGE_SIZE = 20;
/** Tope de filas del CSV: el export es para operar el día, no un volcado de la base. */
const EXPORT_LIMIT = 5000;

/** Orden del ciclo de vida, para ordenar "por estado" (decisión de la Fase 6). */
const LIFECYCLE_ORDER: OrderStatus[] = [
  OrderStatus.PENDIENTE_PAGO,
  OrderStatus.PAGO_PENDIENTE_ACREDITACION,
  OrderStatus.PAGO_RECHAZADO,
  OrderStatus.PAGADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
  OrderStatus.DEVUELTO,
  OrderStatus.CANCELADO,
];

/** Error de CU-19 (flujo 8a): el pedido cambió entre que el Administrador lo vio y confirmó. */
function statusChanged(current: OrderStatus): ConflictException {
  return new ConflictException({
    code: 'ORDER_STATUS_CHANGED',
    message: 'El pedido cambió de estado mientras lo mirabas (otro administrador o un aviso de pago): revisalo de nuevo',
    currentStatus: current,
  });
}

/**
 * CU-19 Ver y gestionar pedidos (admin): listado de todos los pedidos,
 * detalle, cambio de estado, seguimiento, cancelación, notas internas y
 * exportación. La resolución de posventa es CU-22 (`AdminReturnsService`).
 */
@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly cancellation: OrderCancellationService,
    private readonly ledger: PaymentLedgerService,
    private readonly refunds: RefundsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * CU-19 (paso 2): todos los pedidos, con búsqueda, filtros y orden.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async list(query: QueryAdminOrdersDto) {
    const page = query.page ?? 1;
    // offset/limit (no skip/take): el único join es muchos-a-uno (el
    // cliente), así que no multiplica filas, y skip/take no admite ordenar
    // por una expresión como la del orden "por estado".
    const qb = this.filteredQuery(query)
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);
    const [orders, total] = await qb.getManyAndCount();
    const itemCounts = await this.countItems(orders.map((o) => o.id));

    return {
      items: orders.map((order) => this.toRow(order, itemCounts.get(order.id) ?? 0)),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
      // Alerta de CU-21 (4a/5a) en el panel.
      refundsNeedingAttention: await this.refunds.countNeedingAttention(),
    };
  }

  /**
   * CU-19 (flujo 2a): el listado filtrado como CSV, una fila por pedido
   * (decisión de la Fase 6). `;` y BOM para que Excel en español lo abra
   * con las columnas separadas y los acentos bien.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async exportCsv(query: QueryAdminOrdersDto): Promise<string> {
    const orders = await this.filteredQuery(query).limit(EXPORT_LIMIT).getMany();
    const itemCounts = await this.countItems(orders.map((o) => o.id));
    const header = [
      'Número',
      'Fecha',
      'Cliente',
      'Email',
      'Estado',
      'Estado de pago',
      'Productos',
      'Total',
      'Método de envío',
      'Dirección',
      'Transportista',
      'Seguimiento',
    ];
    const rows = orders.map((order) => {
      const a = order.shippingAddressSnapshot;
      return [
        order.orderNumber,
        // 24 h: el formato de 12 h de es-AR no indica a. m./p. m. en todos los entornos.
        order.createdAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' }),
        `${order.user.firstName} ${order.user.lastName}`,
        order.user.email,
        ORDER_STATUS_LABELS[order.status],
        PAYMENT_STATUS_LABELS[customerPaymentStatus(order)],
        itemCounts.get(order.id) ?? 0,
        order.total,
        order.shippingMethodSnapshot.name,
        `${a.street} ${a.number}${a.floorApt ? ` ${a.floorApt}` : ''}, ${a.city}, ${a.province} (${a.postalCode})`,
        order.trackingCarrier ?? '',
        order.trackingNumber ?? '',
      ];
    });
    const escape = (value: unknown) => {
      const text = String(value);
      return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return '\uFEFF' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
  }

  /**
   * CU-19 (paso 4): detalle completo — incluye lo que el Cliente no ve
   * (notas internas, actor de cada cambio, intentos de pago y el detalle de
   * los reembolsos).
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async getDetail(orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: { items: true, user: true } });
    if (!order) throw new NotFoundException('El pedido no existe');

    const [history, notes, ledger, returnRequests] = await Promise.all([
      this.dataSource.getRepository(OrderStatusHistory).find({
        where: { orderId },
        relations: { actor: true },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(OrderNote).find({ where: { orderId }, relations: { author: true }, order: { createdAt: 'ASC' } }),
      this.ledger.findByOrder(orderId),
      this.dataSource.getRepository(ReturnRequest).find({
        where: { orderId },
        relations: { items: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const person = (u: { id: string; firstName: string; lastName: string } | null) =>
      u ? { id: u.id, name: `${u.firstName} ${u.lastName}` } : null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      cancellationCause: order.cancellationCause,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      reservationExpiresAt: AWAITING_PAYMENT_STATUSES.includes(order.status) ? order.reservationExpiresAt : null,
      // Nunca la entidad User completa (tiene el hash de la contraseña).
      customer: { id: order.user.id, name: `${order.user.firstName} ${order.user.lastName}`, email: order.user.email },
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      shippingMethod: order.shippingMethodSnapshot,
      shippingAddress: order.shippingAddressSnapshot,
      tracking: { carrier: order.trackingCarrier, number: order.trackingNumber, dispatchedAt: order.dispatchedAt },
      items: [...order.items]
        .sort((a, b) => a.productNameSnapshot.localeCompare(b.productNameSnapshot))
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productNameSnapshot,
          variantAttributes: item.variantAttributesSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotal,
          stockCommitted: item.stockCommitted,
        })),
      paymentStatus: customerPaymentStatus(order),
      payments: ledger.payments.map((p) => ({
        id: p.id,
        externalPaymentId: p.externalPaymentId,
        status: p.status,
        amount: p.amount,
        method: p.method,
        installments: p.installments,
        processedAt: p.processedAt,
      })),
      refunds: ledger.refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        originCu: r.originCu,
        reason: r.reason,
        externalRefundId: r.externalRefundId,
        lastError: r.lastError,
        resolutionNote: r.resolutionNote,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        needsAttention: REFUND_NEEDS_ATTENTION.includes(r.status),
      })),
      statusHistory: history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        at: h.createdAt,
        reason: h.reason,
        actor: person(h.actor),
      })),
      notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt, author: person(n.author) })),
      returnRequests: returnRequests.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt,
        itemCount: r.items.reduce((sum, i) => sum + i.quantityRequested, 0),
      })),
      // Paso 5 / flujo 7a: lo que el Administrador puede hacer desde acá.
      actions: {
        transitions: ADMIN_TRANSITIONS[order.status] ?? [],
        canCancel: !ADMIN_NON_CANCELLABLE_STATUSES.includes(order.status),
        canEditTracking: TRACKING_EDITABLE_STATUSES.includes(order.status),
      },
    };
  }

  /**
   * CU-19 (pasos 5-10, flujos 7a/7b/8a/9a).
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   * @usecase-includes CU-20
   */
  async changeStatus(adminId: string, orderId: string, dto: ChangeOrderStatusDto): Promise<void> {
    const order = await this.dataSource.transaction(async (manager) => {
      const order = await this.ordersService.lockWithItems(manager, orderId);
      if (!order) throw new NotFoundException('El pedido no existe');
      // CU-19 (flujo 8a): se revalida con el pedido bloqueado.
      if (order.status !== dto.expectedStatus) throw statusChanged(order.status);

      const valid = ADMIN_TRANSITIONS[order.status] ?? [];
      if (!valid.includes(dto.to)) {
        // CU-19 (flujo 7a).
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `No se puede pasar de "${order.status}" a "${dto.to}"`,
          validTransitions: valid,
        });
      }

      // CU-19 (paso 6, flujo 7b): seguimiento opcional al despachar.
      if (dto.to === OrderStatus.DESPACHADO && dto.tracking) {
        await this.applyTracking(manager, order, dto.tracking);
      }
      await this.ordersService.changeStatus(manager, order, dto.to, { actorId: adminId, reason: dto.note?.trim() || null });
      return order;
    });

    // CU-19 (paso 9, flujo 9a): el aviso nunca revierte el cambio de estado.
    await this.notifyStatusChange(order).catch((err: unknown) => {
      this.logger.error(`Pedido ${order.id}: cambió de estado, pero falló el aviso al Cliente`, err as Error);
    });
  }

  /**
   * CU-19 (paso 6, flujo 7b): carga o corrección del seguimiento después
   * de despachar. No avisa al Cliente (decisión de la Fase 6: sólo se
   * avisan los cambios de estado).
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async updateTracking(orderId: string, dto: TrackingDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('El pedido no existe');
      if (!TRACKING_EDITABLE_STATUSES.includes(order.status)) {
        throw new ConflictException({
          code: 'TRACKING_NOT_EDITABLE',
          message: 'El seguimiento se carga sólo en pedidos despachados o entregados',
        });
      }
      await this.applyTracking(manager, order, dto);
    });
  }

  /**
   * CU-19 (flujo 5a): comparte los efectos de CU-14; cambia quién la
   * dispara y el alcance de estados.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   * @usecase-includes CU-20, CU-21
   */
  async cancel(adminId: string, orderId: string, dto: AdminCancelOrderDto): Promise<{ refundRequested: boolean }> {
    const reason = [ADMIN_CANCEL_REASON_LABELS[dto.reason], dto.detail?.trim()].filter(Boolean).join(': ');
    const { order, effects } = await this.dataSource.transaction(async (manager) => {
      const order = await this.ordersService.lockWithItems(manager, orderId);
      if (!order) throw new NotFoundException('El pedido no existe');
      if (order.status !== dto.expectedStatus) throw statusChanged(order.status);
      if (ADMIN_NON_CANCELLABLE_STATUSES.includes(order.status)) {
        throw new ConflictException({ code: 'ORDER_NOT_CANCELLABLE', message: `Un pedido "${order.status}" no se puede cancelar` });
      }
      const effects = await this.cancellation.applyCancellation(manager, order, {
        actorId: adminId,
        cause: OrderCancellationCause.ADMINISTRADOR,
        reason,
        refundOrigin: RefundOrigin.CU_19,
      });
      return { order, effects };
    });

    await this.cancellation.afterCancellation(order, effects).catch((err: unknown) => {
      this.logger.error(`Pedido ${order.id}: cancelado, pero falló el aviso posterior`, err as Error);
    });
    return { refundRequested: effects.refundRequested };
  }

  /**
   * CU-19 (flujo 5c): nota interna sin cambiar el estado.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async addNote(adminId: string, orderId: string, text: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: orderId } });
      if (!order) throw new NotFoundException('El pedido no existe');
      await this.ordersService.appendInternalNote(manager, order, text, adminId);
    });
  }

  private async applyTracking(manager: EntityManager, order: Order, tracking: TrackingDto): Promise<void> {
    const changes = {
      trackingCarrier: tracking.carrier?.trim() || null,
      trackingNumber: tracking.number?.trim() || null,
      dispatchedAt: tracking.dispatchedAt ? new Date(tracking.dispatchedAt) : null,
    };
    Object.assign(order, changes);
    await manager.update(Order, order.id, changes);
  }

  private async notifyStatusChange(order: Order): Promise<void> {
    const user = await this.usersService.findById(order.userId);
    if (!user) return;
    await this.notificationsService.send({
      userId: user.id,
      recipientEmail: user.email,
      template: EmailTemplate.CAMBIO_ESTADO_PEDIDO,
      relatedOrderId: order.id,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        tracking:
          order.trackingCarrier || order.trackingNumber
            ? { carrier: order.trackingCarrier, number: order.trackingNumber }
            : null,
      },
    });
  }

  private filteredQuery(query: QueryAdminOrdersDto): SelectQueryBuilder<Order> {
    const qb = this.orderRepo.createQueryBuilder('o').innerJoinAndSelect('o.user', 'u');

    if (query.number) qb.andWhere('o.orderNumber = :number', { number: query.number });
    if (query.customer?.trim()) {
      const term = `%${query.customer.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('u.email ILIKE :term', { term })
            .orWhere(`(u.firstName || ' ' || u.lastName) ILIKE :term`, { term }),
        ),
      );
    }
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.from) qb.andWhere('o.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('o.createdAt <= :to', { to: query.to });

    switch (query.paymentStatus) {
      case 'pendiente':
        qb.andWhere('o.status IN (:...awaiting)', {
          awaiting: AWAITING_PAYMENT_STATUSES.filter((s) => s !== OrderStatus.PAGO_RECHAZADO),
        });
        break;
      case 'rechazado':
        qb.andWhere('o.status = :rejected', { rejected: OrderStatus.PAGO_RECHAZADO });
        break;
      case 'aprobado':
        qb.andWhere(`(o.status IN (:...paid) OR (o.status = :cancelled AND o.paidAt IS NOT NULL))`, {
          paid: PAID_STATUSES,
          cancelled: OrderStatus.CANCELADO,
        });
        break;
      case 'sin_pago':
        qb.andWhere('o.status = :cancelled AND o.paidAt IS NULL', { cancelled: OrderStatus.CANCELADO });
        break;
    }

    if (query.refunds === 'requieren_gestion') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id AND r.status IN (:...attention))',
        { attention: REFUND_NEEDS_ATTENTION },
      );
    }

    switch (query.sort ?? 'fecha_desc') {
      case 'fecha_asc':
        qb.orderBy('o.createdAt', 'ASC');
        break;
      case 'total_desc':
        qb.orderBy('o.total', 'DESC');
        break;
      case 'total_asc':
        qb.orderBy('o.total', 'ASC');
        break;
      case 'estado':
        qb.orderBy(
          `CASE o.status ${LIFECYCLE_ORDER.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`,
          'ASC',
        );
        break;
      default:
        qb.orderBy('o.createdAt', 'DESC');
    }
    // Desempate único para que la paginación sea estable.
    return qb.addOrderBy('o.orderNumber', 'DESC');
  }

  private toRow(order: Order, itemCount: number) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customer: { name: `${order.user.firstName} ${order.user.lastName}`, email: order.user.email },
      itemCount,
      total: order.total,
      status: order.status,
      paymentStatus: customerPaymentStatus(order),
    };
  }

  private async countItems(orderIds: string[]): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    const rows = await this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('i')
      .select('i.orderId', 'orderId')
      .addSelect('SUM(i.quantity)', 'count')
      .where({ orderId: In(orderIds) })
      .groupBy('i.orderId')
      .getRawMany<{ orderId: string; count: string }>();
    return new Map(rows.map((row) => [row.orderId, Number(row.count)]));
  }
}
