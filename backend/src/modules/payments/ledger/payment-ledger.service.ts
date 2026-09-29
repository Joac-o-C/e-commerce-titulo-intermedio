import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { fromCents, toCents } from '../../../common/money.js';
import { Payment, PaymentStatus } from '../entities/payment.entity.js';
import { Refund, RefundOrigin, RefundStatus } from '../entities/refund.entity.js';

export interface RefundRequest {
  orderId: string;
  amount: string;
  originCu: RefundOrigin;
  reason: string;
  /** Pago puntual a reembolsar (id interno); si no se indica, el primero con saldo suficiente. */
  paymentId?: string;
}

/** Estados en los que un reembolso ya comprometió (o devolvió) parte del saldo del pago. */
const COMMITTED_REFUND_STATUSES = [RefundStatus.EN_TRAMITE, RefundStatus.REEMBOLSADO, RefundStatus.PENDIENTE_DE_GESTION];

/**
 * Pagos y reembolsos de un pedido, para `orders`: lectura (CU-13 muestra
 * medio y estado de pago) y el registro del reembolso que piden CU-14,
 * CU-19 y CU-22 (CU-21 pasos 1-3). Vive en su propio módulo, sin
 * dependencias de dominio, por el mismo motivo que la pasarela: `payments`
 * ya depende de `orders` y la inversa sería un import circular.
 */
@Injectable()
export class PaymentLedgerService {
  private readonly logger = new Logger(PaymentLedgerService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
  ) {}

  async findByOrder(orderId: string): Promise<{ payments: Payment[]; refunds: Refund[] }> {
    const [payments, refunds] = await Promise.all([
      this.paymentRepo.find({ where: { orderId }, order: { createdAt: 'ASC' } }),
      this.refundRepo.find({ where: { orderId }, order: { createdAt: 'ASC' } }),
    ]);
    return { payments, refunds };
  }

  /**
   * CU-21 (pasos 1-3): valida el importe contra lo acreditado y lo ya
   * reembolsado, y registra el reembolso "en trámite". Se llama dentro de
   * la transacción del CU solicitante, con el pedido ya bloqueado (el lock
   * serializa dos pedidos de reembolso sobre el mismo pedido). Devuelve
   * null si no corresponde reembolsar: el solicitante sigue igual.
   *
   * @usecase CU-21 Procesar reembolso (pasos 1-3)
   */
  async requestRefund(manager: EntityManager, request: RefundRequest): Promise<Refund | null> {
    const approved = await manager.find(Payment, {
      where: { orderId: request.orderId, status: PaymentStatus.APROBADO },
      order: { processedAt: 'ASC' },
    });
    if (approved.length === 0) {
      // CU-21 (flujo 2a): no hay pago acreditado.
      return null;
    }

    const refunds = await manager.find(Refund, {
      where: { orderId: request.orderId, status: In(COMMITTED_REFUND_STATUSES) },
    });
    const amountCents = toCents(request.amount);
    // El reembolso va contra un pago puntual (CU-21 paso 4): el primero
    // que todavía tenga saldo suficiente.
    const payment = approved.find(
      (p) => (!request.paymentId || p.id === request.paymentId) && this.refundableCents(p, refunds) >= amountCents,
    );
    if (amountCents <= 0 || !payment) {
      // CU-21 (flujo 2b): importe inválido o mayor al saldo reembolsable.
      this.logger.warn(
        `Pedido ${request.orderId}: reembolso de ${request.amount} rechazado (importe inválido o supera el saldo reembolsable)`,
      );
      return null;
    }

    return manager.save(
      manager.create(Refund, {
        orderId: request.orderId,
        paymentId: payment.id,
        amount: fromCents(amountCents),
        status: RefundStatus.EN_TRAMITE,
        externalRefundId: null,
        originCu: request.originCu,
        reason: request.reason,
        resolvedAt: null,
        attempt: 1,
        lastError: null,
        resolutionNote: null,
        resolvedByUserId: null,
      }),
    );
  }

  /**
   * ¿Entra este reembolso en el saldo de su pago, sin contarse a sí mismo?
   * Lo usa el reintento del Administrador: mientras estuvo rechazado no
   * ocupaba saldo, y entre medio pudo registrarse otro reembolso.
   */
  async fitsInBalance(manager: EntityManager, refund: Refund): Promise<boolean> {
    const payment = await manager.findOneByOrFail(Payment, { id: refund.paymentId });
    const others = await manager.find(Refund, {
      where: { paymentId: refund.paymentId, status: In(COMMITTED_REFUND_STATUSES) },
    });
    return this.refundableCents(payment, others.filter((r) => r.id !== refund.id)) >= toCents(refund.amount);
  }

  private refundableCents(payment: Payment, refunds: Refund[]): number {
    const refunded = refunds.filter((r) => r.paymentId === payment.id).reduce((sum, r) => sum + toCents(r.amount), 0);
    return toCents(payment.amount) - refunded;
  }
}
