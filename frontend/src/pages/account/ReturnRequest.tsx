import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrderDetail } from '../../features/orders/hooks/useOrderDetail'
import { apiErrorMessage, formatDate } from '../../features/orders/order-labels'
import { ordersService } from '../../services/orders.service'
import type { CreatedReturnRequest, ReturnRequestType } from '../../types/order.types'

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * CU-15 Solicitar cambio o devolución (pasos 3-9): ítems elegibles con
 * cantidad, tipo, motivo y hasta 3 fotos. Las validaciones de acá
 * (flujo 5a) son para avisar antes de enviar; el backend las repite.
 */
export function ReturnRequest() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrderDetail(id)

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [type, setType] = useState<ReturnRequestType>('devolucion')
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedReturnRequest | null>(null)

  const submit = useMutation({
    mutationFn: () =>
      ordersService.createReturn(id!, {
        type,
        reason: reason.trim(),
        items: Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        photos,
      }),
    onSuccess: (result) => {
      setCreated(result)
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'No pudimos registrar la solicitud. Probá de nuevo.')),
  })

  if (isLoading) return <main className="px-4 py-16 text-center text-neutral-600">Cargando el pedido…</main>
  if (isError || !order) {
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-neutral-700">Pedido no disponible.</p>
        <Link to="/account/orders" className="mt-3 inline-block text-sm underline">
          Volver a mis pedidos
        </Link>
      </main>
    )
  }

  // CU-15 (pasos 7 y 9): comprobante e instrucciones.
  if (created) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-lg border border-green-300 bg-green-50 p-5 text-green-900">
          <h1 className="text-xl font-semibold">Recibimos tu solicitud #{created.requestNumber}</h1>
          <p className="mt-2 text-sm">{created.instructions}</p>
          <p className="mt-2 text-sm">Te enviamos el comprobante por correo.</p>
        </section>
        <Link to={`/account/orders/${order.id}`} className="inline-block text-sm underline">
          Volver al pedido
        </Link>
      </main>
    )
  }

  // CU-15 (flujos 2a/2b/3a): el pedido no admite posventa.
  if (!order.actions.requestReturn.allowed) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <p className="rounded-lg border border-neutral-300 bg-white p-5 text-neutral-700">{order.actions.requestReturn.message}</p>
        <Link to={`/account/orders/${order.id}`} className="inline-block text-sm underline">
          Volver al pedido
        </Link>
      </main>
    )
  }

  // CU-15 (paso 3): sólo los ítems con unidades que todavía se pueden pedir.
  const eligible = order.items.filter((item) => item.eligibleReturnQuantity > 0)
  const deadline = order.actions.requestReturn.deadline

  const onPhotosChange = (input: HTMLInputElement) => {
    const list = Array.from(input.files ?? [])
    const error =
      list.length > MAX_PHOTOS
        ? `Podés adjuntar hasta ${MAX_PHOTOS} fotos.`
        : list.some((f) => !PHOTO_TYPES.includes(f.type))
          ? 'Las fotos tienen que ser JPEG, PNG o WEBP.'
          : list.some((f) => f.size > MAX_PHOTO_BYTES)
            ? 'Cada foto puede pesar hasta 5 MB.'
            : null
    if (error) {
      // Una selección inválida descarta también la anterior: lo que se
      // envía tiene que coincidir con lo que muestra el input (vacío).
      input.value = ''
      setPhotos([])
      setFormError(error)
      return
    }
    setFormError(null)
    setPhotos(list)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // CU-15 (flujo 5a).
    if (!Object.values(quantities).some((q) => q > 0)) return setFormError('Elegí al menos un producto.')
    if (!reason.trim()) return setFormError('Contanos el motivo.')
    setFormError(null)
    submit.mutate()
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <Link to={`/account/orders/${order.id}`} className="text-sm text-neutral-500 underline">
          ← Pedido #{order.orderNumber}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-800">Solicitar cambio o devolución</h1>
        {deadline && <p className="text-sm text-neutral-500">Podés pedirlo hasta el {formatDate(deadline)}.</p>}
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5 text-sm">
        <fieldset className="space-y-2">
          <legend className="font-semibold text-neutral-800">¿Qué productos?</legend>
          {eligible.map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-4">
              <span>
                {item.productName}
                <span className="text-neutral-500">
                  {' '}
                  {item.eligibleReturnQuantity === item.quantity
                    ? `(compraste ${item.quantity})`
                    : `(podés pedir ${item.eligibleReturnQuantity} de ${item.quantity}; el resto ya está en otra solicitud)`}
                </span>
              </span>
              <select
                value={quantities[item.id] ?? 0}
                onChange={(e) => setQuantities({ ...quantities, [item.id]: Number(e.target.value) })}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {Array.from({ length: item.eligibleReturnQuantity + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Ninguno' : n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {eligible.length < order.items.length && (
            <p className="text-xs text-neutral-500">
              Los productos cuyas unidades ya están todas en una solicitud no aparecen en la lista.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-neutral-800">¿Qué necesitás?</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={type === 'devolucion'} onChange={() => setType('devolucion')} />
            Devolución (te reintegramos el dinero)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={type === 'cambio'} onChange={() => setType('cambio')} />
            Cambio (por otro talle, color o una unidad nueva)
          </label>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-neutral-800">Motivo</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={4}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-neutral-800">Fotos (opcional, hasta {MAX_PHOTOS})</span>
          <input type="file" accept={PHOTO_TYPES.join(',')} multiple onChange={(e) => onPhotosChange(e.target)} />
          {photos.length > 0 && <span className="text-xs text-neutral-500">{photos.map((p) => p.name).join(', ')}</span>}
        </label>

        <p className="text-xs text-neutral-500">El costo del envío de la devolución lo cubre la tienda.</p>

        {formError && <p className="text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded bg-neutral-800 px-4 py-2 text-white disabled:opacity-60"
        >
          {submit.isPending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </main>
  )
}
