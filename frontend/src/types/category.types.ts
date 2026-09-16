/** CU-17: nodo del árbol de categorías (máximo dos niveles). */
export interface CategoryNode {
  id: string
  name: string
  description: string | null
  parentId: string | null
  order: number
  isVisible: boolean
  isActive: boolean
  productCount: number
  children: CategoryNode[]
}

export interface CreateCategoryInput {
  name: string
  description?: string
  parentId?: string
  order?: number
  isVisible?: boolean
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>
