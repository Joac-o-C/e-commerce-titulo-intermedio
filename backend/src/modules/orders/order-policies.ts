import { AWAITING_PAYMENT_STATUSES, OrderStatus, PAID_STATUSES } from './order-status.js';

/** CU-14 (precondición 4): horas desde la acreditación del pago en las que el Cliente puede cancelar solo. */
export const CUSTOMER_CANCEL_WINDOW_HOURS = 24;

/** CU-15 (precondición 3): días corridos desde la entrega para pedir un cambio o una devolución. */
export const RETURN_WINDOW_DAYS = 10;

/** CU-14 (precondición 3). */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDIENTE_PAGO,
  OrderStatus.PAGO_PENDIENTE_ACREDITACION,
  OrderStatus.PAGO_RECHAZADO,
  OrderStatus.PAGADO,
  OrderStatus.EN_PREPARACION,
];

/** CU-13 (flujo 7b) / CU-03 (flujo R). */
export const RETRYABLE_PAYMENT_STATUSES: readonly OrderStatus[] = [OrderStatus.PENDIENTE_PAGO, OrderStatus.PAGO_RECHAZADO];

/** Una acción del detalle del pedido (CU-13 paso 7): habilitada, o el motivo por el que no. */
export type ActionAvailability =
  | { allowed: true; deadline?: Date }
  | { allowed: false; code: string; message: string };

interface OrderLike {
  status: OrderStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  reservationExpiresAt: Date;
}

/**
 * CU-14 (paso 2, flujos 2a/2c): ¿puede el Cliente cancelar este pedido
 * ahora? Misma función para mostrar el botón (CU-13 paso 7) y para
 * validar la cancelación con el pedido bloqueado.
 *
 * @usecase CU-14 Cancelar pedido
 */
export function customerCancellation(order: OrderLike, now: Date): ActionAvailability {
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    // CU-14 (flujo 2a).
    const afterDispatch = order.status === OrderStatus.DESPACHADO || order.status === OrderStatus.ENTREGADO;
    return {
      allowed: false,
      code: 'ORDER_NOT_CANCELLABLE',
      message: afterDispatch
        ? 'El pedido ya fue despachado y no se puede cancelar. Cuando lo recibas podés pedir un cambio o una devolución, o pedirle la cancelación a la tienda.'
        : 'Este pedido ya no se puede cancelar.',
    };
  }
  if (order.paidAt) {
    const deadline = new Date(order.paidAt.getTime() + CUSTOMER_CANCEL_WINDOW_HOURS * 60 * 60 * 1000);
    if (now >= deadline) {
      // CU-14 (flujo 2c).
      return {
        allowed: false,
        code: 'CANCEL_WINDOW_EXPIRED',
        message: `Pasaron más de ${CUSTOMER_CANCEL_WINDOW_HOURS} horas desde que se acreditó el pago: para cancelarlo, comunicate con la tienda.`,
      };
    }
    return { allowed: true, deadline };
  }
  return { allowed: true };
}

/**
 * CU-13 (flujo 7b): el reintento de pago sólo aplica a pedidos que siguen
 * esperando el pago y cuya reserva no venció todavía (vencida, el cron de
 * CU-03 18a los cancela en su próxima pasada).
 *
 * @usecase CU-13 Ver mis pedidos (flujo 7b)
 */
export function paymentRetry(order: OrderLike, now: Date): ActionAvailability {
  if (!RETRYABLE_PAYMENT_STATUSES.includes(order.status)) {
    return { allowed: false, code: 'PAYMENT_RETRY_NOT_ALLOWED', message: 'Este pedido no admite reintentar el pago.' };
  }
  if (now >= order.reservationExpiresAt) {
    return {
      allowed: false,
      code: 'ORDER_EXPIRED',
      message: 'Venció el plazo de 24 horas para pagar este pedido: armá uno nuevo desde el carrito.',
    };
  }
  return { allowed: true, deadline: order.reservationExpiresAt };
}

/**
 * CU-15 (paso 2, flujos 2a/2b): estado "entregado" y dentro de la ventana
 * de posventa. La elegibilidad por ítem (precondición 4, flujo 3a) la
 * agrega quien conoce las solicitudes previas.
 *
 * @usecase CU-15 Solicitar cambio o devolución
 */
export function returnWindow(order: OrderLike, now: Date): ActionAvailability {
  if (order.status !== OrderStatus.ENTREGADO || !order.deliveredAt) {
    // CU-15 (flujo 2a).
    const beforeDispatch = CUSTOMER_CANCELLABLE_STATUSES.includes(order.status);
    return {
      allowed: false,
      code: 'ORDER_NOT_DELIVERED',
      message: beforeDispatch
        ? 'El pedido todavía no fue entregado: si ya no lo querés, podés cancelarlo.'
        : 'Sólo se puede pedir un cambio o una devolución sobre un pedido entregado.',
    };
  }
  const deadline = new Date(order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (now >= deadline) {
    // CU-15 (flujo 2b).
    return {
      allowed: false,
      code: 'RETURN_WINDOW_EXPIRED',
      message: `Pasaron más de ${RETURN_WINDOW_DAYS} días desde la entrega: el plazo para pedir un cambio o una devolución expiró.`,
    };
  }
  return { allowed: true, deadline };
}

/** CU-13 (paso 3) y CU-19 (paso 2): estado de pago derivado del estado del pedido. */
export type CustomerPaymentStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'sin_pago';

/** "Sin pago" = un pedido cancelado que nunca se pagó. */
export function customerPaymentStatus(order: { status: OrderStatus; paidAt: Date | null }): CustomerPaymentStatus {
  if (order.status === OrderStatus.PAGO_RECHAZADO) return 'rechazado';
  if (AWAITING_PAYMENT_STATUSES.includes(order.status)) return 'pendiente';
  if (PAID_STATUSES.includes(order.status) || order.paidAt) return 'aprobado';
  return 'sin_pago';
}

/**
 * CU-19 (paso 5, flujo 7a): transiciones que el Administrador aplica a mano.
 * Los estados de pago los mueve sólo CU-05, "devuelto" sólo CU-22 y la
 * cancelación tiene su propio flujo (5a).
 */
export const ADMIN_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PAGADO]: [OrderStatus.EN_PREPARACION],
  [OrderStatus.EN_PREPARACION]: [OrderStatus.DESPACHADO],
  [OrderStatus.DESPACHADO]: [OrderStatus.ENTREGADO],
};

/** CU-19 (flujo 5a): el Administrador cancela en cualquier estado salvo estos. */
export const ADMIN_NON_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.ENTREGADO,
  OrderStatus.CANCELADO,
  OrderStatus.DEVUELTO,
];

/** CU-19 (paso 6, flujo 7b): datos de seguimiento, opcionales, cargables al despachar o después. */
export const TRACKING_EDITABLE_STATUSES: readonly OrderStatus[] = [OrderStatus.DESPACHADO, OrderStatus.ENTREGADO];

/** CU-22 (flujo 8a): días desde la aprobación para recibir el producto (decisión de la Fase 6). */
export const RETURN_RECEPTION_DAYS = 10;

export function receptionDeadline(approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + RETURN_RECEPTION_DAYS * 24 * 60 * 60 * 1000);
}
