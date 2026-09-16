import { apiClient } from './api-client'
import type { CategoryNode } from '../types/category.types'

export const categoriesService = {
  async publicTree() {
    const { data } = await apiClient.get<CategoryNode[]>('/categories')
    return data
  },
}
