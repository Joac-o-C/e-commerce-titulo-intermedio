import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreatePreferenceInput,
  CreatedPreference,
  GatewayPayment,
  PaymentGateway,
} from './payment-gateway.interface.js';
import { PaymentNotFoundError } from './payment-gateway.interface.js';
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

  getPreference(preferenceId: string): FakePreference {
    const preference = this.preferences.get(preferenceId);
    if (!preference) throw new NotFoundException('La preferencia no existe (¿se reinició el backend?)');
    return preference;
  }

  /** Lo que haría el Cliente dentro de la pasarela: pagar con un resultado dado. */
  simulatePayment(preferenceId: string, outcome: SimulatedOutcome): GatewayPayment {
    const preference = this.getPreference(preferenceId);
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
