import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProducts } from '../../features/catalog/hooks/useProducts'
import { useCategories } from '../../features/catalog/hooks/useCategories'
import { ProductCard, ProductCardSkeleton } from '../../components/catalog/ProductCard'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { formatPrice, plural } from '../../lib/format'
import type { CategoryNode } from '../../types/category.types'
import type { ProductListFilters, ProductSort } from '../../types/product.types'

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'relevancia', label: 'Relevancia' },
  { value: 'precio_asc', label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' },
  { value: 'nuevos', label: 'Más nuevos' },
  { value: 'nombre_asc', label: 'Nombre A-Z' },
  { value: 'mas_vendidos', label: 'Más vendidos' },
]

const FIELD_CLASSES =
  'w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-800'

type FilterPatch = Record<string, string | string[] | undefined>

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
  const { data, isLoading, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } = useProducts(filters)

  const [filtersOpen, setFiltersOpen] = useState(false)

  const updateFilter = (patch: FilterPatch, options?: { replace?: boolean }) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(patch)) {
          next.delete(key)
          if (value === undefined || value === '') continue
          if (Array.isArray(value)) {
            for (const v of value) next.append(key, v)
          } else {
            next.set(key, value)
          }
        }
        return next
      },
      { replace: options?.replace },
    )
  }

  // Búsqueda: se escribe en un estado local y recién se pasa a la URL (y al
  // backend) cuando el usuario deja de tipear 300 ms. `replace` evita llenar
  // el historial con una entrada por letra.
  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debouncedSearch = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debouncedSearch.trim() !== (searchParams.get('search') ?? '')) {
      updateFilter({ search: debouncedSearch.trim() || undefined }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo reacciona al texto ya estabilizado
  }, [debouncedSearch])

  const clearAll = () => {
    setSearchText('')
    setSearchParams(new URLSearchParams())
  }

  const toggleCategory = (id: string) => {
    const current = searchParams.getAll('categoryId')
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    updateFilter({ categoryId: next })
  }

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

  const activeFilterChips: { key: string; label: string }[] = []
  if (filters.search) activeFilterChips.push({ key: 'search', label: `"${filters.search}"` })
  if (filters.inStockOnly) activeFilterChips.push({ key: 'inStockOnly', label: 'Solo con stock' })
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice !== undefined ? formatPrice(filters.minPrice) : '$0'
    const max = filters.maxPrice !== undefined ? formatPrice(filters.maxPrice) : 'sin tope'
    activeFilterChips.push({ key: 'price', label: `${min} – ${max}` })
  }
  for (const id of filters.categoryIds ?? []) {
    const found = categories?.flatMap((c) => [c, ...c.children]).find((c) => c.id === id)
    if (found) activeFilterChips.push({ key: `categoryId:${id}`, label: found.name })
  }
  // El contador del botón "Filtrar" no incluye la búsqueda: el buscador queda siempre a la vista.
  const panelFilterCount = activeFilterChips.filter((c) => c.key !== 'search').length

  const removeChip = (key: string) => {
    if (key.startsWith('categoryId:')) {
      toggleCategory(key.split(':')[1])
    } else if (key === 'price') {
      updateFilter({ minPrice: undefined, maxPrice: undefined })
    } else if (key === 'search') {
      setSearchText('')
      updateFilter({ search: undefined })
    } else {
      updateFilter({ [key]: undefined })
    }
  }

  const searchInput = (
    <div className="relative">
      <SearchIcon />
      <input
        type="search"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Buscar productos…"
        aria-label="Buscar productos"
        className={`${FIELD_CLASSES} pl-9`}
      />
    </div>
  )

  const sortSelect = (
    <select
      value={filters.sort ?? 'relevancia'}
      onChange={(e) => updateFilter({ sort: e.target.value })}
      aria-label="Ordenar por"
      className={FIELD_CLASSES}
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )

  const filtersPanel = (
    <FiltersPanel
      categories={categories ?? []}
      filters={filters}
      onToggleCategory={toggleCategory}
      onUpdate={updateFilter}
    />
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-800">Catálogo</h1>
        {!isLoading && (
          <p className="text-sm text-neutral-500" aria-live="polite">
            {plural(total, 'producto', 'productos')}
          </p>
        )}
      </div>

      {/* Barra de mobile: buscador + botón de filtros + orden. */}
      <div className="mt-4 space-y-3 md:hidden">
        {searchInput}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            className="flex flex-1 items-center justify-center gap-2 rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800"
          >
            <FilterIcon />
            Filtrar
            {panelFilterCount > 0 && (
              <span className="rounded-full bg-neutral-800 px-1.5 text-xs leading-5 text-white">{panelFilterCount}</span>
            )}
          </button>
          <div className="flex-1">{sortSelect}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className="hidden w-56 shrink-0 space-y-6 md:block">
          {searchInput}
          {filtersPanel}
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-800">Ordenar por</p>
            {sortSelect}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {activeFilterChips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  aria-label={`Quitar filtro ${chip.label}`}
                  className="flex items-center gap-1.5 rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-800 hover:bg-neutral-300"
                >
                  {chip.label}
                  <span aria-hidden="true">✕</span>
                </button>
              ))}
              <button type="button" onClick={clearAll} className="text-xs text-neutral-600 underline hover:text-neutral-900">
                Quitar todos
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Cargando productos">
              {Array.from({ length: 8 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            // CU-04 (flujo 5a): sin resultados.
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="font-medium text-neutral-800">No encontramos productos con esos filtros.</p>
              <p className="mt-1 text-sm text-neutral-500">Probá con otra búsqueda o quitando algún filtro.</p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-4 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
              >
                Quitar filtros
              </button>
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${
                  isPlaceholderData ? 'opacity-60' : ''
                }`}
              >
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
                {isFetchingNextPage &&
                  Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={`more-${i}`} />)}
              </div>
              <div ref={sentinelRef} className="h-10" />
            </>
          )}
        </section>
      </div>

      {filtersOpen && (
        <FiltersDrawer onClose={() => setFiltersOpen(false)} resultsLabel={plural(total, 'producto', 'productos')}>
          {filtersPanel}
          {panelFilterCount > 0 && (
            <button type="button" onClick={clearAll} className="text-sm text-neutral-600 underline">
              Quitar filtros
            </button>
          )}
        </FiltersDrawer>
      )}
    </main>
  )
}

interface FiltersPanelProps {
  categories: CategoryNode[]
  filters: ProductListFilters
  onToggleCategory: (id: string) => void
  onUpdate: (patch: FilterPatch) => void
}

/** Categorías, rango de precio y stock: se usa en la columna de desktop y en el panel de mobile. */
function FiltersPanel({ categories, filters, onToggleCategory, onUpdate }: FiltersPanelProps) {
  const applyPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onUpdate({ minPrice: String(form.get('minPrice') ?? ''), maxPrice: String(form.get('maxPrice') ?? '') })
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-800">Categorías</legend>
        <div className="space-y-1.5 text-sm text-neutral-700">
          {categories.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <CategoryCheckbox
                category={c}
                checked={filters.categoryIds?.includes(c.id) ?? false}
                onChange={() => onToggleCategory(c.id)}
              />
              {c.children.map((child) => (
                <div key={child.id} className="ml-5">
                  <CategoryCheckbox
                    category={child}
                    checked={filters.categoryIds?.includes(child.id) ?? false}
                    onChange={() => onToggleCategory(child.id)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      {/* `key` reinicia los campos si el rango cambia desde afuera (chip o "Quitar todos"). */}
      <form key={`${filters.minPrice ?? ''}-${filters.maxPrice ?? ''}`} onSubmit={applyPrice}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-800">Precio</legend>
          <div className="flex items-center gap-2">
            <input
              name="minPrice"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={filters.minPrice ?? ''}
              placeholder="Mín."
              aria-label="Precio mínimo"
              className={FIELD_CLASSES}
            />
            <span className="text-neutral-400" aria-hidden="true">
              –
            </span>
            <input
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={filters.maxPrice ?? ''}
              placeholder="Máx."
              aria-label="Precio máximo"
              className={FIELD_CLASSES}
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded border border-neutral-300 bg-white py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
          >
            Aplicar precio
          </button>
        </fieldset>
      </form>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={filters.inStockOnly ?? false}
          onChange={(e) => onUpdate({ inStockOnly: e.target.checked ? 'true' : undefined })}
          className="h-4 w-4 accent-neutral-800"
        />
        Solo con stock
      </label>
    </div>
  )
}

function CategoryCheckbox({ category, checked, onChange }: { category: CategoryNode; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 hover:text-neutral-900">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-neutral-800" />
      {category.name}
    </label>
  )
}

/** Panel lateral de filtros para mobile. Se cierra con Escape, tocando afuera o con el botón de resultados. */
function FiltersDrawer({
  children,
  onClose,
  resultsLabel,
}: {
  children: React.ReactNode
  onClose: () => void
  resultsLabel: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Ref para no re-ejecutar el efecto (foco, bloqueo de scroll) cada vez que el padre re-renderiza.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    // Evita que la página de atrás scrollee mientras el panel está abierto.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 id="filters-title" className="text-base font-semibold text-neutral-800">
            Filtros
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar filtros"
            className="flex h-9 w-9 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">{children}</div>
        <div className="border-t border-neutral-200 p-4">
          <button type="button" onClick={onClose} className="w-full rounded bg-neutral-800 py-2.5 font-medium text-white">
            Ver {resultsLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}
