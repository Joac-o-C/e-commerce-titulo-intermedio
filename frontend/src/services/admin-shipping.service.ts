import { apiClient } from './api-client'
import type { AdminShippingMethod, ShippingMethodInput } from '../types/admin-orders.types'

/** ABM de métodos de envío (alcance extra de la Fase 6). */
export const adminShippingService = {
  async list() {
    const { data } = await apiClient.get<AdminShippingMethod[]>('/admin/shipping-methods')
    return data
  },

  async create(input: ShippingMethodInput) {
    const { data } = await apiClient.post<AdminShippingMethod>('/admin/shipping-methods', input)
    return data
  },

  async update(id: string, input: Partial<ShippingMethodInput>) {
    const { data } = await apiClient.patch<AdminShippingMethod>(`/admin/shipping-methods/${id}`, input)
    return data
  },

  // Baja lógica. `lastActiveDisabled`: el checkout quedó sin métodos de envío.
  async setActive(id: string, isActive: boolean) {
    const { data } = await apiClient.patch<{ method: AdminShippingMethod; lastActiveDisabled: boolean }>(
      `/admin/shipping-methods/${id}/active`,
      { isActive },
    )
    return data
  },
}
