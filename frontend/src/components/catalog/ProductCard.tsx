import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/format'
import { Skeleton } from '../ui/Skeleton'
import type { ProductSummary } from '../../types/product.types'

type ProductCardData = Pick<ProductSummary, 'id' | 'name' | 'price' | 'mainImageUrl'> &
  Partial<Pick<ProductSummary, 'brand' | 'isOutOfStock'>>

/** Tarjeta de producto del catálogo y de "productos relacionados". */
export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col rounded-lg border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800"
    >
      <div className="relative aspect-square overflow-hidden rounded bg-neutral-100">
        {product.mainImageUrl && (
          <img
            src={product.mainImageUrl}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              product.isOutOfStock ? 'opacity-50' : ''
            }`}
          />
        )}
        {product.isOutOfStock && (
          <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-red-700 shadow-sm">
            Sin stock
          </span>
        )}
      </div>
      {product.brand && <p className="mt-2 truncate text-xs text-neutral-500">{product.brand}</p>}
      <p className={`${product.brand ? '' : 'mt-2'} line-clamp-2 text-sm font-medium text-neutral-800`}>
        {product.name}
      </p>
      <p className="mt-auto pt-1 text-base font-semibold text-neutral-900">{formatPrice(product.price)}</p>
    </Link>
  )
}

/** Lugar reservado de una tarjeta mientras carga el listado. */
export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  )
}
