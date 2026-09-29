import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Table, type TableColumn } from '../../components/ui/Table'
import { apiErrorMessage, formatShippingCost } from '../../features/orders/order-labels'
import { adminShippingService } from '../../services/admin-shipping.service'
import type { AdminShippingMethod } from '../../types/admin-orders.types'

/** Mismas reglas que el DTO del backend: nombre obligatorio, costo ≥ 0 con hasta 2 decimales (0 = gratis). */
const schema = z.object({
  name: z.string().trim().min(1, 'Indicá el nombre').max(100),
  description: z.string().trim().max(255),
  cost: z
    .string()
    .trim()
    .regex(/^\d{1,8}([.,]\d{1,2})?$/, 'Un importe mayor o igual a 0, con hasta 2 decimales'),
})
type FormValues = z.infer<typeof schema>

const empty: FormValues = { name: '', description: '', cost: '' }

/**
 * ABM de métodos de envío (alcance extra de la Fase 6). Baja lógica
 * (activar/desactivar); los pedidos guardan un snapshot del método, así
 * que editar o desactivar uno no afecta pedidos existentes.
 */
export function AdminShippingMethods() {
  const queryClient = useQueryClient()
  const { data: methods, isLoading } = useQuery({ queryKey: ['admin', 'shipping-methods'], queryFn: adminShippingService.list })
  const [editing, setEditing] = useState<AdminShippingMethod | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminShippingMethod | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'shipping-methods'] })
  const done = (message: string) => {
    reset(empty)
    setEditing(null)
    setError(null)
    setNotice(message)
    void invalidate()
  }

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const input = { name: values.name, description: values.description || null, cost: Number(values.cost.replace(',', '.')) }
      return editing ? adminShippingService.update(editing.id, input) : adminShippingService.create(input)
    },
    onSuccess: (method) => done(editing ? `Se guardó "${method.name}".` : `Se creó "${method.name}".`),
    onError: (err) => {
      setNotice(null)
      setError(apiErrorMessage(err, 'No se pudo guardar el método de envío.'))
    },
  })

  const toggle = useMutation({
    mutationFn: ({ method, isActive }: { method: AdminShippingMethod; isActive: boolean }) =>
      adminShippingService.setActive(method.id, isActive),
    onSuccess: ({ method, lastActiveDisabled }) => {
      setToDeactivate(null)
      setError(null)
      setNotice(
        lastActiveDisabled
          ? `Se desactivó "${method.name}". No queda ningún método de envío activo: nadie va a poder finalizar una compra hasta que actives otro.`
          : `"${method.name}" quedó ${method.isActive ? 'activo' : 'inactivo'}.`,
      )
      void invalidate()
    },
    onError: (err) => {
      setToDeactivate(null)
      setNotice(null)
      setError(apiErrorMessage(err, 'No se pudo cambiar el estado del método.'))
    },
  })

  const startEdit = (method: AdminShippingMethod) => {
    setEditing(method)
    setNotice(null)
    setError(null)
    reset({ name: method.name, description: method.description ?? '', cost: method.cost })
  }

  const activeCount = methods?.filter((m) => m.isActive).length ?? 0
  const costChanged = editing !== null && Number(watch('cost').replace(',', '.')) !== Number(editing.cost)

  const columns: TableColumn<AdminShippingMethod>[] = [
    {
      header: 'Nombre',
      render: (m) => (
        <>
          <span className="block font-medium text-neutral-800">{m.name}</span>
          {m.description && <span className="text-xs text-neutral-500">{m.description}</span>}
        </>
      ),
    },
    { header: 'Costo', render: (m) => formatShippingCost(m.cost), className: 'text-right' },
    { header: 'Estado', render: (m) => (m.isActive ? 'Activo' : 'Inactivo') },
    {
      header: 'Acciones',
      render: (m) => (
        <span className="flex gap-3">
          <button type="button" onClick={() => startEdit(m)} className="underline">
            Editar
          </button>
          <button
            type="button"
            onClick={() => (m.isActive ? setToDeactivate(m) : toggle.mutate({ method: m, isActive: true }))}
            className="underline"
          >
            {m.isActive ? 'Desactivar' : 'Activar'}
          </button>
        </span>
      ),
    },
  ]

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Métodos de envío</h1>

      {notice && <p className="rounded border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700">{notice}</p>}
      {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      {methods && activeCount === 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          No hay métodos de envío activos: el checkout no puede ofrecer ninguno.
        </p>
      )}

      <form
        onSubmit={handleSubmit((values) => save.mutate(values))}
        className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-3"
      >
        <h2 className="font-semibold text-neutral-800 sm:col-span-3">{editing ? `Editar "${editing.name}"` : 'Nuevo método'}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Nombre</span>
          <input {...register('name')} className="rounded border border-neutral-300 px-2 py-1.5" />
          {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Descripción (opcional)</span>
          <input {...register('description')} className="rounded border border-neutral-300 px-2 py-1.5" />
          {errors.description && <span className="text-xs text-red-600">{errors.description.message}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Costo ($, 0 = gratis)</span>
          <input {...register('cost')} inputMode="decimal" className="rounded border border-neutral-300 px-2 py-1.5" />
          {errors.cost && <span className="text-xs text-red-600">{errors.cost.message}</span>}
        </label>
        {costChanged && (
          <p className="text-xs text-amber-800 sm:col-span-3">
            El nuevo costo sólo se aplica a los pedidos nuevos: los pedidos existentes conservan el costo con el que se compraron.
          </p>
        )}
        <div className="flex gap-2 sm:col-span-3">
          <button type="submit" disabled={save.isPending} className="rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50">
            {editing ? 'Guardar' : 'Crear'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                reset(empty)
              }}
              className="rounded border border-neutral-300 px-3 py-1.5"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {isLoading && <p className="text-neutral-600">Cargando…</p>}
      {methods && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <Table columns={columns} rows={methods} rowKey={(m) => m.id} emptyMessage="Todavía no hay métodos de envío" />
        </div>
      )}

      <ConfirmDialog
        open={toDeactivate !== null}
        title={`¿Desactivar "${toDeactivate?.name}"?`}
        description={
          activeCount === 1
            ? 'Es el último método activo: si lo desactivás, nadie va a poder finalizar una compra hasta que actives otro.'
            : 'Deja de ofrecerse en el checkout. Los pedidos que ya lo usan no cambian.'
        }
        confirmLabel="Desactivar"
        onConfirm={() => toDeactivate && toggle.mutate({ method: toDeactivate, isActive: false })}
        onCancel={() => setToDeactivate(null)}
      />
    </main>
  )
}
