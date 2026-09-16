import { apiClient } from './api-client'
import type { AdminProduct, AdminProductListPage, ProductFormInput } from '../types/product.types'

interface AdminProductQuery {
  search?: string
  categoryId?: string
  isPublished?: boolean
  offset?: number
  limit?: number
}

/** Arma el FormData multipart que espera AdminProductsController (CU-16). */
function buildFormData(input: ProductFormInput, images: File[], version?: number): FormData {
  const form = new FormData()
  form.append('name', input.name)
  form.append('description', input.description)
  form.append('price', String(input.price))
  if (input.brand) form.append('brand', input.brand)
  form.append('categoryIds', JSON.stringify(input.categoryIds))
  if (input.isPublished !== undefined) form.append('isPublished', String(input.isPublished))
  if (input.lowStockThreshold !== undefined) {
    form.append('lowStockThreshold', String(input.lowStockThreshold))
  }
  if (input.variants && input.variants.length > 0) {
    form.append('variants', JSON.stringify(input.variants))
  }
  if (version !== undefined) form.append('version', String(version))
  for (const image of images) form.append('images', image)
  return form
}

export const adminProductsService = {
  async list(query: AdminProductQuery) {
    const { data } = await apiClient.get<AdminProductListPage>('/admin/products', { params: query })
    return data
  },

  async create(input: ProductFormInput, images: File[]) {
    const { data } = await apiClient.post<AdminProduct>('/admin/products', buildFormData(input, images), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async update(id: string, input: ProductFormInput, version: number, images: File[]) {
    const { data } = await apiClient.patch<AdminProduct>(
      `/admin/products/${id}`,
      buildFormData(input, images, version),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return data
  },

  async setPublished(id: string, isPublished: boolean) {
    const { data } = await apiClient.patch<AdminProduct>(`/admin/products/${id}/publish`, { isPublished })
    return data
  },

  remove(id: string) {
    return apiClient.delete(`/admin/products/${id}`)
  },
}
