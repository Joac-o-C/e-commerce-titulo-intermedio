import type { AdminCancelReason, AdminOrderSort, RefundOrigin, ReturnItemCondition } from '../../types/admin-orders.types'

/** CU-19 (flujo 5a): mismos textos que `ADMIN_CANCEL_REASON_LABELS` del backend. */
export const ADMIN_CANCEL_REASON_LABELS: Record<AdminCancelReason, string> = {
  falta_stock: 'Falta de stock',
  sospecha_fraude: 'Sospecha de fraude',
  pago_abandonado: 'Pago abandonado',
  pedido_cliente_fuera_de_plazo: 'Pedido del Cliente fuera de plazo',
  otro: 'Otro',
}

export const ADMIN_ORDER_SORT_LABELS: Record<AdminOrderSort, string> = {
  fecha_desc: 'Más recientes',
  fecha_asc: 'Más antiguos',
  total_desc: 'Mayor total',
  total_asc: 'Menor total',
  estado: 'Estado (ciclo de vida)',
}

export const REFUND_ORIGIN_LABELS: Record<RefundOrigin, string> = {
  'CU-05': 'Pago tardío o doble cobro',
  'CU-14': 'Cancelación del Cliente',
  'CU-19': 'Cancelación del Administrador',
  'CU-22': 'Devolución',
}

export const RETURN_CONDITION_LABELS: Record<ReturnItemCondition, string> = {
  ok: 'En buen estado',
  danado: 'Dañado o no corresponde',
}

export function formatAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
}
