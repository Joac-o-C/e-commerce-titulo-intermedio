import { apiClient } from './api-client'
import type {
  CheckoutConfirmResult,
  CheckoutQuote,
  RevalidateResult,
  ShippingMethod,
} from '../types/order.types'

/** CU-03 Realizar checkout. */
export const checkoutService = {
  async revalidate() {
    const { data } = await apiClient.post<RevalidateResult>('/checkout/revalidate')
    return data
  },

  async shippingMethods(addressId: string) {
    const { data } = await apiClient.get<ShippingMethod[]>('/checkout/shipping-methods', { params: { addressId } })
    return data
  },

  async quote(addressId: string, shippingMethodId: string) {
    const { data } = await apiClient.post<CheckoutQuote>('/checkout/quote', { addressId, shippingMethodId })
    return data
  },

  async confirm(input: { addressId: string; shippingMethodId: string; expectedTotal: string }) {
    const { data } = await apiClient.post<CheckoutConfirmResult>('/checkout', input)
    return data
  },
}
