import { apiClient } from './api-client'
import type { FakeGatewayPending } from '../types/admin-orders.types'
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

  // Panel admin: si la pasarela simulada está activa en el backend.
  async status() {
    const { data } = await apiClient.get<{ enabled: boolean }>('/payments/fake/status')
    return data
  },

  // Pantalla "Pasarela simulada" (decisión de la Fase 6): lo que espera resolución.
  async pending() {
    const { data } = await apiClient.get<FakeGatewayPending>('/payments/fake/pending')
    return data
  },

  // Acreditación o rechazo posterior de un pago pendiente (p. ej. efectivo).
  async settlePayment(paymentId: string, outcome: 'approved' | 'rejected') {
    await apiClient.post(`/payments/fake/payments/${paymentId}/settle`, { outcome })
  },

  // CU-21 (pasos 7-9): la pasarela acredita o rechaza el reembolso.
  async settleRefund(refundId: string, outcome: 'approved' | 'rejected') {
    await apiClient.post(`/payments/fake/refunds/${refundId}/settle`, { outcome })
  },
}
