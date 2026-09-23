import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { StockReservationService, type StockLine } from '../products/stock/stock-reservation.service.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderStatusHistory } from './entities/order-status-history.entity.js';
import { Order } from './entities/order.entity.js';
import {
  AWAITING_PAYMENT_STATUSES,
  OrderCancellationCause,
  OrderStatus,
  PAID_STATUSES,
  canTransition,
} from './order-status.js';

/** Resultado verificado de un pago, ya traducido del estado crudo de la pasarela (CU-05 paso 7). */
export type PaymentOutcome = 'aprobado' | 'rechazado' | 'pendiente';

export interface ApplyPaymentResult {
  /** El pedido cambió de estado: CU-05 notifica al Cliente sólo en ese caso. */
  changed: boolean;
  /** Algo que no se aplica pero queda para revisión del Administrador (CU-05 7b-1, doble pago). */
  discrepancy?: string;
  /** CU-05 (7a-1): ítems cuyo stock ya no alcanzó al confirmar el pago. */
  shortages?: StockLine[];
}

/**
 * Ciclo de vida del pedido: transiciones de estado con historial, efecto
 * de un pago verificado sobre el pedido (lo invoca `payments`, CU-05) y
 * vencimiento de la reserva de stock (CU-03 18a). El checkout en sí
 * (crear el pedido) está en `CheckoutService`.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockReservation: StockReservationService,
  ) {}

  /**
   * Cambia el estado validando contra el grafo de `order-status.ts` y deja
   * la transición en el historial. `actorId` null = transición automática.
   */
  async changeStatus(
    manager: EntityManager,
    order: Order,
    to: OrderStatus,
    opts: { actorId?: string | null; reason?: string | null; cancellationCause?: OrderCancellationCause } = {},
  ): Promise<void> {
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`Transición de estado inválida: ${order.status} → ${to}`);
    }
    if (to === OrderStatus.CANCELADO && !opts.cancellationCause) {
      throw new Error('Toda cancelación debe indicar su causa (OrderCancellationCause)');
    }
    const from = order.status;
    order.status = to;
    order.cancellationCause = to === OrderStatus.CANCELADO ? opts.cancellationCause! : null;
    await manager.update(Order, order.id, { status: to, cancellationCause: order.cancellationCause });
    await this.recordHistory(manager, order.id, from, to, opts);
  }

  async recordHistory(
    manager: EntityManager,
    orderId: string,
    from: OrderStatus | null,
    to: OrderStatus,
    opts: { actorId?: string | null; reason?: string | null } = {},
  ): Promise<void> {
    await manager.save(
      manager.create(OrderStatusHistory, {
        orderId,
        fromStatus: from,
        toStatus: to,
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? null,
      }),
    );
  }

  /**
   * Toma el pedido con lock de fila: serializa el webhook de pago (CU-05),
   * el vencimiento de reserva y la compensación del checkout sobre el mismo
   * pedido. Los ítems se cargan aparte porque Postgres no permite
   * `FOR UPDATE` sobre el lado opcional de un LEFT JOIN.
   */
  async lockWithItems(manager: EntityManager, orderId: string): Promise<Order | null> {
    const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
    if (!order) return null;
    order.items = await manager.find(OrderItem, { where: { orderId } });
    return order;
  }

  /** Libera la reserva de stock del pedido si todavía la tenía (CU-03 17a/18a, CU-05 7.b). */
  async releaseReservation(manager: EntityManager, order: Order): Promise<void> {
    if (!order.stockReservationActive) return;
    await this.stockReservation.release(manager, this.stockLines(order));
    order.stockReservationActive = false;
    await manager.update(Order, order.id, { stockReservationActive: false });
  }

  /**
   * CU-05 (paso 7): aplica el resultado verificado de un pago sobre el
   * pedido. Debe llamarse dentro de la transacción del procesamiento del
   * pago, con el pedido tomado por `lockWithItems`.
   *
   * @usecase CU-05 Procesar confirmación de pago
   */
  async applyPaymentOutcome(
    manager: EntityManager,
    order: Order,
    outcome: PaymentOutcome,
    externalPaymentId: string,
  ): Promise<ApplyPaymentResult> {
    const paid = PAID_STATUSES.includes(order.status);

    switch (outcome) {
      case 'aprobado': {
        if (paid) {
          return {
            changed: false,
            discrepancy: `Pago ${externalPaymentId} aprobado sobre un pedido que ya estaba "${order.status}" (posible doble cobro)`,
          };
        }
        if (order.status === OrderStatus.CANCELADO && order.cancellationCause !== OrderCancellationCause.RESERVA_VENCIDA) {
          // Cancelado a propósito (cliente, administrador o falla de la
          // pasarela): un pago tardío no lo revive, hay que devolverlo (CU-21).
          return {
            changed: false,
            discrepancy: `Pago ${externalPaymentId} aprobado sobre un pedido cancelado (${order.cancellationCause}): requiere reembolso`,
          };
        }
        // CU-05 (7.a): descuento firme del stock. Si la reserva ya se había
        // liberado (venció o hubo un rechazo previo), se intenta tomar del
        // disponible — lo que no alcance es el faltante de 7a-1.
        const wasCancelled = order.status === OrderStatus.CANCELADO;
        const shortages = await this.stockReservation.confirmSale(manager, this.stockLines(order), {
          reservationActive: order.stockReservationActive,
          reason: `Venta — pedido ${order.id}`,
        });
        order.stockReservationActive = false;
        await manager.update(Order, order.id, { stockReservationActive: false });

        if (shortages.length > 0) {
          // CU-05 (flujo 7a-1): se confirma el pago igual, se anota el
          // faltante para el Administrador (lo gestiona desde CU-19).
          await this.appendInternalNote(manager, order, this.describeShortages(order, shortages));
          this.logger.warn(`Pedido ${order.id} pagado con faltante de stock: requiere gestión del Administrador (CU-19)`);
        }
        await this.changeStatus(manager, order, OrderStatus.PAGADO, {
          reason: wasCancelled
            ? `Pago ${externalPaymentId} aprobado después de vencida la reserva`
            : `Pago ${externalPaymentId} aprobado`,
        });
        return { changed: true, shortages };
      }

      case 'rechazado': {
        if (paid) {
          // CU-05 (flujo 7b-1): no se revierte un pedido ya pagado.
          return {
            changed: false,
            discrepancy: `Pago ${externalPaymentId} rechazado/cancelado sobre un pedido ya "${order.status}"`,
          };
        }
        if (order.status !== OrderStatus.PENDIENTE_PAGO && order.status !== OrderStatus.PAGO_PENDIENTE_ACREDITACION) {
          // Ya rechazado o cancelado: nada que aplicar.
          return { changed: false };
        }
        // CU-05 (7.b): pago rechazado, se libera la reserva.
        await this.releaseReservation(manager, order);
        await this.changeStatus(manager, order, OrderStatus.PAGO_RECHAZADO, {
          reason: `Pago ${externalPaymentId} rechazado`,
        });
        return { changed: true };
      }

      case 'pendiente': {
        if (order.status === OrderStatus.PAGO_RECHAZADO) {
          // Tras un rechazo, el Cliente reintentó dentro de la misma
          // preferencia con un medio que queda pendiente (p. ej. efectivo).
          // La reserva se había liberado: se intenta volver a tomarla; si
          // ya no alcanza, se sigue igual y lo resuelve 7a-1 al acreditarse.
          const reservation = await this.stockReservation.reserve(manager, this.stockLines(order));
          if (reservation.ok) {
            order.stockReservationActive = true;
            await manager.update(Order, order.id, { stockReservationActive: true });
          } else {
            await this.appendInternalNote(
              manager,
              order,
              `Pago ${externalPaymentId} pendiente tras un rechazo: no se pudo volver a reservar el stock`,
            );
          }
        } else if (order.status !== OrderStatus.PENDIENTE_PAGO) {
          return { changed: false };
        }
        // CU-05 (7.c): pendiente de acreditación, se mantiene la reserva.
        await this.changeStatus(manager, order, OrderStatus.PAGO_PENDIENTE_ACREDITACION, {
          reason: `Pago ${externalPaymentId} pendiente de acreditación`,
        });
        return { changed: true };
      }
    }
  }

  async appendInternalNote(manager: EntityManager, order: Order, note: string): Promise<void> {
    const stamped = `[${new Date().toISOString()}] ${note}`;
    order.internalNotes = order.internalNotes ? `${order.internalNotes}\n${stamped}` : stamped;
    await manager.update(Order, order.id, { internalNotes: order.internalNotes });
  }

  /**
   * CU-03 (flujo 18a): los pedidos que siguen sin pago acreditado al vencer
   * la reserva (24 h desde el alta) liberan el stock y pasan a "cancelado".
   * Proceso automático sin actor humano; por eso no es un CU propio.
   *
   * @usecase CU-03 Realizar checkout (flujo 18a)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireReservations(now: Date = new Date()): Promise<number> {
    const due = await this.orderRepo.find({
      select: { id: true },
      where: { status: In(AWAITING_PAYMENT_STATUSES), reservationExpiresAt: LessThan(now) },
    });

    let expired = 0;
    for (const { id } of due) {
      // Cada pedido en su propia transacción: si el webhook de pago (CU-05)
      // lo está procesando en este mismo momento, el lock de fila serializa
      // ambos y acá se revalida el estado antes de cancelar.
      const didExpire = await this.dataSource.transaction(async (manager) => {
        const order = await this.lockWithItems(manager, id);
        if (!order || !AWAITING_PAYMENT_STATUSES.includes(order.status) || order.reservationExpiresAt >= now) {
          return false;
        }
        await this.releaseReservation(manager, order);
        await this.changeStatus(manager, order, OrderStatus.CANCELADO, {
          reason: 'Venció la reserva de stock (24 h) sin pago acreditado',
          cancellationCause: OrderCancellationCause.RESERVA_VENCIDA,
        });
        return true;
      });
      if (didExpire) expired++;
    }
    if (expired > 0) this.logger.log(`Reserva vencida: ${expired} pedido(s) pasaron a "cancelado"`);
    return expired;
  }

  /**
   * Pedidos que la reconciliación periódica de CU-05 vuelve a consultar a
   * la pasarela. Incluye `pago_rechazado`: el Cliente puede reintentar
   * dentro de la misma preferencia y ese pago aprobado también puede
   * perder su webhook.
   */
  findAwaitingPaymentIds(): Promise<string[]> {
    return this.orderRepo
      .find({ select: { id: true }, where: { status: In(AWAITING_PAYMENT_STATUSES) } })
      .then((orders) => orders.map((o) => o.id));
  }

  findById(orderId: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { id: orderId } });
  }

  /**
   * CU-05 (paso 11): estado actual del pedido cuando el Cliente vuelve de
   * la pasarela. El detalle completo con historial es CU-13 (Fase 5).
   */
  async findOwnedOrFail(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('El pedido no existe');
    return {
      id: order.id,
      status: order.status,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      shippingMethod: order.shippingMethodSnapshot,
      shippingAddress: order.shippingAddressSnapshot,
      reservationExpiresAt: order.reservationExpiresAt,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        variantAttributes: item.variantAttributesSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.subtotal,
      })),
    };
  }

  private stockLines(order: Order): StockLine[] {
    return order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }));
  }

  private describeShortages(order: Order, shortages: StockLine[]): string {
    const names = shortages.map((s) => {
      const item = order.items.find((i) => i.variantId === s.variantId);
      return `${item?.productNameSnapshot ?? s.variantId} ×${s.quantity}`;
    });
    return `Pago acreditado sin stock suficiente (la reserva había vencido). Faltante: ${names.join(', ')}.`;
  }
}
