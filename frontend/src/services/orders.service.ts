import { apiClient } from './api-client'
import type { OrderSummary } from '../types/order.types'

export const ordersService = {
  async get(orderId: string) {
    const { data } = await apiClient.get<OrderSummary>(`/orders/${orderId}`)
    return data
  },

  // CU-05 (paso 11): reconcilia el pedido contra la pasarela al volver de pagar.
  async syncPayment(orderId: string) {
    const { data } = await apiClient.post<OrderSummary>(`/payments/orders/${orderId}/sync`)
    return data
  },
}
