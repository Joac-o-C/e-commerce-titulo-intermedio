import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminCategoriesService } from '../../services/admin-categories.service'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { CategoryNode, CreateCategoryInput } from '../../types/category.types'

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? fallback
}

const emptyForm: CreateCategoryInput = { name: '', description: '', order: 0, isVisible: true }

/** CU-17 ABM de categorías y subcategorías (admin). */
export function AdminCategories() {
  const queryClient = useQueryClient()
  const { data: tree, isLoading } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminCategoriesService.tree(),
  })

  const [form, setForm] = useState<CreateCategoryInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<CategoryNode | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })

  const createMutation = useMutation({
    mutationFn: (input: CreateCategoryInput) => adminCategoriesService.create(input),
    onSuccess: () => {
      setForm(emptyForm)
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo crear la categoría')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCategoryInput }) =>
      adminCategoriesService.update(id, input),
    onSuccess: () => {
      setForm(emptyForm)
      setEditingId(null)
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo guardar la categoría')),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminCategoriesService.remove(id),
    onSuccess: () => {
      setToDelete(null)
      invalidate()
    },
    onError: (err) => {
      setToDelete(null)
      setError(extractErrorMessage(err, 'No se pudo dar de baja la categoría'))
    },
  })

  const topLevel = tree?.filter((c) => c.parentId === null) ?? []

  const startEdit = (category: CategoryNode) => {
    setEditingId(category.id)
    setForm({
      name: category.name,
      description: category.description ?? '',
      parentId: category.parentId ?? undefined,
      order: category.order,
      isVisible: category.isVisible,
    })
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (editingId) {
      updateMutation.mutate({ id: editingId, input: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const renderNode = (category: CategoryNode, depth: number) => (
    <div key={category.id}>
      <div
        className="flex items-center justify-between border-b border-neutral-100 py-2"
        style={{ paddingLeft: depth * 20 }}
      >
        <div>
          <span className="font-medium text-neutral-800">{category.name}</span>
          <span className="ml-2 text-sm text-neutral-500">
            ({category.productCount} producto{category.productCount === 1 ? '' : 's'})
          </span>
          {!category.isVisible && <span className="ml-2 text-xs text-amber-600">oculta</span>}
        </div>
        <div className="flex gap-3 text-sm">
          <button type="button" className="underline" onClick={() => startEdit(category)}>
            Editar
          </button>
          <button
            type="button"
            className="text-red-600 underline"
            onClick={() => setToDelete(category)}
          >
            Dar de baja
          </button>
        </div>
      </div>
      {category.children.map((child) => renderNode(child, depth + 1))}
    </div>
  )

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Categorías</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-medium text-neutral-700">
          {editingId ? 'Editar categoría' : 'Nueva categoría'}
        </h2>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre"
          className="w-full rounded border border-neutral-300 px-3 py-2"
          required
        />
        <input
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Descripción (opcional)"
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
        <select
          value={form.parentId ?? ''}
          onChange={(e) => setForm({ ...form, parentId: e.target.value || undefined })}
          className="w-full rounded border border-neutral-300 px-3 py-2"
        >
          <option value="">Sin padre (categoría de primer nivel)</option>
          {topLevel
            .filter((c) => c.id !== editingId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="number"
              value={form.order ?? 0}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              className="w-20 rounded border border-neutral-300 px-2 py-1"
            />
            Orden
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={form.isVisible ?? true}
              onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
            />
            Visible en el catálogo
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {editingId ? 'Guardar cambios' : 'Crear categoría'}
          </button>
          {editingId && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <div className="mt-6 rounded-lg bg-white p-4 shadow">
        {isLoading ? <p>Cargando…</p> : topLevel.map((c) => renderNode(c, 0))}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={`Dar de baja "${toDelete?.name}"`}
        description="La categoría dejará de estar disponible. No se puede deshacer desde acá."
        confirmLabel="Dar de baja"
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && removeMutation.mutate(toDelete.id)}
      />
    </main>
  )
}
