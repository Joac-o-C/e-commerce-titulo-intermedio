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
      <h1 className="text-center text-3xl font-black tracking-tight text-neutral-950 sm:text-4xl">Catálogo</h1>
      <div aria-hidden="true" className="mx-auto mt-3 h-1 w-12 rounded-full bg-neutral-900" />

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <aside className="w-full self-start space-y-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-100 shadow-sm md:w-56 md:shrink-0">
          <div>
            <input
              aria-label="Buscar productos"
              defaultValue={filters.search ?? ''}
              onChange={(e) => updateFilter({ search: e.target.value })}
              placeholder="Buscar…"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-white">Categorías</legend>
            <div className="space-y-3 text-sm">
              {(categories ?? []).map((c) => (
                <div key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 font-medium text-white hover:bg-neutral-800 has-checked:bg-neutral-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      checked={filters.categoryIds?.includes(c.id) ?? false}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span className="min-w-0">{c.name}</span>
                  </label>
                  {c.children.map((child) => (
                    <label key={child.id} className="ml-3 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 has-checked:bg-neutral-700 has-checked:text-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        checked={filters.categoryIds?.includes(child.id) ?? false}
                        onChange={() => toggleCategory(child.id)}
                      />
                      <span className="min-w-0">{child.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="border-t border-neutral-700 pt-4">
            <legend className="text-sm font-semibold text-white">Precio</legend>
            <div className="flex gap-2">
              <input
                type="number"
                aria-label="Precio mínimo"
                defaultValue={filters.minPrice ?? ''}
                onBlur={(e) => updateFilter({ minPrice: e.target.value })}
                placeholder="Min"
                className="min-w-0 w-1/2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
              <input
                type="number"
                aria-label="Precio máximo"
                defaultValue={filters.maxPrice ?? ''}
                onBlur={(e) => updateFilter({ maxPrice: e.target.value })}
                placeholder="Max"
                className="min-w-0 w-1/2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              checked={filters.inStockOnly ?? false}
              onChange={(e) => updateFilter({ inStockOnly: e.target.checked ? 'true' : undefined })}
            />
            Solo con stock
          </label>

          <div>
            <label htmlFor="catalog-sort" className="mb-2 block text-sm font-semibold text-white">Ordenar por</label>
            <select
              id="catalog-sort"
              value={filters.sort ?? 'relevancia'}
              onChange={(e) => updateFilter({ sort: e.target.value })}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section aria-label="Productos" className="min-w-0 flex-1">
          {activeFilterChips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  className="rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800"
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
            <p role="status" className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">Cargando…</p>
          ) : items.length === 0 ? (
            // CU-04 (flujo 5a): sin resultados.
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
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
              <p className="mb-4 flex items-center gap-2 text-sm text-neutral-600">
                <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">{total}</span>
                resultado(s)
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((p) => (
                  <Link
                    key={p.id}
                    to={`/products/${p.id}`}
                    className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-neutral-900 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-800 motion-reduce:transition-none"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                      {p.mainImageUrl && (
                        <img src={p.mainImageUrl} alt={p.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="mt-3 truncate text-sm font-medium text-neutral-800">{p.name}</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">${p.price}</p>
                    {p.isOutOfStock && <p className="mt-2 w-fit rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">Sin stock</p>}
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
