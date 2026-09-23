/**
 * Los 9 estados del pedido fijados en la consolidación de CU (únicos en
 * todo el sistema). Enums en español, como el resto del modelo.
 */
export enum OrderStatus {
  PENDIENTE_PAGO = 'pendiente_pago',
  PAGO_PENDIENTE_ACREDITACION = 'pago_pendiente_acreditacion',
  PAGO_RECHAZADO = 'pago_rechazado',
  PAGADO = 'pagado',
  EN_PREPARACION = 'en_preparacion',
  DESPACHADO = 'despachado',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
  DEVUELTO = 'devuelto',
}

/**
 * Por qué se canceló un pedido. Distingue el vencimiento de la reserva
 * (CU-03 18a) — el único caso en que un pago acreditado tarde puede
 * revivir el pedido (CU-05 7a-1) — de las cancelaciones deliberadas
 * (CU-14 cliente, CU-19 administrador), que un pago tardío nunca revierte.
 */
export enum OrderCancellationCause {
  RESERVA_VENCIDA = 'reserva_vencida',
  PASARELA = 'pasarela',
  CLIENTE = 'cliente',
  ADMINISTRADOR = 'administrador',
}

/**
 * Transiciones válidas. Se define el grafo completo ya en la Fase 4 para
 * que CU-13/14/19/22 (Fases 5-6) validen contra la misma tabla.
 *
 * - `pago_rechazado → pendiente_pago`: reintento de pago (CU-03 flujo R).
 * - `pago_rechazado → pagado | pago_pendiente_acreditacion`: el Cliente
 *   reintentó dentro de la misma preferencia y otro pago se aprobó o quedó
 *   pendiente (p. ej. pasó a pagar en efectivo).
 * - `cancelado → pagado`: sólo CU-05 (flujo 7a-1), un pago que se acredita
 *   después de que la reserva venció. `OrdersService` además exige que la
 *   causa de la cancelación haya sido el vencimiento.
 * - `cancelado` desde todo estado anterior a `entregado` (CU-14/CU-19).
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDIENTE_PAGO]: [
    OrderStatus.PAGO_PENDIENTE_ACREDITACION,
    OrderStatus.PAGO_RECHAZADO,
    OrderStatus.PAGADO,
    OrderStatus.CANCELADO,
  ],
  [OrderStatus.PAGO_PENDIENTE_ACREDITACION]: [OrderStatus.PAGADO, OrderStatus.PAGO_RECHAZADO, OrderStatus.CANCELADO],
  [OrderStatus.PAGO_RECHAZADO]: [
    OrderStatus.PENDIENTE_PAGO,
    OrderStatus.PAGO_PENDIENTE_ACREDITACION,
    OrderStatus.PAGADO,
    OrderStatus.CANCELADO,
  ],
  [OrderStatus.PAGADO]: [OrderStatus.EN_PREPARACION, OrderStatus.CANCELADO],
  [OrderStatus.EN_PREPARACION]: [OrderStatus.DESPACHADO, OrderStatus.CANCELADO],
  [OrderStatus.DESPACHADO]: [OrderStatus.ENTREGADO, OrderStatus.CANCELADO],
  [OrderStatus.ENTREGADO]: [OrderStatus.DEVUELTO],
  [OrderStatus.CANCELADO]: [OrderStatus.PAGADO],
  [OrderStatus.DEVUELTO]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Estados en los que el pedido todavía espera un pago (CU-03 18a, reconciliación de CU-05). */
export const AWAITING_PAYMENT_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDIENTE_PAGO,
  OrderStatus.PAGO_PENDIENTE_ACREDITACION,
  OrderStatus.PAGO_RECHAZADO,
];

/** Estados con el pago ya acreditado: un rechazo posterior no los revierte (CU-05 7b-1). */
export const PAID_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PAGADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
  OrderStatus.DEVUELTO,
];
