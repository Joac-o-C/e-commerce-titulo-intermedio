import { apiClient } from './api-client'
import type { ProductDetail, ProductListFilters, ProductListPage } from '../types/product.types'

export const productsService = {
  async list(filters: ProductListFilters, offset: number) {
    const { data } = await apiClient.get<ProductListPage>('/products', {
      params: {
        search: filters.search || undefined,
        categoryIds: filters.categoryIds?.length ? filters.categoryIds : undefined,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStockOnly: filters.inStockOnly || undefined,
        sort: filters.sort,
        offset,
      },
    })
    return data
  },

  async detail(id: string) {
    const { data } = await apiClient.get<ProductDetail>(`/products/${id}`)
    return data
  },
}
