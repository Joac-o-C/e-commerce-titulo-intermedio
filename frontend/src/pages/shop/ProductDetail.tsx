import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProductDetail } from '../../features/catalog/hooks/useProductDetail'
import { useCartMutations } from '../../features/cart/hooks/useCartMutations'
import { useGuestCart } from '../../features/cart/hooks/useGuestCart'
import { useAuthStore } from '../../store/auth.store'
import type { InsufficientStockError } from '../../types/cart.types'
import { formatPrice } from '../../lib/format'
import { ProductCard } from '../../components/catalog/ProductCard'
import { QuantityStepper } from '../../components/ui/QuantityStepper'
import { Skeleton } from '../../components/ui/Skeleton'
import { Spinner } from '../../components/ui/Spinner'
import { useToastStore } from '../../store/toast.store'

/** CU-09 Ver detalle de producto. */
export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, isError } = useProductDetail(id)
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated')
  const { addItem } = useCartMutations()
  const guestCart = useGuestCart()

  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  // CU-09 (flujo 8a) / CU-02 (flujo 3a): al superar el disponible, se
  // informa el máximo y el usuario decide dejar esa cantidad o cancelar —
  // nunca se ajusta solo.
  const [excessPrompt, setExcessPrompt] = useState<{ requested: number; max: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const showToast = useToastStore((s) => s.show)

  if (isLoading) return <ProductDetailSkeleton />
  if (isError || !product) {
    // CU-09 (flujo 2a): producto inexistente o no publicado.
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-neutral-600">Producto no disponible.</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">
          Volver al catálogo
        </Link>
      </main>
    )
  }

  const hasVariantSelector = product.variants.length > 1
  const selectedVariant =
    product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0]

  const requestQuantity = (value: number) => {
    if (value < 1 || !Number.isInteger(value)) return
    if (value > selectedVariant.stockAvailable) {
      setExcessPrompt({ requested: value, max: selectedVariant.stockAvailable })
      return
    }
    setExcessPrompt(null)
    setQuantity(value)
  }

  /** @usecase CU-02 Agregar producto al carrito */
  const handleAddToCart = async () => {
    const notifyAdded = () =>
      showToast(`Agregaste ${product.name} al carrito.`, 'success', { label: 'Ver carrito', to: '/cart' })

    setAdding(true)
    try {
      if (isAuthenticated) {
        await addToServerCart(notifyAdded)
      } else {
        await addToGuestCart(notifyAdded)
      }
    } finally {
      setAdding(false)
    }
  }

  const addToServerCart = async (notifyAdded: () => void) => {
    try {
      await addItem.mutateAsync({ variantId: selectedVariant.id, quantity })
      notifyAdded()
    } catch (err) {
      const data = (err as { response?: { data?: InsufficientStockError } })?.response?.data
      // CU-02 (flujo 3a): informar el máximo, nunca ajustar solo.
      if (data?.code === 'INSUFFICIENT_STOCK') {
        setExcessPrompt({ requested: quantity, max: data.maxAvailable })
      }
    }
  }

  const addToGuestCart = async (notifyAdded: () => void) => {
    const result = await guestCart.addItem(
      selectedVariant.id,
      product.id,
      product.name,
      selectedVariant.attributes,
      quantity,
    )
    if (result.outcome === 'insufficient_stock') {
      setExcessPrompt({ requested: quantity, max: result.maxAvailable ?? 0 })
    } else if (result.outcome === 'ok') {
      notifyAdded()
    }
  }

  const availabilityLabel = selectedVariant.isOutOfStock
    ? 'Sin stock'
    : selectedVariant.isLowStock
      ? `Últimas ${selectedVariant.stockAvailable} unidades`
      : 'Disponible'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/" className="text-sm underline">
        ← Volver al catálogo
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-lg bg-neutral-100">
            {product.images[selectedImage] && (
              <img
                src={product.images[selectedImage].url}
                alt={product.images[selectedImage].altText ?? product.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-2 flex gap-2">
              {product.images.map((img, i) => (
                <button key={img.id} type="button" onClick={() => setSelectedImage(i)}>
                  <img
                    src={img.url}
                    alt=""
                    className={`h-16 w-16 rounded object-cover ${i === selectedImage ? 'ring-2 ring-primary' : ''}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-neutral-800">{product.name}</h1>
          {product.brand && <p className="text-sm text-neutral-500">{product.brand}</p>}
          <p className="mt-2 text-xl font-medium text-neutral-800">{formatPrice(product.price)}</p>
          <p className="mt-1 text-sm text-neutral-600">{product.description}</p>

          {product.categories.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              {product.categories.map((c) => c.name).join(' · ')}
            </p>
          )}

          <p
            className={`mt-4 text-sm font-medium ${
              selectedVariant.isOutOfStock
                ? 'text-red-600'
                : selectedVariant.isLowStock
                  ? 'text-amber-600'
                  : 'text-green-700'
            }`}
          >
            {availabilityLabel}
          </p>

          {hasVariantSelector && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium text-neutral-700">Variante</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.isOutOfStock}
                    onClick={() => {
                      setSelectedVariantId(v.id)
                      setQuantity(1)
                      setExcessPrompt(null)
                    }}
                    className={`rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                      selectedVariant.id === v.id
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-neutral-300'
                    }`}
                  >
                    {Object.values(v.attributes).join(' / ') || v.sku}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-neutral-700">Cantidad</p>
            <QuantityStepper
              value={quantity}
              onChange={requestQuantity}
              max={selectedVariant.stockAvailable}
              disabled={selectedVariant.isOutOfStock}
            />
            {excessPrompt && (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                <p>
                  Sólo quedan {excessPrompt.max} unidades disponibles (pediste {excessPrompt.requested}).
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setQuantity(excessPrompt.max)
                      setExcessPrompt(null)
                    }}
                  >
                    Dejar en {excessPrompt.max}
                  </button>
                  <button type="button" className="underline" onClick={() => setExcessPrompt(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* En mobile el botón queda pegado abajo mientras se scrollea la ficha. */}
          <div className="sticky bottom-0 -mx-4 mt-6 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <button
              type="button"
              disabled={selectedVariant.isOutOfStock || !!excessPrompt || adding}
              onClick={handleAddToCart}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary hover:bg-primary-hover py-3 font-medium text-on-primary disabled:opacity-50"
            >
              {adding && <Spinner />}
              {selectedVariant.isOutOfStock ? 'Sin stock' : adding ? 'Agregando…' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>

      {product.relatedProducts.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-neutral-800">Productos relacionados</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {product.relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

/** Lugar reservado de la ficha mientras carga. */
function ProductDetailSkeleton() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Cargando producto">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <div className="space-y-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      </div>
    </main>
  )
}
