import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { formatAttributes, REFUND_ORIGIN_LABELS } from '../../features/admin/admin-labels'
import { AdminCancelOrderDialog } from '../../features/admin/components/AdminCancelOrderDialog'
import { OrderStatusBadge } from '../../features/orders/components/OrderStatusBadge'
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_STATUS_LABELS,
  apiErrorCode,
  apiErrorMessage,
  dayBoundary,
  formatDate,
  formatDateTime,
  formatShippingCost,
} from '../../features/orders/order-labels'
import { adminOrdersService } from '../../services/admin-orders.service'
import type { AdminOrderDetail as Detail, AdminRefund, TrackingInput } from '../../types/admin-orders.types'
import type { OrderStatus } from '../../types/order.types'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
      <h2 className="font-semibold text-neutral-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Borrador de los datos de envío (paso 6); la fecha como la da un `<input type="date">`. */
type TrackingDraft = { carrier: string; number: string; day: string }
const EMPTY_TRACKING: TrackingDraft = { carrier: '', number: '', day: '' }

/** Campos vacíos → no se mandan (el seguimiento es todo opcional, flujo 7b). */
function toTrackingInput(t: TrackingDraft): TrackingInput {
  return {
    ...(t.carrier.trim() ? { carrier: t.carrier.trim() } : {}),
    ...(t.number.trim() ? { number: t.number.trim() } : {}),
    ...(t.day ? { dispatchedAt: dayBoundary(t.day, 'start') } : {}),
  }
}

/** Instante ISO → día local para un `<input type="date">`. */
function toDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Paso 6: transportista, número de seguimiento y fecha de despacho, todos opcionales. */
function TrackingFields({ value, onChange }: { value: TrackingDraft; onChange: (next: TrackingDraft) => void }) {
  const field = 'rounded border border-neutral-300 px-2 py-1.5'
  return (
    <div className="flex flex-wrap gap-2">
      <input
        value={value.carrier}
        onChange={(e) => onChange({ ...value, carrier: e.target.value })}
        placeholder="Transportista (opcional)"
        maxLength={100}
        className={field}
      />
      <input
        value={value.number}
        onChange={(e) => onChange({ ...value, number: e.target.value })}
        placeholder="Número de seguimiento (opcional)"
        maxLength={100}
        className={field}
      />
      <label className="flex items-center gap-2 text-neutral-600">
        Fecha de despacho
        <input type="date" value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })} className={field} />
      </label>
    </div>
  )
}

/**
 * CU-19 Ver y gestionar pedidos (admin), pasos 3-10: detalle completo con
 * lo que el Cliente no ve, cambio de estado, seguimiento, cancelación,
 * notas internas y gestión de los reembolsos que lo requieren (CU-21).
 */
