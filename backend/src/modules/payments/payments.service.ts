import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { toCents } from '../../common/money.js';
import { EmailTemplate } from '../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  type ApplyPaymentResult,
  OrdersService,
  type PaymentOutcome,
} from '../orders/orders.service.js';
import { UsersService } from '../users/users.service.js';
import {
  PaymentAuditEvent,
  PaymentAuditLog,
} from './entities/payment-audit-log.entity.js';
import {
  FINAL_PAYMENT_STATUSES,
  Payment,
  PaymentStatus,
} from './entities/payment.entity.js';
import {
  type GatewayPayment,
  PAYMENT_GATEWAY,
  PaymentGatewayUnavailableError,
  PaymentNotFoundError,
} from './gateway/payment-gateway.interface.js';
import type { PaymentGateway } from './gateway/payment-gateway.interface.js';
import { verifyWebhookSignature } from './gateway/webhook-signature.js';

export interface WebhookNotification {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
}

export type ProcessResult =
  | 'processed'
  | 'ignored'
  | 'invalid'
  | 'order_not_found'
  | 'duplicate'
  | 'discrepancy'
  | 'gateway_unavailable';

/** `retorno_cliente`: la página de resultado pidió reconciliar (CU-05 paso 11). */
type ProcessSource = 'webhook' | 'reconciliacion' | 'retorno_cliente';

/**
 * Estado crudo de MercadoPago → estado del pago y efecto sobre el pedido
 * (CU-05 paso 7). `refunded`/`charged_back`/`in_mediation` quedan fuera:
 * son posteriores a la acreditación y los trata CU-21 (Fase 6).
 */
const STATUS_MAP: Record<
  string,
  { status: PaymentStatus; outcome: PaymentOutcome }
> = {
  approved: { status: PaymentStatus.APROBADO, outcome: 'aprobado' },
  rejected: { status: PaymentStatus.RECHAZADO, outcome: 'rechazado' },
  cancelled: { status: PaymentStatus.CANCELADO, outcome: 'rechazado' },
  pending: {
    status: PaymentStatus.PENDIENTE_ACREDITACION,
    outcome: 'pendiente',
  },
  in_process: {
    status: PaymentStatus.PENDIENTE_ACREDITACION,
    outcome: 'pendiente',
  },
  authorized: {
    status: PaymentStatus.PENDIENTE_ACREDITACION,
    outcome: 'pendiente',
  },
};

