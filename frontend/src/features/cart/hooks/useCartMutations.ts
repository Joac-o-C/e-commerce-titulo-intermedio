import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cartService } from '../../../services/cart.service'

/**
 * CU-02/CU-11 sobre el carrito de un Cliente autenticado. Cada mutación
 * invalida ['cart'] al resolver; los errores (409 de stock insuficiente,
 * 400 no disponible) se propagan tal cual para que el componente muestre
 * el prompt de "dejar esa cantidad o cancelar" con `error.response.data`.
 */
export function useCartMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cart'] })

  const addItem = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      cartService.addItem(variantId, quantity),
    onSuccess: invalidate,
  })

  const updateItem = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      cartService.updateItem(itemId, quantity),
    onSuccess: invalidate,
  })

  const removeItem = useMutation({
    mutationFn: (itemId: string) => cartService.removeItem(itemId),
    onSuccess: invalidate,
  })

  const clear = useMutation({
    mutationFn: () => cartService.clear(),
    onSuccess: invalidate,
  })

  return { addItem, updateItem, removeItem, clear }
}
