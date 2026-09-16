export interface ProductCategoryRef {
  id: string
  name: string
}

/** Ficha resumida, usada en listados (catálogo público, relacionados) y en el admin. */
export interface ProductSummary {
  id: string
  name: string
  price: string
  brand: string | null
  stockAvailable: number
  isLowStock: boolean
  isOutOfStock: boolean
  mainImageUrl: string | null
  categories: ProductCategoryRef[]
  createdAt: string
}

export interface ProductVariantAvailability {
  id: string
  sku: string
  attributes: Record<string, string>
  stockAvailable: number
  isLowStock: boolean
  isOutOfStock: boolean
}

export interface ProductImage {
  id: string
  productId: string
  url: string
  order: number
  altText: string | null
}

/** CU-09: ficha completa de un producto. */
export interface ProductDetail extends ProductSummary {
  description: string
  variants: ProductVariantAvailability[]
  images: ProductImage[]
  relatedProducts: ProductSummary[]
}

export type ProductSort =
  | 'relevancia'
  | 'precio_asc'
  | 'precio_desc'
  | 'nuevos'
  | 'nombre_asc'
  | 'mas_vendidos'

/** CU-04: filtros de catálogo, reflejados en la URL. */
export interface ProductListFilters {
  search?: string
  categoryIds?: string[]
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  sort?: ProductSort
}

export interface ProductListPage {
  items: ProductSummary[]
  total: number
  hasMore: boolean
}

// --- Admin (CU-16) ---

export interface AdminProductVariant {
  id: string
  productId: string
  sku: string
  attributes: Record<string, string>
  stockTotal: number
  stockReserved: number
}

export interface AdminProduct {
  id: string
  name: string
  description: string
  price: string
  brand: string | null
  isPublished: boolean
  isActive: boolean
  lowStockThreshold: number | null
  categories: ProductCategoryRef[]
  variants: AdminProductVariant[]
  images: ProductImage[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface AdminProductListPage {
  items: AdminProduct[]
  total: number
  hasMore: boolean
}

export interface VariantInput {
  sku: string
  attributes?: Record<string, string>
  stockTotal: number
}

export interface ProductFormInput {
  name: string
  description: string
  price: number
  brand?: string
  categoryIds: string[]
  isPublished?: boolean
  lowStockThreshold?: number
  variants?: VariantInput[]
}
