export type StockMovementType = 'reposicion' | 'ajuste' | 'merma' | 'devolucion'

/** CU-18: fila de variante en el panel de stock. */
export interface StockItem {
  variantId: string
  sku: string
  attributes: Record<string, string>
  productId: string
  productName: string
  stockTotal: number
  stockReserved: number
  stockAvailable: number
  lowStockThreshold: number
  /** Umbral crudo del producto (null si no tiene override y usa el default global). */
  productLowStockThreshold: number | null
  isLowStock: boolean
  isOutOfStock: boolean
}

export interface StockListPage {
  items: StockItem[]
  total: number
  hasMore: boolean
}

export interface AdjustStockInput {
  type: StockMovementType
  quantity: number
  reason: string
}

export interface StockMovementRecord {
  id: string
  type: StockMovementType
  quantity: number
  resultingStockTotal: number
  reason: string | null
  createdAt: string
  actor: { id: string; firstName: string; lastName: string } | null
}
