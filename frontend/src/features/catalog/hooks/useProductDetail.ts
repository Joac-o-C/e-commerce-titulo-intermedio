import { useQuery } from '@tanstack/react-query'
import { productsService } from '../../../services/products.service'

/** CU-09 Ver detalle de producto. */
export function useProductDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => productsService.detail(id!),
    enabled: !!id,
  })
}
