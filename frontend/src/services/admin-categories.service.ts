import { apiClient } from './api-client'
import type { CategoryNode, CreateCategoryInput, UpdateCategoryInput } from '../types/category.types'

export const adminCategoriesService = {
  async tree() {
    const { data } = await apiClient.get<CategoryNode[]>('/admin/categories')
    return data
  },

  async create(input: CreateCategoryInput) {
    const { data } = await apiClient.post<CategoryNode>('/admin/categories', input)
    return data
  },

  async update(id: string, input: UpdateCategoryInput) {
    const { data } = await apiClient.patch<CategoryNode>(`/admin/categories/${id}`, input)
    return data
  },

  remove(id: string) {
    return apiClient.delete(`/admin/categories/${id}`)
  },
}
