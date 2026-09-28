import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ordersService } from '../../../services/orders.service'
import type { OrderListFilters } from '../../../types/order.types'

/** CU-13 (pasos 2-3, flujo 3a). */
export function useMyOrders(filters: OrderListFilters, enabled = true) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersService.list(filters),
    enabled,
    // Un 4xx (filtro inválido) no se arregla reintentando; un 5xx o una caída de red, quizás sí.
    retry: (failureCount, err) =>
      failureCount < 3 && ((err as { response?: { status?: number } }).response?.status ?? 500) >= 500,
    // Al paginar o filtrar se sigue mostrando la página anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  })
}
