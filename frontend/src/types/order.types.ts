import type { Cart, CartItem } from './cart.types'

/** Los 9 estados del pedido (mismos valores que el enum del backend). */
export type OrderStatus =
  | 'pendiente_pago'
  | 'pago_pendiente_acreditacion'
  | 'pago_rechazado'
  | 'pagado'
  | 'en_preparacion'
  | 'despachado'
  | 'entregado'
  | 'cancelado'
  | 'devuelto'

/** CU-03 (flujos 3a/3b): cambio que la revalidación aplicó al carrito. */
export type CheckoutAdjustment =
  | { itemId: string; productName: string; type: 'removed'; reason: 'unavailable' | 'out_of_stock' }
  | { itemId: string; productName: string; type: 'quantity_reduced'; from: number; to: number }
  | { itemId: string; productName: string; type: 'price_updated'; from: string; to: string }

export interface RevalidateResult {
  adjustments: CheckoutAdjustment[]
  cart: Cart
}

export interface ShippingMethod {
  id: string
  name: string
  description: string | null
  cost: string
}

export interface CheckoutQuote {
  items: CartItem[]
  shippingMethod: { id: string; name: string; cost: string }
  subtotal: string
  shippingCost: string
  total: string
}

export interface CheckoutConfirmResult {
  orderId: string
  redirectUrl: string
}

/** CU-03 (flujo 13a): cuerpo del 409 `CHECKOUT_STALE`. */
export type CheckoutProblem =
  | { type: 'unavailable'; productName: string }
  | { type: 'price_changed'; productName: string; from: string; to: string }
  | { type: 'insufficient_stock'; productName: string }
  | { type: 'total_changed'; expected: string; actual: string }

export interface OrderItem {
  id: string
  productId: string
  productName: string
  variantAttributes: Record<string, string>
  quantity: number
  unitPrice: string
  subtotal: string
  /** CU-15 (paso 3): unidades que todavía se pueden pedir (compradas − pedidas en solicitudes abiertas − aprobadas). */
  eligibleReturnQuantity: number
}

/** CU-13 (paso 3): estado de pago que ve el Cliente. */
export type CustomerPaymentStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'sin_pago'

/** CU-13 (paso 7): acción del detalle habilitada, o el motivo por el que no. */
export type ActionAvailability =
  | { allowed: true; deadline?: string }
  | { allowed: false; code: string; message: string }

export type RefundStatus = 'en_tramite' | 'reembolsado' | 'rechazado' | 'pendiente_de_gestion'
export type ReturnRequestType = 'cambio' | 'devolucion'
export type ReturnRequestStatus = 'solicitada' | 'aprobada' | 'rechazada' | 'resuelta'

export type ReplacementStatus = 'pendiente_despacho' | 'despachado'

export interface ReturnRequestSummary {
  id: string
  requestNumber: number
  type: ReturnRequestType
  status: ReturnRequestStatus
  reason: string
  createdAt: string
  approvedAt: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  photos: string[]
  items: {
    orderItemId: string
    productName: string
    quantityRequested: number
    quantityApproved: number | null
    quantityReceived: number | null
  }[]
  /** CU-22 (flujo 10a): reposición de un cambio. */
  replacements: {
    productName: string
    variantAttributes: Record<string, string>
    quantity: number
    status: ReplacementStatus
    tracking: { carrier: string | null; number: string | null; dispatchedAt: string | null } | null
  }[]
}

/** CU-13 (pasos 5-7): detalle del pedido. También lo devuelve la página de retorno de la pasarela (CU-05 paso 11). */
export interface OrderDetail {
  id: string
  orderNumber: number
  status: OrderStatus
  createdAt: string
  subtotal: string
  shippingCost: string
  total: string
  shippingMethod: { id: string; name: string; cost: string }
  shippingAddress: {
    alias: string
    street: string
    number: string
    floorApt: string | null
    city: string
    province: string
    postalCode: string
    phone: string
  }
  reservationExpiresAt: string | null
  paidAt: string | null
  deliveredAt: string | null
  tracking: { carrier: string | null; number: string | null; dispatchedAt: string | null } | null
  items: OrderItem[]
  payment: { status: CustomerPaymentStatus; mayBeOutdated: boolean; method: string | null; installments: number | null }
  refunds: { id: string; amount: string; status: RefundStatus; createdAt: string; resolvedAt: string | null }[]
  statusHistory: { from: OrderStatus | null; to: OrderStatus; at: string }[]
  returnRequests: ReturnRequestSummary[]
  actions: {
    retryPayment: ActionAvailability
    cancel: ActionAvailability
    requestReturn: ActionAvailability
  }
}

/** CU-13 (paso 3): fila del listado. */
export interface OrderListItem {
  id: string
  orderNumber: number
  createdAt: string
  itemCount: number
  total: string
  status: OrderStatus
  paymentStatus: CustomerPaymentStatus
}

export interface OrderListPage {
  items: OrderListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** CU-13 (flujo 3a). */
export interface OrderListFilters {
  page?: number
  status?: OrderStatus
  /** Instantes ISO (comienzo y fin del día elegido, en la zona del Cliente). */
  from?: string
  to?: string
  number?: number
}

export interface CreatedReturnRequest {
  id: string
  requestNumber: number
  status: ReturnRequestStatus
  type: ReturnRequestType
  /** CU-15 (paso 7): cómo y a dónde enviar el producto. */
  instructions: string
}

/** Preferencia de la pasarela simulada (PAYMENT_GATEWAY=fake). */
export interface FakePreference {
  preferenceId: string
  orderId: string
  amount: string
  expiresAt: string
  items: { id: string; title: string; quantity: number; unitPrice: number }[]
}
