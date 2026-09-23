import { cartService } from '../../../services/cart.service'
import { useGuestCartStore } from '../../../store/cart.store'
import type { MergeItemResult } from '../../../types/cart.types'

/**
 * CU-02/CU-11 para Visitante: el carrito vive en `cart.store.ts`
 * (localStorage), pero cada cambio se revalida antes contra el catálogo en
 * servidor (`/cart/guest/resolve-item`, sin sesión) — la ficha exige que el
 * servidor nunca confíe en stock/precio decidido sólo en el navegador.
 */
export function useGuestCart() {
  const items = useGuestCartStore((s) => s.items)
  const setItem = useGuestCartStore((s) => s.setItem)
  const updateQuantityLocal = useGuestCartStore((s) => s.updateQuantity)
  const removeItem = useGuestCartStore((s) => s.removeItem)
  const clear = useGuestCartStore((s) => s.clear)

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  /** CU-02: incrementa la cantidad de una variante (o la agrega si es nueva). */
  async function addItem(
    variantId: string,
    productId: string,
    productName: string,
    variantAttributes: Record<string, string>,
    quantity: number,
  ): Promise<MergeItemResult> {
    const alreadyInCart = items.find((i) => i.variantId === variantId)?.quantity ?? 0
    const result = await cartService.resolveGuestItem(variantId, quantity, alreadyInCart)
    if (result.outcome === 'ok') {
      setItem({ variantId, productId, productName, variantAttributes, quantity: alreadyInCart + quantity })
    }
    return result
  }

  /** CU-11: fija la cantidad absoluta de un ítem ya en el carrito. */
  async function updateQuantity(variantId: string, quantity: number): Promise<MergeItemResult> {
    const result = await cartService.resolveGuestItem(variantId, quantity, 0)
    if (result.outcome === 'ok') {
      updateQuantityLocal(variantId, quantity)
    }
    return result
  }

  return { items, totalItems, addItem, updateQuantity, removeItem, clear }
}
