import { useQueries } from '@tanstack/react-query'
import { productsService } from '../../../services/products.service'
import { useGuestCartStore } from '../../../store/cart.store'

/**
 * CU-11 (vista, Visitante): el store de invitado sólo guarda
 * variantId/cantidad, así que para mostrar precio/subtotal/disponibilidad
 * se resuelve cada producto contra el catálogo público (GET /products/:id,
 * ya existente) — un 404 ahí significa que el producto ya no está
 * publicado/activo (CU-11, flujo 6b).
 */
export function useGuestCartView() {
  const items = useGuestCartStore((s) => s.items)
  const productIds = [...new Set(items.map((i) => i.productId))]

  const queries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ['product', id],
      queryFn: () => productsService.detail(id),
      retry: false,
    })),
  })

  const isLoading = queries.some((q) => q.isLoading)
  const byProductId = new Map(productIds.map((id, idx) => [id, queries[idx]]))

  const view = items.map((item) => {
    const query = byProductId.get(item.productId)
    const product = query?.data
    const variant = product?.variants.find((v) => v.id === item.variantId)
    const isUnavailable = query?.isError === true || !variant
    const isOutOfStock = !isUnavailable && (variant?.isOutOfStock ?? false)
    const unitPrice = product?.price ?? '0.00'
    const subtotal = (Number(unitPrice) * item.quantity).toFixed(2)
    return {
      ...item,
      unitPrice,
      subtotal,
      isUnavailable,
      isOutOfStock,
      stockAvailable: variant?.stockAvailable ?? 0,
    }
  })

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalAmount = view.reduce((sum, v) => sum + Number(v.subtotal), 0).toFixed(2)

  return { view, totalItems, totalAmount, isLoading }
}
