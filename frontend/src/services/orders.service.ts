import { apiClient } from './api-client'
import type {
  CheckoutConfirmResult,
  CreatedReturnRequest,
  OrderDetail,
  OrderListFilters,
  OrderListPage,
  OrderStatus,
  ReturnRequestType,
} from '../types/order.types'

export const ordersService = {
  // CU-13 (pasos 2-3, flujo 3a).
  async list(filters: OrderListFilters) {
    const { data } = await apiClient.get<OrderListPage>('/orders', { params: filters })
    return data
  },

  // CU-13 (pasos 5-7).
  async get(orderId: string) {
    const { data } = await apiClient.get<OrderDetail>(`/orders/${orderId}`)
    return data
  },

  // CU-05 (paso 11): reconcilia el pedido contra la pasarela al volver de pagar.
  async syncPayment(orderId: string) {
    const { data } = await apiClient.post<OrderDetail>(`/payments/orders/${orderId}/sync`)
    return data
  },

  // CU-14. `expectedStatus` = el estado que el Cliente vio al confirmar (flujo 5a).
  async cancel(orderId: string, input: { expectedStatus: OrderStatus; reason?: string }) {
    const { data } = await apiClient.post<{ refundRequested: boolean; order: OrderDetail }>(
      `/orders/${orderId}/cancel`,
      input,
    )
    return data
  },

  // CU-13 (flujo 7b): reutiliza los pasos finales de CU-03.
  async retryPayment(orderId: string) {
    const { data } = await apiClient.post<CheckoutConfirmResult>(`/orders/${orderId}/retry-payment`)
    return data
  },

  // CU-15: multipart, con hasta 3 fotos.
  async createReturn(
    orderId: string,
    input: { type: ReturnRequestType; reason: string; items: { orderItemId: string; quantity: number }[]; photos: File[] },
  ) {
    const form = new FormData()
    form.append('type', input.type)
    form.append('reason', input.reason)
    form.append('items', JSON.stringify(input.items))
    for (const photo of input.photos) form.append('photos', photo)
    const { data } = await apiClient.post<CreatedReturnRequest>(`/orders/${orderId}/returns`, form)
    return data
  },
}
