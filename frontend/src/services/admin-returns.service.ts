import { apiClient } from './api-client'
import type {
  AdminReturnDetail,
  AdminReturnFilters,
  AdminReturnPage,
  ApproveReturnInput,
  ReceiveReturnInput,
  TrackingInput,
} from '../types/admin-orders.types'

/** CU-22 Resolver solicitud de cambio o devolución (admin). */
export const adminReturnsService = {
  // Bandeja (precondición 3, flujo 8a).
  async list(filters: AdminReturnFilters) {
    const { data } = await apiClient.get<AdminReturnPage>('/admin/returns', { params: filters })
    return data
  },

  // Paso 2.
  async get(requestId: string) {
    const { data } = await apiClient.get<AdminReturnDetail>(`/admin/returns/${requestId}`)
    return data
  },

  // Pasos 3-7, flujo 4a.
  async approve(requestId: string, input: ApproveReturnInput) {
    const { data } = await apiClient.post<AdminReturnDetail>(`/admin/returns/${requestId}/approve`, input)
    return data
  },

  // Flujo 3a.
  async reject(requestId: string, reason: string) {
    const { data } = await apiClient.post<AdminReturnDetail>(`/admin/returns/${requestId}/reject`, { reason })
    return data
  },

  // Pasos 8-12, flujos 9a/10a/10b.
  async receive(requestId: string, input: ReceiveReturnInput) {
    const { data } = await apiClient.post<AdminReturnDetail>(`/admin/returns/${requestId}/receive`, input)
    return data
  },

  // Flujo 10a: despacho de la reposición, seguimiento opcional.
  async dispatchReplacement(requestId: string, input: Omit<TrackingInput, 'dispatchedAt'>) {
    const { data } = await apiClient.post<AdminReturnDetail>(`/admin/returns/${requestId}/replacement/dispatch`, input)
    return data
  },
}
