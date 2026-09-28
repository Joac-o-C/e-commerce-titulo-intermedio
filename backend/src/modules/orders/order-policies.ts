import { OrderStatus } from './order-status.js';

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
