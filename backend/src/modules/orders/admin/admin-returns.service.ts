import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { fromCents, toCents } from '../../../common/money.js';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { RefundOrigin } from '../../payments/entities/refund.entity.js';
import { PaymentLedgerService } from '../../payments/ledger/payment-ledger.service.js';
import { RefundsService } from '../../payments/refunds/refunds.service.js';
import { ProductsService } from '../../products/products.service.js';
import { StockReservationService } from '../../products/stock/stock-reservation.service.js';
import { UsersService } from '../../users/users.service.js';
import type { Order } from '../entities/order.entity.js';
import { RETURN_RECEPTION_DAYS, receptionDeadline } from '../order-policies.js';
import { OrderStatus } from '../order-status.js';
import { OrdersService } from '../orders.service.js';
import { ReplacementStatus, ReturnReplacement } from '../returns/entities/return-replacement.entity.js';
import { ReturnItemCondition, ReturnRequestItem } from '../returns/entities/return-request-item.entity.js';
import { ReturnRequest, ReturnRequestStatus, ReturnRequestType } from '../returns/entities/return-request.entity.js';
import { RETURN_INSTRUCTIONS } from '../returns/returns.service.js';
import {
  ApproveReturnDto,
  DispatchReplacementDto,
  QueryAdminReturnsDto,
  ReceiveReturnDto,
  RejectReturnDto,
} from './dto/resolve-return.dto.js';

/** Decisión de la Fase 6. */
const PAGE_SIZE = 20;

type PosventaEvent = 'aprobada' | 'rechazada' | 'resuelta' | 'reposicion_despachada';

/**
 * CU-22 Resolver solicitud de cambio o devolución (admin): aprobar
 * (total o parcialmente), rechazar, registrar la recepción con sus efectos
 * (stock, reembolso o reposición) y despachar la reposición de un cambio.
 */
@Injectable()
export class AdminReturnsService {
  private readonly logger = new Logger(AdminReturnsService.name);

