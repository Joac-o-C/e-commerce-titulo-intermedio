import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminProductsService } from '../../services/admin-products.service'
import { adminCategoriesService } from '../../services/admin-categories.service'
import { Table } from '../../components/ui/Table'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { AdminProduct, AdminProductVariant, ProductFormInput, VariantInput } from '../../types/product.types'
import type { CategoryNode } from '../../types/category.types'

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? fallback
}

function flattenCategories(tree: CategoryNode[]): CategoryNode[] {
  return tree.flatMap((c) => [c, ...flattenCategories(c.children)])
}

interface VariantRow {
  /** Clave estable de la fila en el formulario (las filas se reordenan). */
  key: string
  /** Variante existente (edición); undefined si es nueva. */
  id?: string
  sku: string
  attributeKey: string
  attributeValue: string
  stockTotal: number
  /** Stock total al abrir el formulario (sólo existentes): si no se tocó, el backend no lo pisa. */
  originalStockTotal?: number
}

function toVariantRow(v: AdminProductVariant): VariantRow {
  const [attributeKey, attributeValue] = Object.entries(v.attributes)[0] ?? ['', '']
  return { key: v.id, id: v.id, sku: v.sku, attributeKey, attributeValue, stockTotal: v.stockTotal, originalStockTotal: v.stockTotal }
}

function formatVariantAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
}

let nextRowKey = 0
const newVariantRow = (): VariantRow => ({
  key: `nueva-${nextRowKey++}`,
  sku: '',
  attributeKey: '',
  attributeValue: '',
  stockTotal: 0,
})

interface FormState {
  name: string
  description: string
  price: string
  brand: string
  categoryIds: string[]
  isPublished: boolean
  lowStockThreshold: string
  variants: VariantRow[]
}

const emptyForm: FormState = {
  name: '',
  description: '',
  price: '',
  brand: '',
  categoryIds: [],
  isPublished: false,
  lowStockThreshold: '',
  variants: [newVariantRow()],
}

function toFormInput(form: FormState): ProductFormInput {
  // Una fila nueva sin SKU se ignora; una existente siempre viaja (si no,
  // el backend la daría de baja) y el backend valida su SKU.
  const variants: VariantInput[] = form.variants
    .filter((v) => v.id || v.sku.trim() !== '')
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      stockTotal: v.stockTotal,
      originalStockTotal: v.id ? v.originalStockTotal : undefined,
      attributes: v.attributeKey ? { [v.attributeKey]: v.attributeValue } : {},
    }))
  return {
    name: form.name,
    description: form.description,
    price: Number(form.price),
    brand: form.brand || undefined,
    categoryIds: form.categoryIds,
    isPublished: form.isPublished,
    lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : undefined,
    variants: variants.length > 0 ? variants : undefined,
  }
}

