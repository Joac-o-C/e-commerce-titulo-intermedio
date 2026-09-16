import { apiClient } from './api-client'
import type { AdjustStockInput, StockListPage, StockMovementRecord } from '../types/stock.types'

interface StockQuery {
  productId?: string
  categoryId?: string
  onlyLowStock?: boolean
  onlyOutOfStock?: boolean
  offset?: number
}

export const adminStockService = {
  async list(query: StockQuery) {
    const { data } = await apiClient.get<StockListPage>('/admin/stock', { params: query })
    return data
  },

  async adjust(variantId: string, input: AdjustStockInput) {
    const { data } = await apiClient.patch(`/admin/stock/variants/${variantId}/adjust`, input)
    return data
  },

  async history(variantId: string) {
    const { data } = await apiClient.get<StockMovementRecord[]>(
      `/admin/stock/variants/${variantId}/history`,
    )
    return data
  },

  async setThreshold(productId: string, lowStockThreshold: number | null) {
    const { data } = await apiClient.patch(`/admin/stock/products/${productId}/threshold`, {
      lowStockThreshold,
    })
    return data
  },
}
