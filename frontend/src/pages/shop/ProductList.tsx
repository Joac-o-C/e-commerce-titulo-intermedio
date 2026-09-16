import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProducts } from '../../features/catalog/hooks/useProducts'
import { useCategories } from '../../features/catalog/hooks/useCategories'
import type { ProductListFilters, ProductSort } from '../../types/product.types'

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'relevancia', label: 'Relevancia' },
  { value: 'precio_asc', label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' },
  { value: 'nuevos', label: 'Más nuevos' },
  { value: 'nombre_asc', label: 'Nombre A-Z' },
  { value: 'mas_vendidos', label: 'Más vendidos' },
]

/** CU-04 Filtrar productos: filtros, orden y página reflejados en la URL. */
export function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: ProductListFilters = useMemo(
    () => ({
      search: searchParams.get('search') ?? undefined,
      categoryIds: searchParams.getAll('categoryId'),
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      inStockOnly: searchParams.get('inStockOnly') === 'true',
      sort: (searchParams.get('sort') as ProductSort) || undefined,
    }),
    [searchParams],
  )

  const { data: categories } = useCategories()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useProducts(filters)

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    // CU-04 (paso 9): scroll infinito, carga automática al llegar al final.
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  const updateFilter = (patch: Record<string, string | string[] | undefined>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key)
      if (value === undefined || value === '') continue
      if (Array.isArray(value)) {
        for (const v of value) next.append(key, v)
      } else {
        next.set(key, value)
      }
    }
    setSearchParams(next)
  }

  const toggleCategory = (id: string) => {
    const current = searchParams.getAll('categoryId')
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    updateFilter({ categoryId: next })
  }

  const activeFilterChips: { key: string; label: string }[] = []
  if (filters.search) activeFilterChips.push({ key: 'search', label: `"${filters.search}"` })
  if (filters.inStockOnly) activeFilterChips.push({ key: 'inStockOnly', label: 'Solo con stock' })
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    activeFilterChips.push({
      key: 'price',
      label: `Precio ${filters.minPrice ?? 0} - ${filters.maxPrice ?? '∞'}`,
    })
  }
  for (const id of filters.categoryIds ?? []) {
    const found = categories?.flatMap((c) => [c, ...c.children]).find((c) => c.id === id)
    if (found) activeFilterChips.push({ key: `categoryId:${id}`, label: found.name })
  }

  const removeChip = (key: string) => {
    if (key.startsWith('categoryId:')) {
      toggleCategory(key.split(':')[1])
    } else if (key === 'price') {
      updateFilter({ minPrice: undefined, maxPrice: undefined })
    } else {
      updateFilter({ [key]: undefined })
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Catálogo</h1>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <aside className="w-full space-y-6 md:w-56">
          <div>
            <input
              defaultValue={filters.search ?? ''}
              onChange={(e) => updateFilter({ search: e.target.value })}
              placeholder="Buscar…"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Categorías</p>
            <div className="space-y-1 text-sm">
              {(categories ?? []).map((c) => (
                <div key={c.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters.categoryIds?.includes(c.id) ?? false}
                      onChange={() => toggleCategory(c.id)}
                    />
                    {c.name}
                  </label>
                  {c.children.map((child) => (
                    <label key={child.id} className="ml-4 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filters.categoryIds?.includes(child.id) ?? false}
                        onChange={() => toggleCategory(child.id)}
                      />
                      {child.name}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Precio</p>
            <div className="flex gap-2">
              <input
                type="number"
                defaultValue={filters.minPrice ?? ''}
                onBlur={(e) => updateFilter({ minPrice: e.target.value })}
                placeholder="Min"
                className="w-1/2 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                defaultValue={filters.maxPrice ?? ''}
                onBlur={(e) => updateFilter({ maxPrice: e.target.value })}
                placeholder="Max"
                className="w-1/2 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.inStockOnly ?? false}
              onChange={(e) => updateFilter({ inStockOnly: e.target.checked ? 'true' : undefined })}
            />
            Solo con stock
          </label>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Ordenar por</p>
            <select
              value={filters.sort ?? 'relevancia'}
              onChange={(e) => updateFilter({ sort: e.target.value })}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section className="flex-1">
          {activeFilterChips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  className="rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-700"
                >
                  {chip.label} ✕
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="text-xs underline"
              >
                Quitar todos
              </button>
            </div>
          )}

          {isLoading ? (
            <p>Cargando…</p>
          ) : items.length === 0 ? (
            // CU-04 (flujo 5a): sin resultados.
            <div className="rounded-lg bg-neutral-50 p-8 text-center">
              <p className="text-neutral-600">No encontramos productos con esos filtros.</p>
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="mt-2 text-sm underline"
              >
                Quitar filtros
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-neutral-500">{total} resultado(s)</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((p) => (
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
                    {p.isOutOfStock && <p className="text-xs text-red-600">Sin stock</p>}
                  </Link>
                ))}
              </div>
              <div ref={sentinelRef} className="h-10" />
              {isFetchingNextPage && (
                <p className="text-center text-sm text-neutral-500">Cargando más…</p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