/** CU-16 ABM de productos (admin). */
export function AdminProducts() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const { data: page, isLoading } = useQuery({
    queryKey: ['admin', 'products', search],
    queryFn: () => adminProductsService.list({ search: search || undefined }),
  })
  const { data: categoryTree } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminCategoriesService.tree(),
  })
  const categories = flattenCategories(categoryTree ?? [])

  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null)
  const [showForm, setShowForm] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })

  const resetForm = () => {
    setForm(emptyForm)
    setEditing(null)
    setImages([])
    setShowForm(false)
  }

  const createMutation = useMutation({
    mutationFn: ({ input, files }: { input: ProductFormInput; files: File[] }) =>
      adminProductsService.create(input, files),
    onSuccess: () => {
      resetForm()
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo crear el producto')),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
      version,
      files,
    }: {
      id: string
      input: ProductFormInput
      version: number
      files: File[]
    }) => adminProductsService.update(id, input, version, files),
    onSuccess: () => {
      resetForm()
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo guardar el producto')),
  })

  const publishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      adminProductsService.setPublished(id, isPublished),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminProductsService.remove(id),
    onSuccess: () => {
      setToDelete(null)
      invalidate()
    },
    onError: (err) => {
      setToDelete(null)
      setError(extractErrorMessage(err, 'No se pudo dar de baja el producto'))
    },
  })

  const startEdit = (product: AdminProduct) => {
    setEditing(product)
    setImages([])
    setForm({
      name: product.name,
      description: product.description,
      price: product.price,
      brand: product.brand ?? '',
      categoryIds: product.categories.map((c) => c.id),
      isPublished: product.isPublished,
      lowStockThreshold: product.lowStockThreshold?.toString() ?? '',
      variants: product.variants.map(toVariantRow),
    })
    setShowForm(true)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const input = toFormInput(form)
    if (editing) {
      updateMutation.mutate({ id: editing.id, input, version: editing.version, files: images })
    } else {
      createMutation.mutate({ input, files: images })
    }
  }

  const toggleCategory = (id: string) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }))
  }

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }))
  }

  /** El orden de la lista es el orden en que el Cliente ve las variantes. */
  const moveVariant = (index: number, delta: -1 | 1) => {
    setForm((f) => {
      const variants = [...f.variants]
      const target = index + delta
      if (target < 0 || target >= variants.length) return f
      ;[variants[index], variants[target]] = [variants[target], variants[index]]
      return { ...f, variants }
    })
  }

  const removeVariant = (index: number) => {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }))
  }

  /** Vuelve a la lista (al final) una variante dada de baja; se guarda con el resto. */
  const reactivateVariant = (variant: AdminProductVariant) => {
    setForm((f) => ({ ...f, variants: [...f.variants, toVariantRow(variant)] }))
  }

  const inactiveVariants =
    editing?.inactiveVariants.filter((v) => !form.variants.some((row) => row.id === v.id)) ?? []

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-800">Productos</h1>
        <button
          type="button"
          className="rounded bg-neutral-800 px-4 py-2 text-sm text-white"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          Crear producto
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o marca…"
        className="mt-4 w-full max-w-sm rounded border border-neutral-300 px-3 py-2"
      />

      {showForm && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-lg bg-white p-4 shadow">
          <h2 className="font-medium text-neutral-700">
            {editing ? `Editar "${editing.name}"` : 'Nuevo producto'}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre"
              className="rounded border border-neutral-300 px-3 py-2"
              required
            />
            <input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="Marca (opcional)"
              className="rounded border border-neutral-300 px-3 py-2"
            />
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="Precio"
              className="rounded border border-neutral-300 px-3 py-2"
              required
            />
            <input
              type="number"
              value={form.lowStockThreshold}
              onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
              placeholder="Umbral de stock bajo (opcional, default 5)"
              className="rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción"
            className="w-full rounded border border-neutral-300 px-3 py-2"
            required
          />

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Categorías</p>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(c.id)}
                    onChange={() => toggleCategory(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">
              Imágenes {editing && '(se agregan a las existentes)'}
            </p>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImages(Array.from(e.target.files ?? []))}
            />
            {images.length > 0 && (
              <div className="mt-2 flex gap-2">
                {images.map((file, i) => (
                  <img
                    key={i}
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                ))}
              </div>
            )}
            {editing && editing.images.length > 0 && (
              <div className="mt-2 flex gap-2">
                {editing.images.map((img) => (
                  <img key={img.id} src={img.url} alt="" className="h-16 w-16 rounded object-cover" />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Variantes</p>
            {form.variants.map((v, i) => (
              <div
                key={v.key}
                className="mb-2 grid grid-cols-2 gap-2 border-b border-neutral-200 pb-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:border-0 sm:pb-0"
              >
                <input
                  value={v.sku}
                  onChange={(e) => updateVariant(i, { sku: e.target.value })}
                  placeholder="SKU"
                  aria-label="SKU"
                  className="rounded border border-neutral-300 px-2 py-1"
                />
                <input
                  value={v.attributeKey}
                  onChange={(e) => updateVariant(i, { attributeKey: e.target.value })}
                  placeholder="Atributo (ej. Talle)"
                  aria-label="Atributo"
                  className="rounded border border-neutral-300 px-2 py-1"
                />
                <input
                  value={v.attributeValue}
                  onChange={(e) => updateVariant(i, { attributeValue: e.target.value })}
                  placeholder="Valor (ej. M)"
                  aria-label="Valor"
                  className="rounded border border-neutral-300 px-2 py-1"
                />
                <input
                  type="number"
                  value={v.stockTotal}
                  onChange={(e) => updateVariant(i, { stockTotal: Number(e.target.value) })}
                  placeholder={v.id ? 'Stock total' : 'Stock inicial'}
                  aria-label={v.id ? 'Stock total' : 'Stock inicial'}
                  className="rounded border border-neutral-300 px-2 py-1"
                />
                <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => moveVariant(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir variante"
                    className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVariant(i, 1)}
                    disabled={i === form.variants.length - 1}
                    aria-label="Bajar variante"
                    className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    disabled={form.variants.length === 1}
                    aria-label="Quitar variante"
                    className="rounded border border-neutral-300 px-2 py-1 text-sm text-red-700 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, newVariantRow()] }))}
            >
              + Agregar variante
            </button>
            {inactiveVariants.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-sm font-medium text-neutral-700">Dadas de baja</p>
                {inactiveVariants.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-neutral-600">
                      {v.sku}
                      {Object.keys(v.attributes).length > 0 && ` — ${formatVariantAttributes(v.attributes)}`} · stock{' '}
                      {v.stockTotal}
                    </span>
                    <button
                      type="button"
                      onClick={() => reactivateVariant(v)}
                      className="rounded border border-neutral-300 px-2 py-1"
                    >
                      Reactivar
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              {editing
                ? 'El orden de la lista es el que ve el cliente. Quitar una variante la da de baja (se conserva en los pedidos) y cambiar su stock queda registrado como ajuste en el historial de stock.'
                : 'El orden de la lista es el que ve el cliente. Si no cargás ninguna, se crea una variante única sin atributos.'}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />
            Publicado (visible en el catálogo)
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </button>
            <button type="button" className="text-sm underline" onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 rounded-lg bg-white p-4 shadow">
        {isLoading ? (
          <p>Cargando…</p>
        ) : (
          <Table
            rows={page?.items ?? []}
            rowKey={(p) => p.id}
            columns={[
              { header: 'Nombre', render: (p) => p.name },
              { header: 'Precio', render: (p) => `$${p.price}` },
              { header: 'Categorías', render: (p) => p.categories.map((c) => c.name).join(', ') },
              {
                header: 'Stock',
                render: (p) => p.variants.reduce((sum, v) => sum + v.stockTotal - v.stockReserved, 0),
              },
              { header: 'Publicado', render: (p) => (p.isPublished ? 'Sí' : 'No') },
              {
                header: 'Acciones',
                render: (p) => (
                  <div className="flex gap-3 text-sm">
                    <button type="button" className="underline" onClick={() => startEdit(p)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => publishMutation.mutate({ id: p.id, isPublished: !p.isPublished })}
                    >
                      {p.isPublished ? 'Despublicar' : 'Publicar'}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 underline"
                      onClick={() => setToDelete(p)}
                    >
                      Dar de baja
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={`Dar de baja "${toDelete?.name}"`}
        description="El producto deja de estar disponible para la venta. No se puede deshacer desde acá."
        confirmLabel="Dar de baja"
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && removeMutation.mutate(toDelete.id)}
      />
    </main>
  )
}
