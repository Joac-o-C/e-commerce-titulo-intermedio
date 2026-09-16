import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProductDetail } from '../../features/catalog/hooks/useProductDetail'

/** CU-09 Ver detalle de producto. */
export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, isError } = useProductDetail(id)

  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  // CU-09 (flujo 8a): al superar el disponible, se informa el máximo y el
  // usuario decide dejar esa cantidad o cancelar — nunca se ajusta solo.
  const [excessPrompt, setExcessPrompt] = useState<{ requested: number; max: number } | null>(null)

  if (isLoading) return <main className="px-4 py-8 text-center">Cargando…</main>
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
                    className={`h-16 w-16 rounded object-cover ${i === selectedImage ? 'ring-2 ring-neutral-800' : ''}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-neutral-800">{product.name}</h1>
          {product.brand && <p className="text-sm text-neutral-500">{product.brand}</p>}
          <p className="mt-2 text-xl font-medium text-neutral-800">${product.price}</p>
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
                        ? 'border-neutral-800 bg-neutral-800 text-white'
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
            <input
              type="number"
              min={1}
              value={quantity}
              disabled={selectedVariant.isOutOfStock}
              onChange={(e) => requestQuantity(Number(e.target.value))}
              className="w-24 rounded border border-neutral-300 px-3 py-2"
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

          <button
            type="button"
            disabled={selectedVariant.isOutOfStock || !!excessPrompt}
            className="mt-6 w-full rounded bg-neutral-800 py-2 text-white disabled:opacity-50"
            title="Disponible en una fase futura del TP"
          >
            Agregar al carrito
          </button>
        </div>
      </div>

      {product.relatedProducts.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-neutral-800">Productos relacionados</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {product.relatedProducts.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="rounded-lg border border-neutral-200 bg-white p-3 hover:shadow"
              >
                <div className="aspect-square overflow-hidden rounded bg-neutral-100">
                  {p.mainImageUrl && (
                    <img src={p.mainImageUrl} alt={p.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-neutral-800">{p.name}</p>
                <p className="text-sm text-neutral-600">${p.price}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
