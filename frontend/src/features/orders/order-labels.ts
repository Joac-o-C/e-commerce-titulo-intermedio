import type { CustomerPaymentStatus, OrderStatus, RefundStatus, ReturnRequestStatus } from '../../types/order.types'

/** Los 9 estados del pedido, con el texto de las fichas de CU. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente_pago: 'Pendiente de pago',
  pago_pendiente_acreditacion: 'Pago pendiente de acreditación',
  pago_rechazado: 'Pago rechazado',
  pagado: 'Pagado',
  en_preparacion: 'En preparación',
  despachado: 'Despachado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  devuelto: 'Devuelto',
}

export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pendiente_pago: 'bg-amber-100 text-amber-800',
  pago_pendiente_acreditacion: 'bg-amber-100 text-amber-800',
  pago_rechazado: 'bg-red-100 text-red-800',
  pagado: 'bg-green-100 text-green-800',
  en_preparacion: 'bg-blue-100 text-blue-800',
  despachado: 'bg-blue-100 text-blue-800',
  entregado: 'bg-green-100 text-green-800',
  cancelado: 'bg-neutral-200 text-neutral-700',
  devuelto: 'bg-neutral-200 text-neutral-700',
}

export const PAYMENT_STATUS_LABELS: Record<CustomerPaymentStatus, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  sin_pago: 'Sin pago',
}

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  en_tramite: 'Reembolso en trámite',
  reembolsado: 'Reembolsado',
  rechazado: 'Reembolso rechazado',
  pendiente_de_gestion: 'Reembolso pendiente de gestión',
}

export const RETURN_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  solicitada: 'Solicitada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  resuelta: 'Resuelta',
}

/** Costo de envío: 0 se muestra como «Gratis» (decisión de la Fase 6, p. ej. retiro en local). */
export function formatShippingCost(cost: string): string {
  return Number(cost) === 0 ? 'Gratis' : `$${cost}`
}

/** Tope de la columna `order_number` (int4). */
export const MAX_ORDER_NUMBER = 2147483647

/** Día elegido en un `<input type="date">` → instante ISO de su comienzo o fin, en la zona del usuario. */
export function dayBoundary(day: string, edge: 'start' | 'end'): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59, 999)
  return date.toISOString()
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR')
}

type ApiError = { response?: { status?: number; data?: { code?: string; message?: string | string[] } } }

/** Mensaje de error del backend (los 409 de estas acciones traen `code` + `message`). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as ApiError)?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? fallback
}

export function apiErrorCode(err: unknown): string | undefined {
  return (err as ApiError)?.response?.data?.code
}
