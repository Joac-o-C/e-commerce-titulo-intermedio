import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cartService } from '../../../services/cart.service'
import { useGuestCartStore } from '../../../store/cart.store'
import type { GuestCartItem, MergeItemResult } from '../../../types/cart.types'

export interface MergeConflict {
  result: MergeItemResult
  guestItem: GuestCartItem
}

/**
 * CU-06 Iniciar sesión (fusión del carrito de invitado). Decisión tomada
 * con el usuario: preview + confirmación en un solo modal — si no hay
 * conflictos se fusiona directo; si hay alguno (stock insuficiente o
 * producto no disponible), se muestra un único modal con todo el lote y el
 * usuario decide, en vez de ajustar nada sin avisar.
 */
export function useCartMerge() {
  const queryClient = useQueryClient()
  const [conflicts, setConflicts] = useState<MergeConflict[] | null>(null)

  /** Devuelve `true` si quedó un conflicto pendiente de decisión en el modal. */
  async function run(): Promise<boolean> {
    const guestItems = useGuestCartStore.getState().items
    if (guestItems.length === 0) return false

    const requestItems = guestItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
    const preview = await cartService.previewMerge(requestItems)

    if (preview.every((p) => p.outcome === 'ok')) {
      await cartService.confirmMerge(requestItems)
      useGuestCartStore.getState().clear()
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      return false
    }

    const byVariant = new Map(guestItems.map((i) => [i.variantId, i]))
    setConflicts(
      preview
        .filter((result) => byVariant.has(result.variantId))
        .map((result) => ({ result, guestItem: byVariant.get(result.variantId)! })),
    )
    return true
  }

  /** El usuario confirmó el modal: `acceptedQuantities` trae la cantidad final de cada ítem que decidió mantener. */
  async function confirm(acceptedQuantities: Record<string, number>): Promise<void> {
    const items = Object.entries(acceptedQuantities).map(([variantId, quantity]) => ({ variantId, quantity }))
    if (items.length > 0) {
      await cartService.confirmMerge(items)
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    }
    useGuestCartStore.getState().clear()
    setConflicts(null)
  }

  /** El usuario canceló: el carrito de invitado queda intacto para agregarlo a mano después. */
  function cancel(): void {
    setConflicts(null)
  }

  return { conflicts, run, confirm, cancel }
}
