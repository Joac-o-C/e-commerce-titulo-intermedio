export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PreferenceItem {
  id: string;
  title: string;
  quantity: number;
  /** Precio unitario en la moneda de la tienda, con 2 decimales. */
  unitPrice: number;
}

export interface CreatePreferenceInput {
  orderId: string;
  items: PreferenceItem[];
  payerEmail: string;
  /** La preferencia deja de aceptar pagos cuando vence la reserva de stock (CU-03 18a). */
  expiresAt: Date;
}

export interface CreatedPreference {
  preferenceId: string;
  /** URL a la que el frontend redirige al Cliente para pagar (CU-03 paso 18). */
  redirectUrl: string;
}

/**
 * Pago tal como lo informa la pasarela al consultarla (CU-05 paso 5), ya
 * normalizado: el resto del sistema nunca ve el shape crudo del SDK salvo
 * en `raw`, que se guarda sólo para auditoría.
 */
export interface GatewayPayment {
  id: string;
  /** Estado crudo de MercadoPago: approved, rejected, cancelled, pending, in_process, ... */
  status: string;
  statusDetail: string | null;
  amount: number;
  currency: string | null;
  installments: number | null;
  method: string | null;
  /** `external_reference` de la preferencia: el id del pedido. */
  orderId: string | null;
  raw: unknown;
}

/**
 * La pasarela no respondió (CU-03 17a, CU-05 5a). Se distingue de un
 * rechazo de negocio para que CU-05 sepa que tiene que reintentar.
 */
export class PaymentGatewayUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PaymentGatewayUnavailableError';
  }
}

/**
 * La pasarela respondió, pero ese pago no existe: la notificación que lo
 * mencionaba no es válida (CU-05 3a) y no tiene sentido reintentarla.
 */
export class PaymentNotFoundError extends Error {
  constructor(readonly paymentId: string) {
    super(`El pago ${paymentId} no existe en la pasarela`);
    this.name = 'PaymentNotFoundError';
  }
}

/** Reembolso tal como lo informa la pasarela (CU-21 pasos 5 y 8), ya normalizado. */
export interface GatewayRefund {
  id: string;
  paymentId: string;
  /** Estado crudo: approved, in_process, rejected, cancelled. */
  status: string;
  amount: number;
  raw: unknown;
}

export interface CreateRefundInput {
  /** Id del pago en la pasarela (`Payment.externalPaymentId`). */
  paymentId: string;
  amount: number;
  /**
   * Clave de idempotencia: reintentar con la misma clave (timeout, cron que
   * retoma un envío) devuelve el mismo reembolso en vez de crear otro.
   */
  idempotencyKey: string;
}

/**
 * La pasarela respondió y rechazó el reembolso (CU-21 flujo 5a: pago muy
 * antiguo, medio que no admite reversa, saldo insuficiente). A diferencia
 * de `PaymentGatewayUnavailableError`, reintentar no lo arregla.
 */
export class RefundRejectedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RefundRejectedError';
  }
}

/**
 * Puerto hacia la Pasarela de Pago (actor secundario de CU-03, principal de
 * CU-05). `orders` y `payments` dependen sólo de esta interfaz: en
 * desarrollo y en tests la implementa `FakePaymentGateway`, y con
 * credenciales reales `MercadoPagoGateway` (SDK oficial).
 */
export interface PaymentGateway {
  createPreference(input: CreatePreferenceInput): Promise<CreatedPreference>;
  getPayment(paymentId: string): Promise<GatewayPayment>;
  /** Reconciliación periódica (CU-05, Observaciones): pagos de un pedido. */
  findPaymentsByOrder(orderId: string): Promise<GatewayPayment[]>;
  /**
   * Deja de aceptar pagos en una preferencia: al cancelar un pedido impago
   * (CU-14 7b) y al reemplazarla por otra en el reintento de pago (CU-13
   * 7b). Puede fallar con `PaymentGatewayUnavailableError`.
   */
  expirePreference(preferenceId: string): Promise<void>;
  /** CU-21 (pasos 4-5). Puede fallar con `RefundRejectedError` o `PaymentGatewayUnavailableError`. */
  createRefund(input: CreateRefundInput): Promise<GatewayRefund>;
  /** CU-21 (paso 8): estado real del reembolso, sin confiar en el webhook. */
  getRefund(paymentId: string, refundId: string): Promise<GatewayRefund>;
}
