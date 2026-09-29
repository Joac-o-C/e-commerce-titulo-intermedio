import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { formatAttributes, RETURN_CONDITION_LABELS } from '../../features/admin/admin-labels'
import { RETURN_STATUS_LABELS, apiErrorMessage, formatDate, formatDateTime } from '../../features/orders/order-labels'
import { adminReturnsService } from '../../services/admin-returns.service'
import type { AdminReturnDetail as Detail, ReturnItemCondition } from '../../types/admin-orders.types'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
      <h2 className="font-semibold text-neutral-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const input = 'rounded border border-neutral-300 px-2 py-1.5'
const primary = 'rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50'

/**
 * CU-22 Resolver solicitud de cambio o devolución (admin): revisar la
 * solicitud (paso 2), aprobarla total o parcialmente o rechazarla
 * (pasos 3-7, flujos 3a/4a), registrar la recepción (pasos 8-12, flujos
 * 9a/10a/10b) y despachar la reposición de un cambio.
 */
export function AdminReturnDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const queryKey = ['admin', 'return', id]
  const { data: request, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => adminReturnsService.get(id!),
    enabled: !!id,
    retry: false,
  })

  const applied = (next: Detail) => {
    queryClient.setQueryData(queryKey, next)
    void queryClient.invalidateQueries({ queryKey: ['admin', 'returns'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'summary'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'order', next.order.id] })
  }

  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-neutral-600">Cargando solicitud…</main>
  if (isError || !request) {
    return (
      <main className="mx-auto max-w-4xl space-y-3 px-4 py-8">
        <p className="text-neutral-700">La solicitud no existe o no se pudo cargar.</p>
        <Link to="/admin/returns" className="text-sm underline">
          Volver a la bandeja
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div>
        <Link to="/admin/returns" className="text-sm text-neutral-500 underline">
          ← Cambios y devoluciones
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-800">
          Solicitud #{request.requestNumber} · {request.type === 'cambio' ? 'Cambio' : 'Devolución'}
        </h1>
        <p className="text-sm text-neutral-500">
          {RETURN_STATUS_LABELS[request.status]} · creada {formatDateTime(request.createdAt)} ·{' '}
          <Link to={`/admin/orders/${request.order.id}`} className="underline">
            pedido #{request.order.orderNumber}
          </Link>{' '}
          · {request.customer.name} ({request.customer.email})
        </p>
      </div>

      {/* Flujo 8a. */}
      {request.receptionDeadline && (
        <p
          className={`rounded border px-4 py-2 text-sm ${
            request.receptionOverdue ? 'border-red-200 bg-red-50 text-red-800' : 'border-neutral-200 bg-white text-neutral-700'
          }`}
        >
          {request.receptionOverdue
            ? `El plazo de recepción venció el ${formatDate(request.receptionDeadline)}: la solicitud sigue pendiente de recepción. Sin producto recibido no se reembolsa ni se reingresa stock.`
            : `Aprobada: el producto tiene que llegar hasta el ${formatDate(request.receptionDeadline)}.`}
        </p>
      )}

      <Card title="Solicitud del Cliente">
        <p className="text-neutral-700">Motivo: {request.reason}</p>
        {request.photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {request.photos.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Foto adjunta" className="h-24 w-24 rounded border border-neutral-200 object-cover" />
              </a>
            ))}
          </div>
        )}
        <table className="mt-3 w-full text-left">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Producto</th>
              <th className="py-1 text-right font-medium">Compradas</th>
              <th className="py-1 text-right font-medium">Pedidas</th>
              <th className="py-1 text-right font-medium">Aprobadas</th>
              <th className="py-1 text-right font-medium">Recibidas</th>
            </tr>
          </thead>
          <tbody>
            {request.items.map((item) => (
              <tr key={item.orderItemId} className="border-t border-neutral-100">
                <td className="py-1.5">
                  {item.productName}
                  <span className="block text-xs text-neutral-500">
                    {[formatAttributes(item.variantAttributes), `$${item.unitPrice} c/u`].filter(Boolean).join(' · ')}
                  </span>
                  {item.condition && (
                    <span className="block text-xs text-neutral-500">
                      {RETURN_CONDITION_LABELS[item.condition]}
                      {item.refundApproved !== null && (item.refundApproved ? ' · se reembolsa' : ' · no se reembolsa')}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">{item.purchased}</td>
                <td className="py-1.5 text-right">{item.quantityRequested}</td>
                <td className="py-1.5 text-right">{item.quantityApproved ?? '—'}</td>
                <td className="py-1.5 text-right">{item.quantityReceived ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {request.resolutionNote && <p className="mt-3 text-neutral-700">Respuesta al Cliente: {request.resolutionNote}</p>}
        {request.internalNote && (
          <p className="mt-1 whitespace-pre-line text-neutral-500">Nota interna: {request.internalNote}</p>
        )}
      </Card>

      {request.actions.canApproveOrReject && <ApproveOrReject request={request} onDone={applied} />}
      {request.actions.canReceive && <Receive request={request} onDone={applied} />}

      {request.replacements.length > 0 && (
        <Card title="Reposición">
          <ul className="space-y-1">
            {request.replacements.map((r) => (
              <li key={r.id}>
                {r.productName}
                {Object.keys(r.variantAttributes).length > 0 && ` (${formatAttributes(r.variantAttributes)})`} ×{r.quantity} ·{' '}
                {r.status === 'despachado'
                  ? `despachada${r.tracking.carrier ? ` por ${r.tracking.carrier}` : ''}${
                      r.tracking.number ? `, seguimiento ${r.tracking.number}` : ''
                    }${r.tracking.dispatchedAt ? ` (${formatDateTime(r.tracking.dispatchedAt)})` : ''}`
                  : 'pendiente de despacho'}
              </li>
            ))}
          </ul>
          {request.actions.canDispatchReplacement && <DispatchReplacement request={request} onDone={applied} />}
        </Card>
      )}
    </main>
  )
}

interface ActionProps {
  request: Detail
  onDone: (next: Detail) => void
}

/** Pasos 3-7 (aprobación total o parcial, flujo 4a) y flujo 3a (rechazo). */
function ApproveOrReject({ request, onDone }: ActionProps) {
  const [approved, setApproved] = useState<Record<string, number>>(
    Object.fromEntries(request.items.map((i) => [i.orderItemId, i.quantityRequested])),
  )
  const [internalNote, setInternalNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const partial = request.items.some((i) => approved[i.orderItemId] < i.quantityRequested)
  const noneApproved = request.items.every((i) => approved[i.orderItemId] === 0)

  const approve = useMutation({
    mutationFn: () =>
      adminReturnsService.approve(request.id, {
        items: request.items.map((i) => ({ orderItemId: i.orderItemId, quantityApproved: approved[i.orderItemId] })),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        ...(partial ? { rejectionReason: rejectionReason.trim() } : {}),
      }),
    onSuccess: onDone,
  })
  const reject = useMutation({ mutationFn: () => adminReturnsService.reject(request.id, rejectReason.trim()), onSuccess: onDone })

  const submitApprove = (e: FormEvent) => {
    e.preventDefault()
    if (!noneApproved && (!partial || rejectionReason.trim())) approve.mutate()
  }

  if (rejecting) {
    return (
      <Card title="Rechazar la solicitud">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (rejectReason.trim()) reject.mutate()
          }}
          className="space-y-2"
        >
          <p className="text-neutral-500">No se toca el stock ni el pago; el pedido sigue "entregado". El Cliente recibe el motivo por correo.</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo del rechazo (lo ve el Cliente)"
            maxLength={1000}
            rows={3}
            className={`w-full ${input}`}
          />
          {reject.isError && <p className="text-red-700">{apiErrorMessage(reject.error, 'No se pudo rechazar.')}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={!rejectReason.trim() || reject.isPending} className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-50">
              Rechazar
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="rounded border border-neutral-300 px-3 py-1.5">
              Volver
            </button>
          </div>
        </form>
      </Card>
    )
  }

  return (
    <Card title="Resolver">
      <form onSubmit={submitApprove} className="space-y-3">
        <p className="text-neutral-500">Unidades que se aprueban de cada producto:</p>
        {request.items.map((item) => (
          <label key={item.orderItemId} className="flex items-center justify-between gap-4">
            <span>
              {item.productName}
              {Object.keys(item.variantAttributes).length > 0 && (
                <span className="text-neutral-500"> ({formatAttributes(item.variantAttributes)})</span>
              )}
            </span>
            <select
              value={approved[item.orderItemId]}
              onChange={(e) => setApproved({ ...approved, [item.orderItemId]: Number(e.target.value) })}
              className={input}
            >
              {Array.from({ length: item.quantityRequested + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n} de {item.quantityRequested}
                </option>
              ))}
            </select>
          </label>
        ))}
        {/* Flujo 4a: el resto queda rechazado con su motivo. */}
        {partial && !noneApproved && (
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600">Motivo de lo que no se aprueba (lo ve el Cliente)</span>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} maxLength={1000} rows={2} className={input} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Nota interna (opcional, sólo administradores)</span>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} rows={2} className={input} />
        </label>
        {noneApproved && <p className="text-amber-700">No aprobaste ninguna unidad: para eso, rechazá la solicitud.</p>}
        {approve.isError && <p className="text-red-700">{apiErrorMessage(approve.error, 'No se pudo aprobar.')}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={noneApproved || (partial && !rejectionReason.trim()) || approve.isPending}
            className={primary}
          >
            {partial ? 'Aprobar parcialmente' : 'Aprobar'}
          </button>
          <button type="button" onClick={() => setRejecting(true)} className="rounded border border-red-300 px-3 py-1.5 text-red-700">
            Rechazar
          </button>
        </div>
        <p className="text-xs text-neutral-500">Al aprobar, el Cliente recibe por correo las instrucciones de envío y el plazo de recepción.</p>
      </form>
    </Card>
  )
}

interface ReceivedDraft {
  quantity: number
  condition: ReturnItemCondition
  refund: boolean
  variantId: string
}

/** Pasos 8-12: una sola recepción (decisión de la Fase 6), flujos 9a/10a/10b. */
function Receive({ request, onDone }: ActionProps) {
  const exchange = request.type === 'cambio'
  const approvedItems = request.items.filter((i) => (i.quantityApproved ?? 0) > 0)
  const [draft, setDraft] = useState<Record<string, ReceivedDraft>>(
    Object.fromEntries(
      approvedItems.map((i) => [i.orderItemId, { quantity: i.quantityApproved ?? 0, condition: 'ok', refund: false, variantId: '' }]),
    ),
  )
  const [internalNote, setInternalNote] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const update = (itemId: string, patch: Partial<ReceivedDraft>) => setDraft({ ...draft, [itemId]: { ...draft[itemId], ...patch } })

  const receivedAny = approvedItems.some((i) => draft[i.orderItemId].quantity > 0)
  const missingVariant = exchange && approvedItems.some((i) => draft[i.orderItemId].quantity > 0 && !draft[i.orderItemId].variantId)
  // Paso 10: sólo productos, sin envío (decisión de la Fase 6); dañado, a criterio del admin (9a).
  const refundTotal = exchange
    ? 0
    : approvedItems.reduce((sum, i) => {
        const d = draft[i.orderItemId]
        return d.condition === 'ok' || d.refund ? sum + Number(i.unitPrice) * d.quantity : sum
      }, 0)

  const receive = useMutation({
    mutationFn: () =>
      adminReturnsService.receive(request.id, {
        items: approvedItems.map((i) => {
          const d = draft[i.orderItemId]
          return {
            orderItemId: i.orderItemId,
            quantityReceived: d.quantity,
            condition: d.condition,
            ...(!exchange && d.condition === 'danado' ? { refund: d.refund } : {}),
            ...(exchange && d.quantity > 0 ? { replacementVariantId: d.variantId } : {}),
          }
        }),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      }),
    onSuccess: onDone,
  })

  return (
    <Card title="Registrar la recepción">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (receivedAny && !missingVariant) receive.mutate()
        }}
        className="space-y-4"
      >
        {approvedItems.map((item) => {
          const d = draft[item.orderItemId]
          return (
            <fieldset key={item.orderItemId} className="space-y-2 rounded border border-neutral-100 p-3">
              <legend className="px-1 font-medium text-neutral-800">
                {item.productName}
                {Object.keys(item.variantAttributes).length > 0 && (
                  <span className="font-normal text-neutral-500"> ({formatAttributes(item.variantAttributes)})</span>
                )}
              </legend>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  Recibidas
                  <select value={d.quantity} onChange={(e) => update(item.orderItemId, { quantity: Number(e.target.value) })} className={input}>
                    {Array.from({ length: (item.quantityApproved ?? 0) + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n} de {item.quantityApproved}
                      </option>
                    ))}
                  </select>
                </label>
                {d.quantity > 0 && (
                  <label className="flex items-center gap-2">
                    Estado
                    <select
                      value={d.condition}
                      onChange={(e) => update(item.orderItemId, { condition: e.target.value as ReturnItemCondition })}
                      className={input}
                    >
                      {Object.entries(RETURN_CONDITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {d.quantity > 0 && d.condition === 'danado' && (
                <p className="text-xs text-neutral-500">No vuelve al stock vendible: se registra como devolución + merma.</p>
              )}
              {/* Flujo 9a: dañado, el reembolso queda a criterio del Administrador. */}
              {!exchange && d.quantity > 0 && d.condition === 'danado' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={d.refund} onChange={(e) => update(item.orderItemId, { refund: e.target.checked })} />
                  Reembolsar igual estas unidades
                </label>
              )}
              {/* Flujo 10a: variante de reposición del mismo producto. */}
              {exchange && d.quantity > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-neutral-600">Variante de reposición</span>
                  <select value={d.variantId} onChange={(e) => update(item.orderItemId, { variantId: e.target.value })} className={input}>
                    <option value="">Elegí una variante</option>
                    {item.replacementOptions.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.stockAvailable < d.quantity}>
                        {formatAttributes(v.attributes)} — {v.stockAvailable} disponibles
                      </option>
                    ))}
                  </select>
                  {item.replacementOptions.length === 0 && (
                    <span className="text-xs text-amber-700">El producto no tiene variantes activas para reponer.</span>
                  )}
                </label>
              )}
            </fieldset>
          )
        })}

        {!exchange && (
          <p className="text-neutral-700">
            Reembolso a iniciar: <strong>${refundTotal.toFixed(2)}</strong> <span className="text-neutral-500">(sólo productos, sin envío)</span>
          </p>
        )}
        {exchange && <p className="text-neutral-700">Cambio: no hay reembolso; la reposición queda pendiente de despacho.</p>}

        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Nota para el Cliente (opcional)</span>
          <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} maxLength={1000} rows={2} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600">Nota interna (opcional, p. ej. novedades de la recepción)</span>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} rows={2} className={input} />
        </label>
        {!receivedAny && <p className="text-amber-700">Si todavía no llegó nada, la solicitud sigue aprobada: no registres la recepción.</p>}
        {receive.isError && <p className="text-red-700">{apiErrorMessage(receive.error, 'No se pudo registrar la recepción.')}</p>}
        <button type="submit" disabled={!receivedAny || missingVariant || receive.isPending} className={primary}>
          {receive.isPending ? 'Registrando…' : 'Registrar recepción y resolver'}
        </button>
      </form>
    </Card>
  )
}

/** Flujo 10a: despacho de la reposición, con seguimiento opcional. */
function DispatchReplacement({ request, onDone }: ActionProps) {
  const [carrier, setCarrier] = useState('')
  const [number, setNumber] = useState('')
  const dispatch = useMutation({
    mutationFn: () =>
      adminReturnsService.dispatchReplacement(request.id, {
        ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        ...(number.trim() ? { number: number.trim() } : {}),
      }),
    onSuccess: onDone,
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        dispatch.mutate()
      }}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3"
    >
      <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Transportista (opcional)" maxLength={100} className={input} />
      <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Seguimiento (opcional)" maxLength={100} className={input} />
      <button type="submit" disabled={dispatch.isPending} className={primary}>
        Marcar despachada
      </button>
      {dispatch.isError && <p className="w-full text-red-700">{apiErrorMessage(dispatch.error, 'No se pudo registrar el despacho.')}</p>}
      <p className="w-full text-xs text-neutral-500">El Cliente lo ve en su pedido y recibe un correo.</p>
    </form>
  )
}
