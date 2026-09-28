import { useQuery } from '@tanstack/react-query'
import { ordersService } from '../../../services/orders.service'

/** CU-13 (pasos 5-7). Misma clave que la página de retorno de la pasarela (CU-05 paso 11). */
export function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersService.get(orderId!),
    enabled: !!orderId,
    // Flujo 5a: un 404 es "pedido no disponible", no hay nada que reintentar.
    retry: false,
  })
}
