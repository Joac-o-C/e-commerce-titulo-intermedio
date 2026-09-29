import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreatePreferenceInput,
  CreateRefundInput,
  CreatedPreference,
  GatewayPayment,
  GatewayRefund,
  PaymentGateway,
} from './payment-gateway.interface.js';
import { PaymentNotFoundError, RefundRejectedError } from './payment-gateway.interface.js';
import { toCents } from '../../../common/money.js';

export type SimulatedOutcome = 'approved' | 'rejected' | 'pending';

interface FakePreference {
  id: string;
  orderId: string;
  items: CreatePreferenceInput['items'];
  amount: number;
  expiresAt: Date;
}

/** Estado crudo que devolvería MercadoPago para cada resultado simulado. */
const RAW_STATUS: Record<SimulatedOutcome, { status: string; statusDetail: string }> = {
  approved: { status: 'approved', statusDetail: 'accredited' },
  rejected: { status: 'rejected', statusDetail: 'cc_rejected_other_reason' },
  pending: { status: 'in_process', statusDetail: 'pending_contingency' },
};

/**
 * Pasarela simulada para desarrollo y tests (PAYMENT_GATEWAY=fake): imita a
 * MercadoPago en memoria — crea "preferencias" que redirigen a una página
 * de pago simulada del frontend, y registra "pagos" que después se
 * consultan igual que en la pasarela real (CU-05 paso 5). No persiste
 * nada: al reiniciar el backend se pierde su estado, lo cual es aceptable
 * porque sólo existe para no depender de credenciales ni de un túnel.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  private readonly preferences = new Map<string, FakePreference>();
  private readonly payments = new Map<string, GatewayPayment>();
  private readonly refunds = new Map<string, GatewayRefund>();
  /** Clave de idempotencia → id del reembolso ya creado con esa clave. */
  private readonly refundKeys = new Map<string, string>();
  private readonly frontendUrl: string;
  private readonly currency: string;

  constructor(config: ConfigService) {
    this.frontendUrl = config.get<string>('FRONTEND_URL')!;
    this.currency = config.get<string>('PAYMENT_CURRENCY')!;
  }

  async createPreference(input: CreatePreferenceInput): Promise<CreatedPreference> {
    const id = `fake-pref-${randomUUID()}`;
    const amount = input.items.reduce((sum, item) => sum + toCents(item.unitPrice) * item.quantity, 0) / 100;
    this.preferences.set(id, { id, orderId: input.orderId, items: input.items, amount, expiresAt: input.expiresAt });
    return { preferenceId: id, redirectUrl: `${this.frontendUrl}/checkout/simulated-payment?preferenceId=${id}` };
  }

  async getPayment(paymentId: string): Promise<GatewayPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new PaymentNotFoundError(paymentId);
    return payment;
  }

  async findPaymentsByOrder(orderId: string): Promise<GatewayPayment[]> {
    return [...this.payments.values()].filter((p) => p.orderId === orderId);
  }

  async expirePreference(preferenceId: string): Promise<void> {
    const preference = this.preferences.get(preferenceId);
    if (preference) preference.expiresAt = new Date();
  }

  /**
   * Como MercadoPago: sólo sobre un pago aprobado y hasta su saldo sin
   * reembolsar. Queda "in_process" hasta que se lo resuelva a mano desde la
   * pasarela simulada (`settleRefund`), así se prueban 5a y 9a.
   */
  async createRefund(input: CreateRefundInput): Promise<GatewayRefund> {
    const existing = this.refundKeys.get(input.idempotencyKey);
    if (existing) return this.refunds.get(existing)!;

    const payment = this.payments.get(input.paymentId);
    if (!payment || payment.status !== 'approved') {
      throw new RefundRejectedError(`El pago ${input.paymentId} no está aprobado en la pasarela simulada`);
    }
    const refundedCents = [...this.refunds.values()]
      .filter((r) => r.paymentId === input.paymentId && r.status !== 'rejected')
      .reduce((sum, r) => sum + toCents(r.amount), 0);
    if (refundedCents + toCents(input.amount) > toCents(payment.amount)) {
      throw new RefundRejectedError(`El reembolso supera el saldo del pago ${input.paymentId}`);
    }

    const id = `fake-refund-${randomUUID()}`;
    const refund: GatewayRefund = {
      id,
      paymentId: input.paymentId,
      status: 'in_process',
      amount: input.amount,
      raw: { simulated: true },
    };
    this.refunds.set(id, refund);
    this.refundKeys.set(input.idempotencyKey, id);
    return refund;
  }

  async getRefund(_paymentId: string, refundId: string): Promise<GatewayRefund> {
    const refund = this.refunds.get(refundId);
    if (!refund) throw new NotFoundException(`El reembolso ${refundId} no existe en la pasarela simulada`);
    return refund;
  }

  /** Lo que haría MercadoPago más tarde: acreditar o rechazar el reembolso (CU-21 pasos 7-9). */
  settleRefund(refundId: string, outcome: 'approved' | 'rejected'): GatewayRefund {
    const refund = this.refunds.get(refundId);
    if (!refund) throw new NotFoundException(`El reembolso ${refundId} no existe en la pasarela simulada (¿se reinició el backend?)`);
    if (refund.status !== 'in_process') {
      throw new ConflictException(`El reembolso ${refundId} ya está "${refund.status}"`);
    }
    refund.status = outcome;
    return refund;
  }

  /**
   * Pantalla "Pasarela simulada" del panel admin (decisión de la Fase 6):
   * lo que en MercadoPago se resolvería solo más tarde — pagos pendientes
   * (efectivo) y reembolsos en proceso —, para acreditarlo o rechazarlo.
   */
  listPending(): { payments: GatewayPayment[]; refunds: (GatewayRefund & { orderId: string | null })[] } {
    return {
      payments: [...this.payments.values()].filter((p) => p.status === RAW_STATUS.pending.status),
      refunds: [...this.refunds.values()]
        .filter((r) => r.status === 'in_process')
        .map((r) => ({ ...r, orderId: this.payments.get(r.paymentId)?.orderId ?? null })),
    };
  }

  getPreference(preferenceId: string): FakePreference {
    const preference = this.preferences.get(preferenceId);
    if (!preference) throw new NotFoundException('La preferencia no existe (¿se reinició el backend?)');
    return preference;
  }

  /** Lo que haría el Cliente dentro de la pasarela: pagar con un resultado dado. */
  simulatePayment(preferenceId: string, outcome: SimulatedOutcome): GatewayPayment {
    const preference = this.getPreference(preferenceId);
    // Como MercadoPago: una preferencia vencida (reserva vencida, pedido
    // cancelado o reemplazada por un reintento) ya no acepta pagos.
    if (preference.expiresAt <= new Date()) {
      throw new ConflictException('La preferencia de pago venció: volvé al pedido para reintentar el pago');
    }
    // Ids numéricos, como los de MercadoPago.
    const id = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const { status, statusDetail } = RAW_STATUS[outcome];
    const payment: GatewayPayment = {
      id,
      status,
      statusDetail,
      amount: preference.amount,
      currency: this.currency,
      installments: 1,
      method: 'fake_card',
      orderId: preference.orderId,
      raw: { simulated: true, preferenceId, outcome },
    };
    this.payments.set(id, payment);
    return payment;
  }

  /** Simula que el pago pendiente se acreditó (o se rechazó) más tarde, como un pago en efectivo. */
  settlePayment(paymentId: string, outcome: Exclude<SimulatedOutcome, 'pending'>): GatewayPayment {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new NotFoundException(`El pago ${paymentId} no existe en la pasarela simulada`);
    // Como en MercadoPago, sólo un pago pendiente puede acreditarse o rechazarse después.
    if (payment.status !== RAW_STATUS.pending.status) {
      throw new ConflictException(`El pago ${paymentId} ya está "${payment.status}": sólo se acredita un pago pendiente`);
    }
    Object.assign(payment, RAW_STATUS[outcome]);
    return payment;
  }
}
