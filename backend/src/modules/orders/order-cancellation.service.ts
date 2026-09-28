import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EmailTemplate } from '../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PAYMENT_GATEWAY } from '../payments/gateway/payment-gateway.interface.js';
import type { PaymentGateway } from '../payments/gateway/payment-gateway.interface.js';
import { RefundOrigin } from '../payments/entities/refund.entity.js';
import { PaymentLedgerService } from '../payments/ledger/payment-ledger.service.js';
import { UsersService } from '../users/users.service.js';
import type { Order } from './entities/order.entity.js';
import { customerCancellation } from './order-policies.js';
import { AWAITING_PAYMENT_STATUSES, OrderCancellationCause, OrderStatus } from './order-status.js';
import { OrdersService } from './orders.service.js';

export interface CancellationEffects {
  /** Se registró un reembolso "en trámite" (CU-21 pasos 1-3). */
  refundRequested: boolean;
  /** Estado previo: si esperaba el pago, hay una preferencia que vencer (CU-14 7b). */
  previousStatus: OrderStatus;
}

/**
 * CU-14 Cancelar pedido. Los efectos de la cancelación (pasos 5 a 8)
 * están en `applyCancellation`, que CU-19 reutiliza tal cual para la
 * cancelación del Administrador: la ficha dice que el flujo es el mismo y
 * sólo cambia quién lo dispara.
 */
@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly ordersService: OrdersService,
    private readonly ledger: PaymentLedgerService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * CU-14 (pasos 2-9). `expectedStatus` es el estado que el Cliente vio al
   * confirmar (paso 3): si cambió mientras tanto, no se cancela a ciegas
   * (flujo 5a) — p. ej. llegó la acreditación del pago y ahora la
   * cancelación implica un reembolso que el Cliente no vio.
   *
   * @usecase CU-14 Cancelar pedido
   * @usecase-includes CU-20, CU-21
   */
  async cancelByCustomer(
    userId: string,
    orderId: string,
    input: { expectedStatus: OrderStatus; reason?: string },
  ): Promise<{ refundRequested: boolean }> {
    const { order, effects } = await this.dataSource.transaction(async (manager) => {
      const order = await this.ordersService.lockWithItems(manager, orderId);
      // CU-14 (flujo 2b).
      if (!order || order.userId !== userId) throw new NotFoundException('El pedido no existe');

      // CU-14 (flujo 5a): se revalida con el pedido bloqueado.
      if (order.status !== input.expectedStatus) {
        throw new ConflictException({
          code: 'ORDER_STATUS_CHANGED',
          message: 'El estado del pedido cambió mientras lo mirabas: revisalo antes de cancelar',
          currentStatus: order.status,
        });
      }
      // CU-14 (paso 2, flujos 2a/2c).
      const availability = customerCancellation(order, new Date());
      if (!availability.allowed) {
        throw new ConflictException({ code: availability.code, message: availability.message });
      }

      const effects = await this.applyCancellation(manager, order, {
        actorId: userId,
        cause: OrderCancellationCause.CLIENTE,
        reason: input.reason?.trim() || 'Cancelado por el Cliente',
        refundOrigin: RefundOrigin.CU_14,
      });
      return { order, effects };
    });

    // Ya commiteada: un error del aviso no puede convertir la cancelación
    // en un error para el Cliente (flujo 8a).
    await this.afterCancellation(order, effects).catch((err: unknown) => {
      this.logger.error(`Pedido ${order.id}: cancelado, pero falló el aviso posterior`, err as Error);
    });
    return { refundRequested: effects.refundRequested };
  }

  /**
   * CU-14 (pasos 5-7), compartido con CU-19: estado "cancelado" con
   * historial, stock devuelto y, si había un pago acreditado, reembolso
   * registrado. Se llama dentro de la transacción, con el pedido tomado
   * por `lockWithItems`.
   *
   * @usecase CU-14 Cancelar pedido (pasos 5-7)
   * @usecase-includes CU-21
   */
  async applyCancellation(
    manager: EntityManager,
    order: Order,
    opts: { actorId: string | null; cause: OrderCancellationCause; reason: string; refundOrigin: RefundOrigin },
  ): Promise<CancellationEffects> {
    const previousStatus = order.status;
    // CU-14 (paso 5).
    await this.ordersService.changeStatus(manager, order, OrderStatus.CANCELADO, {
      actorId: opts.actorId,
      reason: opts.reason,
      cancellationCause: opts.cause,
    });
    // CU-14 (paso 6).
    await this.ordersService.returnStockOnCancel(manager, order, opts.actorId);

    // CU-14 (paso 7, flujo 7b): sin pago acreditado no hay reembolso. El
    // importe es el total: el pedido todavía no se despachó.
    let refundRequested = false;
    if (order.paidAt) {
      const refund = await this.ledger.requestRefund(manager, {
        orderId: order.id,
        amount: order.total,
        originCu: opts.refundOrigin,
        reason: `Cancelación del pedido #${order.orderNumber}: ${opts.reason}`,
      });
      refundRequested = refund !== null;
      if (!refund) {
        // CU-14 (flujo 7a): la cancelación queda firme igual; el
        // Administrador resuelve la devolución del dinero desde CU-19.
        await this.ordersService.appendInternalNote(
          manager,
          order,
          'Cancelado con pago acreditado, pero no se pudo registrar el reembolso: gestionarlo a mano',
        );
      }
    }
    return { refundRequested, previousStatus };
  }

  /**
   * CU-14 (flujo 7b y paso 8), después del commit: vence la preferencia
   * de un pedido impago y avisa al Cliente. Ninguna de las dos cosas
   * revierte la cancelación si falla (flujo 8a: el correo queda en EmailLog).
   *
   * @usecase-includes CU-20
   */
  async afterCancellation(order: Order, effects: CancellationEffects): Promise<void> {
    if (AWAITING_PAYMENT_STATUSES.includes(effects.previousStatus) && order.paymentPreferenceId) {
      await this.gateway.expirePreference(order.paymentPreferenceId).catch((err: unknown) => {
        this.logger.warn(`Pedido ${order.id}: no se pudo vencer la preferencia de pago (${(err as Error).message})`);
      });
    }

    const user = await this.usersService.findById(order.userId);
    if (!user) return;
    await this.notificationsService.send({
      userId: user.id,
      recipientEmail: user.email,
      template: EmailTemplate.CANCELACION,
      relatedOrderId: order.id,
      data: {
        orderNumber: order.orderNumber,
        total: order.total,
        refundRequested: effects.refundRequested,
      },
    });
  }
}
