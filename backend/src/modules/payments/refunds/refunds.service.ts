import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { Order } from '../../orders/entities/order.entity.js';
import { UsersService } from '../../users/users.service.js';
import { PaymentAuditEvent, PaymentAuditLog } from '../entities/payment-audit-log.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { REFUND_NEEDS_ATTENTION, Refund, RefundStatus } from '../entities/refund.entity.js';
import {
  type GatewayRefund,
  PAYMENT_GATEWAY,
  PaymentGatewayUnavailableError,
  RefundRejectedError,
} from '../gateway/payment-gateway.interface.js';
import type { PaymentGateway } from '../gateway/payment-gateway.interface.js';
import { PaymentLedgerService } from '../ledger/payment-ledger.service.js';

/** Estado crudo de la pasarela → resultado final del reembolso (CU-21 pasos 9 y 9a). */
const FINAL_REFUND_STATUS: Record<string, RefundStatus.REEMBOLSADO | RefundStatus.RECHAZADO> = {
  approved: RefundStatus.REEMBOLSADO,
  rejected: RefundStatus.RECHAZADO,
  cancelled: RefundStatus.RECHAZADO,
};

/**
 * CU-21 Procesar reembolso, pasos 4 a 11: pedir a la pasarela los
 * reembolsos que CU-14/19/22 (y los automáticos de CU-05) dejaron
 * registrados "en trámite", y aplicar su resultado cuando la pasarela lo
 * confirma. Actor principal: el Sistema.
 *
 * Nunca retiene un lock mientras espera a la pasarela. Lo que evita pedir
 * dos veces el mismo reembolso es la clave de idempotencia (`id` +
 * `attempt`), y lo que evita aplicar dos veces un resultado es que cada
 * transición es un UPDATE condicional sobre el estado anterior.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  /** CU-21 (4a): 3 intentos con espera creciente. Los tests lo acortan. */
  retryDelaysMs = [1000, 2000];
  private dispatching = false;
  private reconciling = false;

  constructor(
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(PaymentAuditLog)
    private readonly auditRepo: Repository<PaymentAuditLog>,
    private readonly ledger: PaymentLedgerService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * CU-21 (pasos 4-6): pide el reembolso a la pasarela. Se llama después
   * del commit del CU solicitante; si falla o se corta, el cron lo retoma.
   * Nunca lanza: el CU solicitante sigue su flujo pase lo que pase.
   *
   * @usecase CU-21 Procesar reembolso
   */
  async dispatch(refundId: string): Promise<void> {
    const refund = await this.refundRepo.findOne({ where: { id: refundId }, relations: { payment: true } });
    if (!refund || refund.status !== RefundStatus.EN_TRAMITE || refund.externalRefundId) return;

    let result: GatewayRefund;
    try {
      result = await this.createWithRetry(refund);
    } catch (err) {
      if (err instanceof RefundRejectedError) {
        // CU-21 (flujo 5a): rechazo de la pasarela. Alerta al
        // Administrador (panel) y aviso al Cliente.
        const moved = await this.transition(refund, RefundStatus.EN_TRAMITE, {
          status: RefundStatus.RECHAZADO,
          resolvedAt: new Date(),
          lastError: err.message,
        });
        if (moved) {
          await this.audit(PaymentAuditEvent.REEMBOLSO_RECHAZADO, refund, { error: err.message });
          await this.notifyCustomer(refund, 'rechazado');
        }
        return;
      }
      // CU-21 (flujo 4a): sin respuesta tras 3 intentos. Queda para el
      // Administrador; el intento no cambia, así un reintento reusa la clave
      // de idempotencia (la pasarela pudo haberlo creado antes del timeout).
      const moved = await this.transition(refund, RefundStatus.EN_TRAMITE, {
        status: RefundStatus.PENDIENTE_DE_GESTION,
        lastError: (err as Error).message,
      });
      if (moved) await this.audit(PaymentAuditEvent.REEMBOLSO_PASARELA_NO_DISPONIBLE, refund, { error: (err as Error).message });
      return;
    }

    // CU-21 (paso 6): se guarda el id sólo si nadie lo guardó antes (cron y
    // dispatch inmediato pueden correr a la vez; la pasarela devolvió el
    // mismo reembolso a ambos por la clave de idempotencia).
    const saved = await this.refundRepo.update(
      { id: refund.id, status: RefundStatus.EN_TRAMITE, externalRefundId: IsNull(), attempt: refund.attempt },
      { externalRefundId: result.id, lastError: null },
    );
    if (saved.affected === 1) {
      await this.audit(PaymentAuditEvent.REEMBOLSO_SOLICITADO, refund, { externalRefundId: result.id, status: result.status });
    }
    // MercadoPago suele aprobar los reembolsos de tarjeta en el acto.
    await this.applyGatewayResult({ ...refund, externalRefundId: result.id }, result);
  }

  /**
   * CU-21 (pasos 7-11): la pasarela avisó novedades de un pago; se
   * consultan sus reembolsos en trámite. Lo llama el webhook de pagos
   * (MercadoPago notifica los reembolsos por el tópico `payment`).
   *
   * @usecase CU-21 Procesar reembolso
   */
  async reconcilePayment(externalPaymentId: string): Promise<void> {
    const refunds = await this.refundRepo.find({
      where: {
        status: RefundStatus.EN_TRAMITE,
        externalRefundId: Not(IsNull()),
        payment: { externalPaymentId },
      },
      relations: { payment: true },
    });
    for (const refund of refunds) await this.reconcileOne(refund);
  }

  /** Retoma los reembolsos registrados que todavía no se pidieron (corte a mitad, reinicio). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async dispatchPending(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const pending = await this.refundRepo.find({
        select: { id: true },
        where: { status: RefundStatus.EN_TRAMITE, externalRefundId: IsNull() },
      });
      for (const { id } of pending) await this.dispatch(id);
    } finally {
      this.dispatching = false;
    }
  }

  /** Igual que la reconciliación de pagos de CU-05: cubre los webhooks de reembolso que nunca llegaron. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileInProgress(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const refunds = await this.refundRepo.find({
        where: { status: RefundStatus.EN_TRAMITE, externalRefundId: Not(IsNull()) },
        relations: { payment: true },
      });
      for (const refund of refunds) await this.reconcileOne(refund);
    } finally {
      this.reconciling = false;
    }
  }

  /**
   * Gestión del Administrador sobre un reembolso rechazado o pendiente de
   * gestión (alerta de CU-21 4a/5a): volver a pedirlo a la pasarela.
   * Pendiente de gestión reusa el mismo intento (la pasarela pudo haberlo
   * creado antes de quedarse sin responder); un rechazo abre uno nuevo.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   * @usecase-includes CU-21
   */
  async retry(refundId: string, adminId: string): Promise<void> {
    const refund = await this.dataSource.transaction(async (manager) => {
      const refund = await manager.findOne(Refund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
      if (!refund) throw new NotFoundException('El reembolso no existe');
      if (!REFUND_NEEDS_ATTENTION.includes(refund.status)) {
        throw new ConflictException({ code: 'REFUND_NOT_RETRYABLE', message: 'Este reembolso no requiere gestión' });
      }
      // Mientras estuvo rechazado no ocupaba saldo: pudo registrarse otro.
      if (refund.status === RefundStatus.RECHAZADO && !(await this.ledger.fitsInBalance(manager, refund))) {
        throw new ConflictException({
          code: 'REFUND_EXCEEDS_BALANCE',
          message: 'El importe ya no entra en el saldo reembolsable del pago',
        });
      }
      const rejected = refund.status === RefundStatus.RECHAZADO;
      Object.assign(refund, {
        status: RefundStatus.EN_TRAMITE,
        attempt: rejected ? refund.attempt + 1 : refund.attempt,
        externalRefundId: rejected ? null : refund.externalRefundId,
        resolvedAt: null,
        lastError: null,
      });
      await manager.save(refund);
      return refund;
    });
    await this.audit(PaymentAuditEvent.REEMBOLSO_GESTION_MANUAL, refund, { action: 'reintento', adminId, attempt: refund.attempt });
    await this.dispatch(refund.id);
  }

  /**
   * Gestión del Administrador: el dinero se devolvió por fuera de la
   * pasarela (transferencia, etc.). Queda "reembolsado" con la nota.
   *
   * @usecase CU-19 Ver y gestionar pedidos (admin)
   */
  async resolveManually(refundId: string, adminId: string, note: string): Promise<void> {
    const refund = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('El reembolso no existe');
    const moved = await this.refundRepo.update(
      { id: refundId, status: In([...REFUND_NEEDS_ATTENTION]) },
      {
        status: RefundStatus.REEMBOLSADO,
        resolvedAt: new Date(),
        resolutionNote: note,
        resolvedByUserId: adminId,
      },
    );
    if (moved.affected !== 1) {
      throw new ConflictException({ code: 'REFUND_NOT_RETRYABLE', message: 'Este reembolso no requiere gestión' });
    }
    await this.audit(PaymentAuditEvent.REEMBOLSO_GESTION_MANUAL, refund, { action: 'resuelto_por_fuera', adminId, note });
    await this.notifyCustomer(refund, 'reembolsado');
  }

  /** Alerta de CU-21 (4a/5a) en el panel: cuántos reembolsos esperan al Administrador. */
  countNeedingAttention(): Promise<number> {
    return this.refundRepo.count({ where: { status: In([...REFUND_NEEDS_ATTENTION]) } });
  }

  private async reconcileOne(refund: Refund): Promise<void> {
    try {
      // CU-21 (paso 8): el estado sale de la pasarela, no del webhook.
      const result = await this.gateway.getRefund(refund.payment.externalPaymentId, refund.externalRefundId!);
      await this.applyGatewayResult(refund, result);
    } catch (err) {
      this.logger.warn(`Reembolso ${refund.id}: no se pudo consultar a la pasarela (${(err as Error).message})`);
    }
  }

  /** CU-21 (pasos 9-11, flujo 9a); 8b: sólo aplica desde "en trámite", nunca dos veces. */
  private async applyGatewayResult(refund: Refund, result: GatewayRefund): Promise<void> {
    const final = FINAL_REFUND_STATUS[result.status];
    if (!final) return;
    const moved = await this.transition(refund, RefundStatus.EN_TRAMITE, {
      status: final,
      resolvedAt: new Date(),
      lastError: final === RefundStatus.RECHAZADO ? `La pasarela informó el reembolso como "${result.status}"` : null,
    });
    if (!moved) return;
    const accredited = final === RefundStatus.REEMBOLSADO;
    await this.audit(
      accredited ? PaymentAuditEvent.REEMBOLSO_ACREDITADO : PaymentAuditEvent.REEMBOLSO_RECHAZADO,
      refund,
      { externalRefundId: result.id, status: result.status },
    );
    await this.notifyCustomer(refund, accredited ? 'reembolsado' : 'rechazado');
  }

  private async transition(
    refund: Refund,
    from: RefundStatus,
    changes: Partial<Pick<Refund, 'status' | 'resolvedAt' | 'lastError'>>,
  ): Promise<boolean> {
    const result = await this.refundRepo.update({ id: refund.id, status: from, attempt: refund.attempt }, changes);
    return result.affected === 1;
  }

  private async createWithRetry(refund: Refund): Promise<GatewayRefund> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.gateway.createRefund({
          paymentId: refund.payment.externalPaymentId,
          amount: Number(refund.amount),
          idempotencyKey: `${refund.id}-${refund.attempt}`,
        });
      } catch (err) {
        const canRetry = err instanceof PaymentGatewayUnavailableError && attempt < this.retryDelaysMs.length;
        if (!canRetry) throw err;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelaysMs[attempt]));
      }
    }
  }

  /** CU-21 (paso 10, flujo 5a) — «include» CU-20. Un fallo del correo no afecta el reembolso. */
  private async notifyCustomer(refund: Refund, resultado: 'reembolsado' | 'rechazado'): Promise<void> {
    try {
      const order = await this.dataSource.getRepository(Order).findOne({
        select: { id: true, orderNumber: true, userId: true },
        where: { id: refund.orderId },
      });
      const user = order ? await this.usersService.findById(order.userId) : null;
      if (!order || !user) return;
      await this.notificationsService.send({
        userId: user.id,
        recipientEmail: user.email,
        template: EmailTemplate.RESULTADO_REEMBOLSO,
        relatedOrderId: order.id,
        data: { orderNumber: order.orderNumber, amount: refund.amount, resultado },
      });
    } catch (err) {
      this.logger.error(`Reembolso ${refund.id}: no se pudo avisar al Cliente`, err as Error);
    }
  }

  private async audit(eventType: PaymentAuditEvent, refund: Refund, payload: Record<string, unknown>): Promise<void> {
    const payment = refund.payment ?? (await this.dataSource.getRepository(Payment).findOneBy({ id: refund.paymentId }));
    await this.auditRepo.save(
      this.auditRepo.create({
        eventType,
        orderId: refund.orderId,
        externalPaymentId: payment?.externalPaymentId ?? null,
        payload: { refundId: refund.id, amount: refund.amount, ...payload },
      }),
    );
  }
}
