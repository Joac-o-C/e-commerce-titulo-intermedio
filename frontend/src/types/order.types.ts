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
}

/** Detalle mínimo del pedido (CU-05 paso 11); el completo llega con CU-13. */
export interface OrderSummary {
  id: string
  status: OrderStatus
  subtotal: string
  shippingCost: string
  total: string
  shippingMethod: { id: string; name: string; cost: string }
  shippingAddress: { alias: string; street: string; number: string; city: string; province: string }
  reservationExpiresAt: string
  createdAt: string
  items: OrderItem[]
}

/** Preferencia de la pasarela simulada (PAYMENT_GATEWAY=fake). */
export interface FakePreference {
  preferenceId: string
  orderId: string
  amount: string
  expiresAt: string
  items: { id: string; title: string; quantity: number; unitPrice: number }[]
}