export function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const queryKey = ['admin', 'order', id]
  const [conflict, setConflict] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)

  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => adminOrdersService.get(id!),
    enabled: !!id,
    retry: false,
  })

  /** Tras cada acción: detalle nuevo, y listados y contadores desactualizados. */
  const applied = (next?: Detail) => {
    setConflict(null)
    if (next) queryClient.setQueryData(queryKey, next)
    else void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'summary'] })
  }

  /** Flujo 8a: el estado cambió entre que se vio y se confirmó → informar y refrescar. */
  const failed = (err: unknown, fallback: string) => {
    setConflict(apiErrorMessage(err, fallback))
    if (apiErrorCode(err) === 'ORDER_STATUS_CHANGED') void refetch()
  }

  const cancel = useMutation({
    mutationFn: (input: Parameters<typeof adminOrdersService.cancel>[1]) => adminOrdersService.cancel(id!, input),
    onSuccess: (result) => {
      setShowCancel(false)
      applied(result.order)
    },
    onError: (err) => {
      if (apiErrorCode(err) === 'ORDER_STATUS_CHANGED') {
        setShowCancel(false)
        failed(err, '')
      }
    },
  })

  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-8 text-neutral-600">Cargando pedido…</main>
  if (isError || !order) {
    return (
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-8">
        <p className="text-neutral-700">El pedido no existe o no se pudo cargar.</p>
        <Link to="/admin/orders" className="text-sm underline">
          Volver a pedidos
        </Link>
      </main>
    )
  }

  const address = order.shippingAddress
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div>
        <Link to="/admin/orders" className="text-sm text-neutral-500 underline">
          ← Pedidos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-800">Pedido #{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-neutral-500">
          {formatDateTime(order.createdAt)} · {order.customer.name} ({order.customer.email})
        </p>
      </div>

      {conflict && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{conflict}</p>
      )}

      {order.refunds.some((r) => r.needsAttention) && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Este pedido tiene reembolsos que requieren gestión: revisalos en la sección Pago.
        </p>
      )}

      <Card title="Acciones">
        <div className="space-y-4">
          <StatusChanger order={order} onDone={applied} onError={failed} />
          {order.actions.canCancel && (
            <button type="button" onClick={() => setShowCancel(true)} className="rounded border border-red-300 px-3 py-1.5 text-red-700">
              Cancelar pedido
            </button>
          )}
          {order.actions.transitions.length === 0 && !order.actions.canCancel && (
            <p className="text-neutral-500">Un pedido "{ORDER_STATUS_LABELS[order.status]}" no admite más cambios de estado.</p>
          )}
        </div>
      </Card>

      <Card title="Productos">
        <table className="w-full text-left">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Producto</th>
              <th className="py-1 text-right font-medium">Cantidad</th>
              <th className="py-1 text-right font-medium">Precio</th>
              <th className="py-1 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-neutral-100">
                <td className="py-1.5">
                  {item.productName}
                  {Object.keys(item.variantAttributes).length > 0 && (
                    <span className="block text-xs text-neutral-500">{formatAttributes(item.variantAttributes)}</span>
                  )}
                </td>
                <td className="py-1.5 text-right">{item.quantity}</td>
                <td className="py-1.5 text-right">${item.unitPrice}</td>
                <td className="py-1.5 text-right">${item.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-right">
          <div>
            <dt className="inline text-neutral-500">Subtotal: </dt>
            <dd className="inline">${order.subtotal}</dd>
          </div>
          <div>
            <dt className="inline text-neutral-500">Envío: </dt>
            <dd className="inline">{formatShippingCost(order.shippingCost)}</dd>
          </div>
          <div className="font-semibold">
            <dt className="inline">Total: </dt>
            <dd className="inline">${order.total}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Envío">
          <p className="font-medium text-neutral-800">{order.shippingMethod.name}</p>
          <p className="text-neutral-600">
            {address.street} {address.number}
            {address.floorApt ? ` ${address.floorApt}` : ''}, {address.city}, {address.province} ({address.postalCode})
          </p>
          <p className="text-neutral-600">Tel.: {address.phone}</p>
          <TrackingEditor order={order} onDone={applied} onError={failed} />
        </Card>

        <Card title="Pago">
          <p className="text-neutral-700">Estado: {PAYMENT_STATUS_LABELS[order.paymentStatus]}</p>
          {order.paidAt && <p className="text-neutral-600">Acreditado: {formatDateTime(order.paidAt)}</p>}
          {order.reservationExpiresAt && (
            <p className="text-neutral-600">La reserva vence: {formatDateTime(order.reservationExpiresAt)}</p>
          )}
          {order.payments.length > 0 && (
            <ul className="mt-2 space-y-1 text-neutral-600">
              {order.payments.map((p) => (
                <li key={p.id}>
                  Pago {p.externalPaymentId}: {p.status} · ${p.amount}
                  {p.method ? ` · ${p.method}` : ''}
                  {p.installments && p.installments > 1 ? ` en ${p.installments} cuotas` : ''}
                </li>
              ))}
            </ul>
          )}
          {order.refunds.length > 0 && (
            <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
              {order.refunds.map((refund) => (
                <RefundRow key={refund.id} refund={refund} onDone={() => applied()} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {order.returnRequests.length > 0 && (
        <Card title="Cambios y devoluciones">
          <ul className="space-y-1">
            {order.returnRequests.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/returns/${r.id}`} className="underline">
                  Solicitud #{r.requestNumber}
                </Link>{' '}
                · {r.type === 'cambio' ? 'Cambio' : 'Devolución'} · {r.itemCount} unidad(es) · {RETURN_STATUS_LABELS[r.status]}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Notas internas">
        <p className="mb-3 text-xs text-neutral-500">Sólo las ven los administradores.</p>
        {order.notes.length === 0 && <p className="text-neutral-500">Todavía no hay notas.</p>}
        <ul className="space-y-2">
          {order.notes.map((n) => (
            <li key={n.id} className="rounded bg-neutral-50 px-3 py-2">
              <p className="whitespace-pre-line text-neutral-800">{n.text}</p>
              <p className="text-xs text-neutral-500">
                {n.author?.name ?? 'Sistema'} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        <NoteForm orderId={order.id} onDone={applied} />
      </Card>

      <Card title="Historial">
        <ol className="space-y-1">
          {order.statusHistory.map((h) => (
            <li key={`${h.to}-${h.at}`} className="flex flex-wrap justify-between gap-x-4">
              <span className="text-neutral-700">
                {h.from ? `${ORDER_STATUS_LABELS[h.from]} → ` : ''}
                {ORDER_STATUS_LABELS[h.to]}
                {h.reason && <span className="text-neutral-500"> · {h.reason}</span>}
              </span>
              <span className="text-neutral-500">
                {h.actor?.name ?? 'Sistema'} · {formatDateTime(h.at)}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {showCancel && (
        <AdminCancelOrderDialog
          order={order}
          pending={cancel.isPending}
          error={cancel.isError && apiErrorCode(cancel.error) !== 'ORDER_STATUS_CHANGED' ? apiErrorMessage(cancel.error, 'No se pudo cancelar el pedido.') : null}
          onConfirm={(input) => cancel.mutate({ expectedStatus: order.status, ...input })}
          onClose={() => {
            cancel.reset()
            setShowCancel(false)
          }}
        />
      )}
    </main>
  )
}

interface ActionProps {
  order: Detail
  onDone: (next?: Detail) => void
  onError: (err: unknown, fallback: string) => void
}

/** Pasos 5-8: sólo las transiciones válidas desde el estado actual (flujo 7a). */
function StatusChanger({ order, onDone, onError }: ActionProps) {
  const [to, setTo] = useState<OrderStatus | ''>('')
  const [note, setNote] = useState('')
  const [tracking, setTracking] = useState<TrackingDraft>(EMPTY_TRACKING)

  const change = useMutation({
    mutationFn: () =>
      adminOrdersService.changeStatus(order.id, {
        expectedStatus: order.status,
        to: to as OrderStatus,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(to === 'despachado' ? { tracking: toTrackingInput(tracking) } : {}),
      }),
    onSuccess: (next) => {
      setTo('')
      setNote('')
      setTracking(EMPTY_TRACKING)
      onDone(next)
    },
    onError: (err) => onError(err, 'No se pudo cambiar el estado.'),
  })

  if (order.actions.transitions.length === 0) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (to) change.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Pasar a</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value as OrderStatus | '')}
            className="rounded border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Elegí un estado</option>
            {order.actions.transitions.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-neutral-600">Nota para el historial (opcional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
      </div>
      {/* Paso 6 / flujo 7b: datos de envío opcionales al despachar. */}
      {to === 'despachado' && (
        <div className="space-y-1">
          <TrackingFields value={tracking} onChange={setTracking} />
          <p className="text-xs text-neutral-500">
            Si no los cargás ahora, el Cliente no verá el seguimiento hasta que los registres.
          </p>
        </div>
      )}
      <button type="submit" disabled={!to || change.isPending} className="rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50">
        {change.isPending ? 'Guardando…' : 'Cambiar estado'}
      </button>
    </form>
  )
}

/** Paso 6 / flujo 7b: seguimiento cargado o corregido después del despacho. */
function TrackingEditor({ order, onDone, onError }: ActionProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TrackingDraft>(EMPTY_TRACKING)
  const save = useMutation({
    // Se mandan los tres datos: lo que quede vacío se borra (así se corrige un dato cargado por error).
    mutationFn: () => adminOrdersService.updateTracking(order.id, toTrackingInput(draft)),
    onSuccess: (next) => {
      setEditing(false)
      onDone(next)
    },
    onError: (err) => onError(err, 'No se pudo guardar el seguimiento.'),
  })
  const t = order.tracking

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <p className="font-medium text-neutral-700">Seguimiento</p>
      {t.carrier || t.number || t.dispatchedAt ? (
        <p className="text-neutral-600">
          {t.carrier ?? 'Sin transportista'} · {t.number ?? 'sin número'}
          {t.dispatchedAt && ` · despachado el ${formatDate(t.dispatchedAt)}`}
        </p>
      ) : (
        <p className="text-neutral-500">Sin datos de seguimiento.</p>
      )}
      {order.actions.canEditTracking && !editing && (
        <button
          type="button"
          onClick={() => {
            setDraft({ carrier: t.carrier ?? '', number: t.number ?? '', day: toDay(t.dispatchedAt) })
            setEditing(true)
          }}
          className="mt-1 underline"
        >
          {t.carrier || t.number || t.dispatchedAt ? 'Editar seguimiento' : 'Cargar seguimiento'}
        </button>
      )}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
          className="mt-2 space-y-2"
        >
          <TrackingFields value={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50">
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded border border-neutral-300 px-3 py-1.5">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Alerta de CU-21 (4a/5a): reintentar el reembolso o marcarlo resuelto por fuera, con una nota. */
function RefundRow({ refund, onDone }: { refund: AdminRefund; onDone: () => void }) {
  const [resolving, setResolving] = useState(false)
  const [note, setNote] = useState('')
  const retry = useMutation({ mutationFn: () => adminOrdersService.retryRefund(refund.id), onSuccess: onDone })
  const resolve = useMutation({
    mutationFn: () => adminOrdersService.resolveRefund(refund.id, note.trim()),
    onSuccess: () => {
      setResolving(false)
      onDone()
    },
  })
  const error = retry.error ?? resolve.error

  return (
    <div className={refund.needsAttention ? 'rounded border border-red-200 bg-red-50 p-3' : ''}>
      <p className="font-medium text-neutral-800">
        {REFUND_STATUS_LABELS[refund.status]}: ${refund.amount}
      </p>
      <p className="text-xs text-neutral-500">
        {REFUND_ORIGIN_LABELS[refund.originCu]} · {formatDateTime(refund.createdAt)}
        {refund.resolvedAt && ` · ${refund.status === 'rechazado' ? 'rechazado' : 'resuelto'} ${formatDateTime(refund.resolvedAt)}`}
      </p>
      {refund.lastError && <p className="text-xs text-red-700">Último error: {refund.lastError}</p>}
      {refund.resolutionNote && <p className="text-xs text-neutral-600">Nota: {refund.resolutionNote}</p>}
      {refund.needsAttention && !resolving && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50"
          >
            {retry.isPending ? 'Reintentando…' : 'Reintentar'}
          </button>
          <button type="button" onClick={() => setResolving(true)} className="rounded border border-neutral-300 bg-white px-3 py-1">
            Marcar resuelto por fuera
          </button>
        </div>
      )}
      {resolving && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) resolve.mutate()
          }}
          className="mt-2 space-y-2"
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cómo se devolvió el dinero (p. ej. transferencia del día…)"
            maxLength={1000}
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!note.trim() || resolve.isPending}
              className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setResolving(false)} className="rounded border border-neutral-300 bg-white px-3 py-1">
              Volver
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{apiErrorMessage(error, 'No se pudo completar la acción.')}</p>}
    </div>
  )
}

/** Flujo 5c: nota interna sin cambiar el estado. */
function NoteForm({ orderId, onDone }: { orderId: string; onDone: (next: Detail) => void }) {
  const [text, setText] = useState('')
  const add = useMutation({
    mutationFn: () => adminOrdersService.addNote(orderId, text.trim()),
    onSuccess: (next) => {
      setText('')
      onDone(next)
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) add.mutate()
      }}
      className="mt-3 space-y-2"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Agregar una nota interna…"
        maxLength={2000}
        rows={2}
        className="w-full rounded border border-neutral-300 px-2 py-1.5"
      />
      {add.isError && <p className="text-xs text-red-700">{apiErrorMessage(add.error, 'No se pudo guardar la nota.')}</p>}
      <button type="submit" disabled={!text.trim() || add.isPending} className="rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50">
        Agregar nota
      </button>
    </form>
  )
}