  constructor(
    @InjectRepository(ReturnRequest)
    private readonly requestRepo: Repository<ReturnRequest>,
    @InjectRepository(ReturnReplacement)
    private readonly replacementRepo: Repository<ReturnReplacement>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly stock: StockReservationService,
    private readonly ledger: PaymentLedgerService,
    private readonly refunds: RefundsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Bandeja de solicitudes (CU-22 precondición 3), con el seguimiento de
   * las aprobadas que no llegaron a tiempo (flujo 8a).
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   */
  async list(query: QueryAdminReturnsDto) {
    const page = query.page ?? 1;
    const overdueBefore = this.overdueBefore();
    const qb = this.requestRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.order', 'o')
      .innerJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('r.items', 'ri')
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.requestNumber', 'DESC');
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.reception === 'vencidas') {
      qb.andWhere('r.status = :approved AND r.approvedAt < :overdueBefore', {
        approved: ReturnRequestStatus.APROBADA,
        overdueBefore,
      });
    }
    if (query.replacements === 'pendientes') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM return_replacements rr WHERE rr.return_request_id = r.id AND rr.status = :pendingReplacement)',
        { pendingReplacement: ReplacementStatus.PENDIENTE_DESPACHO },
      );
    }
    const [requests, total] = await qb
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();

    const { pending, overdue } = await this.counters();

    return {
      items: requests.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt,
        order: { id: r.order.id, orderNumber: r.order.orderNumber },
        customer: { name: `${r.order.user.firstName} ${r.order.user.lastName}`, email: r.order.user.email },
        units: r.items.reduce((sum, i) => sum + i.quantityRequested, 0),
        ...this.receptionInfo(r),
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
      counters: { pending, overdue },
    };
  }

  /**
   * Contadores de la barra de admin (decisión de la Fase 6): solicitudes
   * por resolver, aprobadas con el plazo de recepción vencido (8a) y
   * reposiciones de cambios pendientes de despacho (10a).
   */
  async counters(): Promise<{ pending: number; overdue: number; replacementsPending: number }> {
    const [pending, overdue, replacementsPending] = await Promise.all([
      this.requestRepo.count({ where: { status: ReturnRequestStatus.SOLICITADA } }),
      this.requestRepo
        .createQueryBuilder('r')
        .where('r.status = :approved AND r.approvedAt < :overdueBefore', {
          approved: ReturnRequestStatus.APROBADA,
          overdueBefore: this.overdueBefore(),
        })
        .getCount(),
      this.replacementRepo.count({ where: { status: ReplacementStatus.PENDIENTE_DESPACHO } }),
    ]);
    return { pending, overdue, replacementsPending };
  }

  /** Aprobadas antes de esta fecha ya vencieron su plazo de recepción (8a). */
  private overdueBefore(): Date {
    return new Date(Date.now() - RETURN_RECEPTION_DAYS * 24 * 60 * 60 * 1000);
  }

  /**
   * CU-22 (paso 2, flujo 2a): la solicitud con todo lo necesario para
   * resolverla, incluidas las variantes disponibles para reponer un cambio.
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   */
  async getDetail(requestId: string) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: { items: { orderItem: true }, photos: true, replacements: true, order: { user: true } },
    });
    if (!request) throw new NotFoundException('La solicitud no existe');

    const options =
      request.type === ReturnRequestType.CAMBIO && request.status === ReturnRequestStatus.APROBADA
        ? await this.productsService.findReplacementOptions([...new Set(request.items.map((i) => i.orderItem.productId))])
        : new Map();

    return {
      id: request.id,
      requestNumber: request.requestNumber,
      type: request.type,
      status: request.status,
      reason: request.reason,
      createdAt: request.createdAt,
      approvedAt: request.approvedAt,
      receivedAt: request.receivedAt,
      resolvedAt: request.resolvedAt,
      resolutionNote: request.resolutionNote,
      internalNote: request.internalNote,
      refundId: request.refundId,
      ...this.receptionInfo(request),
      order: {
        id: request.order.id,
        orderNumber: request.order.orderNumber,
        status: request.order.status,
        deliveredAt: request.order.deliveredAt,
      },
      customer: {
        name: `${request.order.user.firstName} ${request.order.user.lastName}`,
        email: request.order.user.email,
      },
      photos: request.photos.map((p) => p.url),
      items: request.items.map((ri) => ({
        orderItemId: ri.orderItemId,
        productName: ri.orderItem.productNameSnapshot,
        variantAttributes: ri.orderItem.variantAttributesSnapshot,
        purchased: ri.orderItem.quantity,
        unitPrice: ri.orderItem.unitPriceSnapshot,
        quantityRequested: ri.quantityRequested,
        quantityApproved: ri.quantityApproved,
        quantityReceived: ri.quantityReceived,
        condition: ri.condition,
        refundApproved: ri.refundApproved,
        replacementOptions: options.get(ri.orderItem.productId) ?? [],
      })),
      replacements: request.replacements.map((r) => ({
        id: r.id,
        orderItemId: r.orderItemId,
        productName: r.productNameSnapshot,
        variantAttributes: r.variantAttributesSnapshot,
        quantity: r.quantity,
        status: r.status,
        tracking: { carrier: r.trackingCarrier, number: r.trackingNumber, dispatchedAt: r.dispatchedAt },
      })),
      // 2a: resuelta o rechazada, sólo lectura.
      actions: {
        canApproveOrReject: request.status === ReturnRequestStatus.SOLICITADA,
        canReceive: request.status === ReturnRequestStatus.APROBADA,
        canDispatchReplacement: request.replacements.some((r) => r.status === ReplacementStatus.PENDIENTE_DESPACHO),
      },
    };
  }

  /**
   * CU-22 (pasos 3-7, flujo 4a).
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   * @usecase-includes CU-20
   */
  async approve(adminId: string, requestId: string, dto: ApproveReturnDto): Promise<void> {
    const { request, order } = await this.dataSource.transaction(async (manager) => {
      const { request, order } = await this.lockRequest(manager, requestId, ReturnRequestStatus.SOLICITADA);

      const byItem = new Map(dto.items.map((i) => [i.orderItemId, i.quantityApproved]));
      const sameItems =
        byItem.size === dto.items.length &&
        byItem.size === request.items.length &&
        request.items.every((ri) => byItem.has(ri.orderItemId));
      if (!sameItems) {
        throw new BadRequestException('Indicá la cantidad aprobada de cada producto de la solicitud');
      }
      let partial = false;
      for (const ri of request.items) {
        const approved = byItem.get(ri.orderItemId)!;
        if (approved > ri.quantityRequested) {
          throw new BadRequestException('No se puede aprobar más de lo que pidió el Cliente');
        }
        if (approved < ri.quantityRequested) partial = true;
        ri.quantityApproved = approved;
      }
      if (request.items.every((ri) => ri.quantityApproved === 0)) {
        throw new BadRequestException('No aprobaste ninguna unidad: para eso, rechazá la solicitud');
      }
      // CU-22 (flujo 4a): el resto queda rechazado con su motivo.
      if (partial && !dto.rejectionReason) {
        throw new BadRequestException('Indicá el motivo de lo que no se aprueba');
      }

      await manager.save(request.items);
      Object.assign(request, {
        status: ReturnRequestStatus.APROBADA,
        approvedAt: new Date(),
        resolvedByUserId: adminId,
        internalNote: dto.internalNote || null,
        resolutionNote: partial ? dto.rejectionReason! : null,
      });
      await manager.save(request);
      return { request, order };
    });

    // CU-22 (paso 7): aprobación con instrucciones de envío.
    await this.notify(order, request, 'aprobada', {
      instructions: RETURN_INSTRUCTIONS,
      receptionDeadline: receptionDeadline(request.approvedAt!),
      partialRejectionReason: request.resolutionNote,
    });
  }

  /**
   * CU-22 (flujo 3a): no toca stock ni pago; el pedido sigue "entregado".
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   * @usecase-includes CU-20
   */
  async reject(adminId: string, requestId: string, dto: RejectReturnDto): Promise<void> {
    const { request, order } = await this.dataSource.transaction(async (manager) => {
      const { request, order } = await this.lockRequest(manager, requestId, ReturnRequestStatus.SOLICITADA);
      for (const ri of request.items) ri.quantityApproved = 0;
      await manager.save(request.items);
      Object.assign(request, {
        status: ReturnRequestStatus.RECHAZADA,
        resolvedAt: new Date(),
        resolvedByUserId: adminId,
        resolutionNote: dto.reason,
      });
      await manager.save(request);
      return { request, order };
    });
    await this.notify(order, request, 'rechazada', { reason: dto.reason });
  }

  /**
   * CU-22 (pasos 8-12, flujos 9a/10a/10b): una sola recepción (decisión de
   * la Fase 6) que reingresa el stock y reembolsa o repone.
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   * @usecase-includes CU-20, CU-21
   */
  async receive(adminId: string, requestId: string, dto: ReceiveReturnDto): Promise<void> {
    const { request, order, refundId } = await this.dataSource.transaction(async (manager) => {
      const { request, order } = await this.lockRequest(manager, requestId, ReturnRequestStatus.APROBADA);

      const byItem = new Map(dto.items.map((i) => [i.orderItemId, i]));
      if (request.items.some((ri) => (ri.quantityApproved ?? 0) > 0 && !byItem.has(ri.orderItemId))) {
        throw new BadRequestException('Indicá qué llegó de cada producto aprobado');
      }
      const received = request.items.filter((ri) => (byItem.get(ri.orderItemId)?.quantityReceived ?? 0) > 0);
      if (received.length === 0) {
        // Flujo 8a: si no llegó nada, la solicitud sigue "aprobada".
        throw new BadRequestException('Registrá al menos una unidad recibida');
      }
      for (const ri of request.items) {
        const input = byItem.get(ri.orderItemId);
        if (input && input.quantityReceived > (ri.quantityApproved ?? 0)) {
          throw new BadRequestException(`De "${ri.orderItem.productNameSnapshot}" se aprobaron ${ri.quantityApproved} unidad(es)`);
        }
      }

      const reason = `Solicitud #${request.requestNumber} — pedido #${order.orderNumber}`;
      // CU-22 (paso 9, flujo 9a).
      await this.stock.restockReturn(
        manager,
        received.map((ri) => {
          const input = byItem.get(ri.orderItemId)!;
          return {
            variantId: ri.orderItem.variantId,
            quantity: input.quantityReceived,
            damaged: input.condition === ReturnItemCondition.DANADO,
          };
        }),
        { reason, actorId: adminId },
      );

      for (const ri of request.items) {
        const input = byItem.get(ri.orderItemId);
        ri.quantityReceived = input?.quantityReceived ?? 0;
        ri.condition = input && input.quantityReceived > 0 ? input.condition : null;
        // En buen estado siempre se reembolsa; dañado, a criterio del admin (9a).
        ri.refundApproved =
          request.type === ReturnRequestType.DEVOLUCION && ri.quantityReceived > 0
            ? ri.condition === ReturnItemCondition.OK || input?.refund === true
            : null;
      }
      await manager.save(request.items);

      let refundId: string | null = null;
      if (request.type === ReturnRequestType.DEVOLUCION) {
        // CU-22 (paso 10): sólo productos, sin envío (decisión de la Fase 6).
        const amountCents = request.items
          .filter((ri) => ri.refundApproved)
          .reduce((sum, ri) => sum + toCents(ri.orderItem.unitPriceSnapshot) * ri.quantityReceived!, 0);
        if (amountCents > 0) {
          const refund = await this.ledger.requestRefund(manager, {
            orderId: order.id,
            amount: fromCents(amountCents),
            originCu: RefundOrigin.CU_22,
            reason: reason,
          });
          refundId = refund?.id ?? null;
          if (!refund) {
            // CU-22 (flujo 10b): la solicitud se resuelve igual.
            await this.ordersService.appendInternalNote(
              manager,
              order,
              `${reason}: no se pudo registrar el reembolso de ${fromCents(amountCents)}; gestionarlo a mano`,
            );
          }
        }
        await this.markReturnedIfComplete(manager, order, request, adminId);
      } else {
        await this.createReplacements(manager, request, received, byItem, { reason, actorId: adminId });
        // CU-22 (flujo 10a): el pedido sigue "entregado", con la nota de la reposición.
        await this.ordersService.appendInternalNote(
          manager,
          order,
          `${reason}: cambio resuelto, reposición pendiente de despacho`,
          adminId,
        );
      }

      Object.assign(request, {
        status: ReturnRequestStatus.RESUELTA,
        receivedAt: new Date(),
        resolvedAt: new Date(),
        resolvedByUserId: adminId,
        refundId,
        internalNote: [request.internalNote, dto.internalNote].filter(Boolean).join('\n') || null,
        resolutionNote: dto.resolutionNote || request.resolutionNote,
      });
      await manager.save(request);
      return { request, order, refundId };
    });

    // CU-22 (paso 10) → CU-21 (pasos 4-6); si falla queda para el admin (10b).
    if (refundId) await this.refunds.dispatch(refundId);
    // CU-22 (paso 12).
    await this.notify(order, request, 'resuelta', { resolutionNote: request.resolutionNote });
  }

  /**
   * CU-22 (flujo 10a): despacho de la reposición, con seguimiento opcional
   * (decisión de la Fase 6).
   *
   * @usecase CU-22 Resolver solicitud de cambio o devolución
   * @usecase-includes CU-20
   */
  async dispatchReplacement(requestId: string, dto: DispatchReplacementDto): Promise<void> {
    const { request, order } = await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(ReturnRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('La solicitud no existe');
      const pending = await manager.find(ReturnReplacement, {
        where: { returnRequestId: requestId, status: ReplacementStatus.PENDIENTE_DESPACHO },
      });
      if (pending.length === 0) {
        throw new ConflictException({ code: 'NO_PENDING_REPLACEMENT', message: 'No hay reposiciones pendientes de despacho' });
      }
      for (const replacement of pending) {
        Object.assign(replacement, {
          status: ReplacementStatus.DESPACHADO,
          trackingCarrier: dto.carrier || null,
          trackingNumber: dto.number || null,
          dispatchedAt: new Date(),
        });
      }
      await manager.save(pending);
      const order = (await this.ordersService.lockWithItems(manager, request.orderId))!;
      return { request, order };
    });
    await this.notify(order, request, 'reposicion_despachada', {
      tracking: dto.carrier || dto.number ? { carrier: dto.carrier ?? null, number: dto.number ?? null } : null,
    });
  }

  /** Toma la solicitud y su pedido con lock, y exige el estado de partida (flujo 2a). */
  private async lockRequest(manager: EntityManager, requestId: string, expected: ReturnRequestStatus) {
    const found = await manager.findOne(ReturnRequest, { where: { id: requestId } });
    if (!found) throw new NotFoundException('La solicitud no existe');
    // El pedido primero (mismo orden de locks que CU-15), después la solicitud.
    const order = (await this.ordersService.lockWithItems(manager, found.orderId))!;
    const request = (await manager.findOne(ReturnRequest, { where: { id: requestId }, lock: { mode: 'pessimistic_write' } }))!;
    request.items = await manager.find(ReturnRequestItem, { where: { returnRequestId: requestId }, relations: { orderItem: true } });
    if (request.status !== expected) {
      // CU-22 (flujo 2a): ya resuelta o rechazada, o la resolvió otro admin.
      throw new ConflictException({
        code: 'RETURN_STATUS_CHANGED',
        message: `La solicitud está "${request.status}": no se puede resolver de nuevo`,
        currentStatus: request.status,
      });
    }
    return { request, order };
  }

  /** CU-22 (paso 10): "devuelto" sólo si ya volvió todo lo comprado (decisión de la Fase 6). */
  private async markReturnedIfComplete(manager: EntityManager, order: Order, current: ReturnRequest, adminId: string) {
    if (order.status !== OrderStatus.ENTREGADO) return;
    const resolved = await manager.find(ReturnRequest, {
      where: { orderId: order.id, type: ReturnRequestType.DEVOLUCION, status: ReturnRequestStatus.RESUELTA },
      relations: { items: true },
    });
    const returnedByItem = new Map<string, number>();
    for (const request of [...resolved.filter((r) => r.id !== current.id), current]) {
      for (const ri of request.items) {
        returnedByItem.set(ri.orderItemId, (returnedByItem.get(ri.orderItemId) ?? 0) + (ri.quantityReceived ?? 0));
      }
    }
    if (order.items.every((item) => (returnedByItem.get(item.id) ?? 0) >= item.quantity)) {
      await this.ordersService.changeStatus(manager, order, OrderStatus.DEVUELTO, {
        actorId: adminId,
        reason: `Devolución total — solicitud #${current.requestNumber}`,
      });
    }
  }

  /** CU-22 (flujo 10a): una reposición por ítem recibido, de la variante que eligió el admin. */
  private async createReplacements(
    manager: EntityManager,
    request: ReturnRequest,
    received: ReturnRequestItem[],
    byItem: Map<string, { quantityReceived: number; replacementVariantId?: string }>,
    opts: { reason: string; actorId: string },
  ) {
    const options = await this.productsService.findReplacementOptions([...new Set(received.map((ri) => ri.orderItem.productId))]);
    for (const ri of received) {
      const input = byItem.get(ri.orderItemId)!;
      const variant = (options.get(ri.orderItem.productId) ?? []).find((v) => v.id === input.replacementVariantId);
      if (!variant) {
        throw new BadRequestException(`Elegí la variante de reposición de "${ri.orderItem.productNameSnapshot}" (del mismo producto)`);
      }
      const taken = await this.stock.takeForReplacement(
        manager,
        { variantId: variant.id, quantity: input.quantityReceived },
        { reason: `Reposición por cambio — ${opts.reason}`, actorId: opts.actorId },
      );
      if (!taken) {
        // Decisión de la Fase 6: se rechaza y el admin elige otra variante.
        throw new ConflictException({
          code: 'REPLACEMENT_OUT_OF_STOCK',
          message: `La variante elegida para "${ri.orderItem.productNameSnapshot}" no tiene stock suficiente: elegí otra`,
          orderItemId: ri.orderItemId,
        });
      }
      await manager.save(
        manager.create(ReturnReplacement, {
          returnRequestId: request.id,
          orderItemId: ri.orderItemId,
          variantId: variant.id,
          productNameSnapshot: ri.orderItem.productNameSnapshot,
          variantAttributesSnapshot: variant.attributes,
          quantity: input.quantityReceived,
          status: ReplacementStatus.PENDIENTE_DESPACHO,
          trackingCarrier: null,
          trackingNumber: null,
          dispatchedAt: null,
        }),
      );
    }
  }

  private receptionInfo(request: ReturnRequest) {
    if (request.status !== ReturnRequestStatus.APROBADA || !request.approvedAt) {
      return { receptionDeadline: null, receptionOverdue: false };
    }
    const deadline = receptionDeadline(request.approvedAt);
    return { receptionDeadline: deadline, receptionOverdue: deadline < new Date() };
  }

  /** «include» CU-20, con la plantilla `resultado_posventa` (decisión de la Fase 6). Nunca revierte la resolución. */
  private async notify(order: Order, request: ReturnRequest, event: PosventaEvent, data: Record<string, unknown>) {
    try {
      const user = await this.usersService.findById(order.userId);
      if (!user) return;
      await this.notificationsService.send({
        userId: user.id,
        recipientEmail: user.email,
        template: EmailTemplate.RESULTADO_POSVENTA,
        relatedOrderId: order.id,
        data: { event, orderNumber: order.orderNumber, requestNumber: request.requestNumber, type: request.type, ...data },
      });
    } catch (err) {
      this.logger.error(`Solicitud #${request.requestNumber}: no se pudo avisar al Cliente (${event})`, err as Error);
    }
  }
}
