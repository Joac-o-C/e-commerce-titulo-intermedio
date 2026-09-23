import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, MPNotFoundError, Payment, Preference } from 'mercadopago';
import type {
  CreatePreferenceInput,
  CreatedPreference,
  GatewayPayment,
  PaymentGateway,
} from './payment-gateway.interface.js';
import { PaymentGatewayUnavailableError, PaymentNotFoundError } from './payment-gateway.interface.js';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Integración real con MercadoPago Checkout Pro (SDK oficial `mercadopago`).
 * En sandbox se usa con el access token `TEST-...` de la aplicación.
 */
@Injectable()
export class MercadoPagoGateway implements PaymentGateway {
  private readonly preferences: Preference;
  private readonly payments: Payment;
  private readonly isTestToken: boolean;
  private readonly frontendUrl: string;
  private readonly notificationUrl: string | undefined;
  private readonly currency: string;

  constructor(config: ConfigService) {
    const accessToken = config.get<string>('MP_ACCESS_TOKEN')!;
    const client = new MercadoPagoConfig({ accessToken, options: { timeout: REQUEST_TIMEOUT_MS } });
    this.preferences = new Preference(client);
    this.payments = new Payment(client);
    this.isTestToken = accessToken.startsWith('TEST-');
    this.frontendUrl = config.get<string>('FRONTEND_URL')!;
    this.notificationUrl = config.get<string>('MP_NOTIFICATION_URL');
    this.currency = config.get<string>('PAYMENT_CURRENCY')!;
  }

  /** @usecase CU-03 Realizar checkout (paso 17) */
  async createPreference(input: CreatePreferenceInput): Promise<CreatedPreference> {
    const returnUrl = `${this.frontendUrl}/checkout/result?orderId=${input.orderId}`;
    let response;
    try {
      response = await this.preferences.create({
        body: {
          items: input.items.map((item) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            currency_id: this.currency,
          })),
          payer: { email: input.payerEmail },
          external_reference: input.orderId,
          back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
          // MercadoPago sólo acepta auto_return con back_urls https; en
          // desarrollo (localhost) el Cliente vuelve con el botón de la pasarela.
          ...(returnUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
          ...(this.notificationUrl ? { notification_url: this.notificationUrl } : {}),
          expires: true,
          expiration_date_to: input.expiresAt.toISOString(),
        },
      });
    } catch (err) {
      throw new PaymentGatewayUnavailableError('MercadoPago no pudo crear la preferencia', err);
    }

    const redirectUrl = (this.isTestToken ? response.sandbox_init_point : undefined) ?? response.init_point;
    if (!response.id || !redirectUrl) {
      throw new PaymentGatewayUnavailableError('MercadoPago devolvió una preferencia incompleta');
    }
    return { preferenceId: response.id, redirectUrl };
  }

  /** @usecase CU-05 Procesar confirmación de pago (paso 5: reconciliación) */
  async getPayment(paymentId: string): Promise<GatewayPayment> {
    try {
      return this.normalize(await this.payments.get({ id: paymentId }));
    } catch (err) {
      if (err instanceof MPNotFoundError) throw new PaymentNotFoundError(paymentId);
      throw new PaymentGatewayUnavailableError(`MercadoPago no respondió la consulta del pago ${paymentId}`, err);
    }
  }

  async findPaymentsByOrder(orderId: string): Promise<GatewayPayment[]> {
    try {
      const result = await this.payments.search({ options: { external_reference: orderId } });
      return (result.results ?? []).map((p) => this.normalize(p));
    } catch (err) {
      throw new PaymentGatewayUnavailableError(`MercadoPago no respondió la búsqueda de pagos del pedido ${orderId}`, err);
    }
  }

  private normalize(p: {
    id?: number | string;
    status?: string;
    status_detail?: string;
    transaction_amount?: number;
    currency_id?: string;
    installments?: number;
    payment_method_id?: string;
    external_reference?: string;
  }): GatewayPayment {
    return {
      id: String(p.id),
      status: p.status ?? 'unknown',
      statusDetail: p.status_detail ?? null,
      amount: p.transaction_amount ?? 0,
      currency: p.currency_id ?? null,
      installments: p.installments ?? null,
      method: p.payment_method_id ?? null,
      orderId: p.external_reference ?? null,
      raw: p,
    };
  }
}
