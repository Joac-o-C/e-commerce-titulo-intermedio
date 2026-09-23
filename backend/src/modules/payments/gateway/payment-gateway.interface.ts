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
}
