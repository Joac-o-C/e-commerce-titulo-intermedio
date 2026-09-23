import { apiClient } from './api-client'
import type { FakePreference } from '../types/order.types'

/** Pasarela simulada (sólo con PAYMENT_GATEWAY=fake en el backend). */
export const fakePaymentService = {
  async getPreference(preferenceId: string) {
    const { data } = await apiClient.get<FakePreference>(`/payments/fake/preferences/${preferenceId}`)
    return data
  },

  async pay(preferenceId: string, outcome: 'approved' | 'rejected' | 'pending') {
    const { data } = await apiClient.post<{ paymentId: string; orderId: string; redirectUrl: string }>(
      `/payments/fake/preferences/${preferenceId}/pay`,
      { outcome },
    )
    return data
  },
}
