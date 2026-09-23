import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GuestCartItem } from '../types/cart.types'

/**
 * Carrito de invitado (CU-02/CU-11 para Visitante): vive 100% en el
 * navegador, persistido en localStorage. El backend nunca modela esto —
 * cada cambio se valida antes contra `/cart/guest/resolve-item`
 * (`useGuestCart`), este store sólo guarda el resultado ya aceptado.
 */
interface GuestCartState {
  items: GuestCartItem[]
  setItem: (item: GuestCartItem) => void
  updateQuantity: (variantId: string, quantity: number) => void
  removeItem: (variantId: string) => void
  clear: () => void
}

export const useGuestCartStore = create<GuestCartState>()(
  persist(
    (set, get) => ({
      items: [],
      setItem: (item) => {
        const existing = get().items.find((i) => i.variantId === item.variantId)
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.variantId === item.variantId ? { ...i, quantity: item.quantity } : i,
            ),
          })
        } else {
          set({ items: [...get().items, item] })
        }
      },
      updateQuantity: (variantId, quantity) =>
        set({ items: get().items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)) }),
      removeItem: (variantId) => set({ items: get().items.filter((i) => i.variantId !== variantId) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'guest-cart' },
  ),
)
