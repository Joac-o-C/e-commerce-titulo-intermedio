import { apiClient } from './api-client'
import type {
  AdminCancelReason,
  AdminOrderDetail,
  AdminOrderFilters,
  AdminOrderPage,
  AdminSummary,
  TrackingInput,
} from '../types/admin-orders.types'
import type { OrderStatus } from '../types/order.types'

/** CU-19 Ver y gestionar pedidos (admin) + gestión de reembolsos (CU-21 4a/5a). */
export const adminOrdersService = {
  // Paso 2.
  async list(filters: AdminOrderFilters) {
    const { data } = await apiClient.get<AdminOrderPage>('/admin/orders', { params: filters })
    return data
  },

  // Flujo 2a: como blob, para que viaje el token (un <a href> no lo manda).
  async exportCsv(filters: AdminOrderFilters) {
    const { page: _page, ...rest } = filters
    const { data } = await apiClient.get<Blob>('/admin/orders/export.csv', { params: rest, responseType: 'blob' })
    return data
  },

  // Pasos 3-4.
  async get(orderId: string) {
    const { data } = await apiClient.get<AdminOrderDetail>(`/admin/orders/${orderId}`)
    return data
  },

  // Pasos 5-10. `expectedStatus` = el estado que vio el Administrador (flujo 8a).
  async changeStatus(orderId: string, input: { expectedStatus: OrderStatus; to: OrderStatus; note?: string; tracking?: TrackingInput }) {
    const { data } = await apiClient.post<AdminOrderDetail>(`/admin/orders/${orderId}/status`, input)
    return data
  },

  // Paso 6 / flujo 7b: seguimiento cargado después del despacho.
  async updateTracking(orderId: string, input: TrackingInput) {
    const { data } = await apiClient.patch<AdminOrderDetail>(`/admin/orders/${orderId}/tracking`, input)
    return data
  },

  // Flujo 5a.
  async cancel(orderId: string, input: { expectedStatus: OrderStatus; reason: AdminCancelReason; detail?: string }) {
    const { data } = await apiClient.post<{ refundRequested: boolean; order: AdminOrderDetail }>(
      `/admin/orders/${orderId}/cancel`,
      input,
    )
    return data
  },

  // Flujo 5c.
  async addNote(orderId: string, text: string) {
    const { data } = await apiClient.post<AdminOrderDetail>(`/admin/orders/${orderId}/notes`, { text })
    return data
  },

  // Alerta de CU-21 (4a/5a): reintentar o marcar resuelto por fuera.
  async retryRefund(refundId: string) {
    await apiClient.post(`/admin/refunds/${refundId}/retry`)
  },

  async resolveRefund(refundId: string, note: string) {
    await apiClient.post(`/admin/refunds/${refundId}/resolve`, { note })
  },

  // Contadores de la barra de admin.
  async summary() {
    const { data } = await apiClient.get<AdminSummary>('/admin/summary')
    return data
  },
}
