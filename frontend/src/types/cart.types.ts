/** CU-02/CU-11: ítem del carrito de un Cliente autenticado, tal como lo ve el backend. */
export interface CartItem {
  id: string
  productId: string
  productName: string
  variantId: string
  variantAttributes: Record<string, string>
  quantity: number
  unitPriceSnapshot: string
  subtotal: string
  isUnavailable: boolean
  isOutOfStock: boolean
  priceChanged: boolean
}

export interface Cart {
  cartId: string
  items: CartItem[]
  totalItems: number
  totalAmount: string
}

/** Cuerpo del error 409 de `InsufficientStockException` (backend). */
export interface InsufficientStockError {
  code: 'INSUFFICIENT_STOCK'
  message: string
  maxAvailable: number
}

export type MergeItemOutcome = 'ok' | 'insufficient_stock' | 'unavailable'

export interface MergeItemResult {
  variantId: string
  requestedQuantity: number
  outcome: MergeItemOutcome
  maxAvailable?: number
}

export interface MergeConfirmResult {
  merged: MergeItemResult[]
  skipped: MergeItemResult[]
  cart: Cart
}

/** Ítem del carrito de invitado (Zustand + localStorage), previo a resolver contra catálogo. */
export interface GuestCartItem {
  variantId: string
  productId: string
  productName: string
  variantAttributes: Record<string, string>
  quantity: number
}
