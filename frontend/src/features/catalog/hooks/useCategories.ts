import { useQuery } from '@tanstack/react-query'
import { categoriesService } from '../../../services/categories.service'

/** Árbol de categorías visibles, usado para poblar los filtros de CU-04/CU-09. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories', 'public'],
    queryFn: () => categoriesService.publicTree(),
    staleTime: 5 * 60 * 1000,
  })
}