/**
 * CU-05 Procesar confirmación de pago. Actor principal: la Pasarela de
 * Pago, vía webhook. Nunca confía en el contenido del webhook: sólo usa
 * el id del pago para consultar el estado real a la pasarela.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webhookSecret: string;
  private readonly currency: string;
  /** CU-05 (5a): 3 intentos con espera creciente entre ellos. Los tests lo acortan. */
  retryDelaysMs = [1000, 2000];
  private reconciling = false;

  constructor(
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentAuditLog)
    private readonly auditRepo: Repository<PaymentAuditLog>,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    config: ConfigService,
  ) {
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET')!;
    this.currency = config.get<string>('PAYMENT_CURRENCY')!;
  }

  /**
   * CU-05 (pasos 1-3): valida formato y firma de la notificación y, si es
   * auténtica, procesa el pago que menciona.
   *
   * @usecase CU-05 Procesar confirmación de pago
   */
  async handleNotification(
    notification: WebhookNotification,
  ): Promise<ProcessResult> {
    const { type, dataId } = this.parseNotification(notification);

    // Otros tópicos (merchant_order, etc.) no son un error: no le interesan a CU-05.
    if (type !== 'payment') return 'ignored';

    if (!dataId) {
      // CU-05 (flujo 3a): notificación mal formada.
      await this.audit(PaymentAuditEvent.NOTIFICACION_INVALIDA, {
        payload: { reason: 'Sin data.id' },
      });
      return 'invalid';
    }

    const signatureError = verifyWebhookSignature({
      xSignature: notification.headers['x-signature'],
      xRequestId: notification.headers['x-request-id'],
      dataId,
      secret: this.webhookSecret,
    });
    if (signatureError) {
      // CU-05 (flujo 3a): notificación no auténtica.
      await this.audit(PaymentAuditEvent.NOTIFICACION_INVALIDA, {
        externalPaymentId: dataId,
        payload: { reason: signatureError },
      });
      return 'invalid';
    }

    return this.processPayment(dataId, 'webhook');
  }

  /**
   * CU-05 (pasos 4-10): reconcilia un pago contra la pasarela y deja el
   * pedido consistente. Lo usan el webhook y la reconciliación periódica.
   *
   * @usecase CU-05 Procesar confirmación de pago
   * @usecase-includes CU-20
   */
  async processPayment(
    externalPaymentId: string,
    source: ProcessSource,
  ): Promise<ProcessResult> {
    // CU-05 (paso 5): estado real consultado a la pasarela.
    let payment: GatewayPayment;
    try {
      // Con el Cliente esperando la respuesta no se reintenta: si la
      // pasarela no responde, lo retoman el webhook o el cron.
      payment = await this.fetchPaymentWithRetry(
        externalPaymentId,
        source === 'retorno_cliente' ? [] : this.retryDelaysMs,
      );
    } catch (err) {
      if (err instanceof PaymentNotFoundError) {
        // CU-05 (flujo 3a): el pago mencionado no existe en la pasarela.
        await this.audit(PaymentAuditEvent.NOTIFICACION_INVALIDA, {
          externalPaymentId,
          payload: { reason: 'El pago no existe en la pasarela', source },
        });
        return 'invalid';
      }
      // CU-05 (flujo 5a): sin respuesta tras 3 intentos. El pedido no se
      // toca; lo retoma la reconciliación periódica.
      await this.audit(PaymentAuditEvent.PASARELA_NO_DISPONIBLE, {
        externalPaymentId,
        payload: { error: (err as Error).message, source },
      });
      return 'gateway_unavailable';
    }

    const mapped = STATUS_MAP[payment.status];
    if (!mapped) {
      this.logger.log(
        `Pago ${payment.id} en estado "${payment.status}": fuera del alcance de CU-05, se ignora`,
      );
      return 'ignored';
    }

    // CU-05 (paso 4): pedido asociado, por la referencia externa.
    const orderId = payment.orderId;
    if (
      !orderId ||
      !isUUID(orderId) ||
      !(await this.ordersService.findById(orderId))
    ) {
      // CU-05 (flujo 4a).
      await this.audit(PaymentAuditEvent.PEDIDO_INEXISTENTE, {
        externalPaymentId: payment.id,
        payload: { externalReference: orderId, source },
      });
      return 'order_not_found';
    }

    type TxResult =
      | { kind: 'duplicate'; previous: PaymentStatus }
      | { kind: 'discrepancy'; detail: string }
      | {
          kind: 'processed';
          applied: ApplyPaymentResult;
          orderStatus: string;
          userId: string;
          total: string;
        };

    const result = await this.dataSource.transaction(
      async (manager): Promise<TxResult> => {
        // El lock del pedido serializa notificaciones concurrentes del mismo
        // pago (MercadoPago suele mandar varias casi a la vez).
        const order = (await this.ordersService.lockWithItems(
          manager,
          orderId,
        ))!;
        const existing = await manager.findOne(Payment, {
          where: { externalPaymentId: payment.id },
        });

        // CU-05 (paso 6, flujo 6a): ya procesado, o llegó fuera de orden
        // (un "pendiente" después de un estado final).
        if (
          existing &&
          (existing.status === mapped.status ||
            (FINAL_PAYMENT_STATUSES.includes(existing.status) &&
              !FINAL_PAYMENT_STATUSES.includes(mapped.status)))
        ) {
          return { kind: 'duplicate', previous: existing.status };
        }
        // Un pago ya final que la pasarela informa con otro estado final
        // (p. ej. aprobado → cancelado) no se pisa: se conserva lo aplicado
        // y queda para revisión. Contracargos y reembolsos son CU-21.
        if (existing && FINAL_PAYMENT_STATUSES.includes(existing.status)) {
          const detail = `Pago ${payment.id} ya registrado como "${existing.status}" y ahora informado como "${mapped.status}": no se modifica`;
          await this.ordersService.appendInternalNote(manager, order, detail);
          return { kind: 'discrepancy', detail };
        }

        // CU-05 (paso 8): registro del pago.
        await manager.save(
          Object.assign(existing ?? manager.create(Payment), {
            orderId: order.id,
            provider: 'mercadopago',
            externalPaymentId: payment.id,
            status: mapped.status,
            amount: payment.amount.toFixed(2),
            installments: payment.installments,
            method: payment.method,
            rawPayload: payment.raw,
            processedAt: new Date(),
          }),
        );

        // Un aprobado por un importe distinto al del pedido no se acredita:
        // el servidor nunca da por pagado algo que no cobró completo.
        if (
          mapped.outcome === 'aprobado' &&
          (toCents(payment.amount) !== toCents(order.total) ||
            (payment.currency !== null && payment.currency !== this.currency))
        ) {
          const detail = `Pago ${payment.id} aprobado por ${payment.amount} ${payment.currency ?? ''}, pero el pedido es de ${order.total} ${this.currency}: no se acredita`;
          await this.ordersService.appendInternalNote(manager, order, detail);
          return { kind: 'discrepancy', detail };
        }

        // CU-05 (paso 7).
        const applied = await this.ordersService.applyPaymentOutcome(
          manager,
          order,
          mapped.outcome,
          payment.id,
        );
        if (applied.discrepancy) {
          // CU-05 (flujo 7b-1) o doble pago: no se aplica, queda para revisión.
          await this.ordersService.appendInternalNote(
            manager,
            order,
            applied.discrepancy,
          );
          return { kind: 'discrepancy', detail: applied.discrepancy };
        }
        return {
          kind: 'processed',
          applied,
          orderStatus: order.status,
          userId: order.userId,
          total: order.total,
        };
      },
    );

    if (result.kind === 'duplicate') {
      // La reconciliación periódica vuelve a ver pagos ya procesados todo el
      // tiempo: sólo se audita el duplicado cuando lo trajo un webhook.
      if (source === 'webhook') {
        await this.audit(PaymentAuditEvent.NOTIFICACION_DUPLICADA, {
          orderId,
          externalPaymentId: payment.id,
          payload: { status: payment.status, previous: result.previous },
        });
      }
      return 'duplicate';
    }

    if (result.kind === 'discrepancy') {
      this.logger.warn(`Pedido ${orderId}: ${result.detail}`);
      await this.audit(PaymentAuditEvent.DISCREPANCIA, {
        orderId,
        externalPaymentId: payment.id,
        payload: { detail: result.detail, source },
      });
      return 'discrepancy';
    }

    // CU-05 (paso 9): sólo si el pedido cambió de estado — una notificación
    // repetida o sin efecto nunca reenvía correos (flujo 6a).
    if (result.applied.changed) {
      await this.notifyCustomer(
        orderId,
        result.userId,
        mapped.outcome,
        result.orderStatus,
        result.total,
      );
    }

    // CU-05 (paso 10).
    await this.audit(PaymentAuditEvent.PAGO_PROCESADO, {
      orderId,
      externalPaymentId: payment.id,
      payload: {
        source,
        gatewayStatus: payment.status,
        statusDetail: payment.statusDetail,
        orderStatus: result.orderStatus,
        orderChanged: result.applied.changed,
        shortages: result.applied.shortages ?? [],
      },
    });
    return 'processed';
  }

  /**
   * CU-05 (Observaciones): reconciliación periódica cada 30 min de los
   * pedidos que siguen esperando el pago — cubre los webhooks que nunca
   * llegaron o que fallaron por el flujo 5a.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileAwaitingOrders(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      for (const orderId of await this.ordersService.findAwaitingPaymentIds()) {
        await this.reconcileOrder(orderId);
      }
    } finally {
      this.reconciling = false;
    }
  }

  /**
   * Consulta a la pasarela los pagos de un pedido y procesa cada uno.
   * Mismo modelo de confianza que el webhook: el estado sale de la API.
   */
  async reconcileOrder(
    orderId: string,
    source: Exclude<ProcessSource, 'webhook'> = 'reconciliacion',
  ): Promise<void> {
    let payments: GatewayPayment[];
    try {
      payments = await this.gateway.findPaymentsByOrder(orderId);
    } catch (err) {
      this.logger.warn(
        `Reconciliación del pedido ${orderId}: la pasarela no respondió (${(err as Error).message})`,
      );
      return;
    }
    for (const payment of payments) {
      await this.processPayment(payment.id, source);
    }
  }

  private async fetchPaymentWithRetry(
    paymentId: string,
    delaysMs: number[],
  ): Promise<GatewayPayment> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.gateway.getPayment(paymentId);
      } catch (err) {
        const canRetry =
          err instanceof PaymentGatewayUnavailableError &&
          attempt < delaysMs.length;
        if (!canRetry) throw err;
        await new Promise((resolve) =>
          setTimeout(resolve, delaysMs[attempt]),
        );
      }
    }
  }

  private async notifyCustomer(
    orderId: string,
    userId: string,
    outcome: PaymentOutcome,
    orderStatus: string,
    total: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;
    // CU-20 nunca revierte al solicitante: un fallo de correo queda en EmailLog.
    await this.notificationsService.send({
      userId,
      recipientEmail: user.email,
      template: EmailTemplate.RESULTADO_PAGO,
      relatedOrderId: orderId,
      data: { orderId, resultado: outcome, estadoPedido: orderStatus, total },
    });
  }

  /**
   * MercadoPago manda `?data.id=...&type=payment` en la query y
   * `{ type, data: { id } }` en el body; el formato viejo (IPN) usa
   * `?topic=payment&id=...`. Se aceptan los tres.
   */
  private parseNotification({ query, body }: WebhookNotification): {
    type?: string;
    dataId?: string;
  } {
    const b = (typeof body === 'object' && body !== null ? body : {}) as {
      type?: unknown;
      data?: { id?: unknown };
    };
    const q = query as Record<string, unknown> & { data?: { id?: unknown } };
    const type = [q.type, q.topic, b.type].find(
      (v): v is string => typeof v === 'string',
    );
    const dataId = [q['data.id'], q.data?.id, q.id, b.data?.id].find(
      (v): v is string | number =>
        (typeof v === 'string' && v.length > 0) || typeof v === 'number',
    );
    return { type, dataId: dataId === undefined ? undefined : String(dataId) };
  }

  private async audit(
    eventType: PaymentAuditEvent,
    data: {
      orderId?: string;
      externalPaymentId?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        eventType,
        orderId: data.orderId ?? null,
        externalPaymentId: data.externalPaymentId ?? null,
        payload: data.payload ?? null,
      }),
    );
  }
}
