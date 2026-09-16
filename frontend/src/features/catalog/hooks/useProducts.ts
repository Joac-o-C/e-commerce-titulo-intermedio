import { useInfiniteQuery } from '@tanstack/react-query'
import { productsService } from '../../../services/products.service'
import type { ProductListFilters } from '../../../types/product.types'

const PAGE_SIZE = 24

/**
 * CU-04 Filtrar productos: scroll infinito de a 24, refiltrado completo
 * cada vez que cambian los filtros (nueva query key).
 */
export function useProducts(filters: ProductListFilters) {
  return useInfiniteQuery({
    queryKey: ['products', filters],
    queryFn: ({ pageParam }) => productsService.list(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * PAGE_SIZE
    },
  })
}
