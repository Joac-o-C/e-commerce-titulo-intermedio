import { apiClient } from './api-client'
import type { Cart, MergeConfirmResult, MergeItemResult } from '../types/cart.types'

/** CU-02/CU-11: carrito de un Cliente autenticado. */
export const cartService = {
  async get() {
    const { data } = await apiClient.get<Cart>('/cart')
    return data
  },

  async addItem(variantId: string, quantity: number) {
    const { data } = await apiClient.post<Cart>('/cart/items', { variantId, quantity })
    return data
  },

  async updateItem(itemId: string, quantity: number) {
    const { data } = await apiClient.patch<Cart>(`/cart/items/${itemId}`, { quantity })
    return data
  },

  async removeItem(itemId: string) {
    const { data } = await apiClient.delete<Cart>(`/cart/items/${itemId}`)
    return data
  },

  async clear() {
    const { data } = await apiClient.delete<Cart>('/cart')
    return data
  },

  // CU-06: fusión del carrito de invitado al iniciar sesión.
  async previewMerge(items: { variantId: string; quantity: number }[]) {
    const { data } = await apiClient.post<MergeItemResult[]>('/cart/merge/preview', { items })
    return data
  },

  async confirmMerge(items: { variantId: string; quantity: number }[]) {
    const { data } = await apiClient.post<MergeConfirmResult>('/cart/merge/confirm', { items })
    return data
  },

  // Público (sin sesión): valida un ítem del carrito de invitado contra el catálogo.
  async resolveGuestItem(variantId: string, quantity: number, alreadyInCart: number) {
    const { data } = await apiClient.post<MergeItemResult>('/cart/guest/resolve-item', {
      variantId,
      quantity,
      alreadyInCart,
    })
    return data
  },
}
