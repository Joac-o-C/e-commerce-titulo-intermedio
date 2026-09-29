import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CancelOrderDialog } from '../../features/orders/components/CancelOrderDialog'
import { OrderStatusBadge } from '../../features/orders/components/OrderStatusBadge'
import { useOrderDetail } from '../../features/orders/hooks/useOrderDetail'
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_STATUS_LABELS,
  apiErrorCode,
  apiErrorMessage,
  formatDate,
  formatDateTime,
} from '../../features/orders/order-labels'
import { ordersService } from '../../services/orders.service'
import type { CheckoutProblem, OrderDetail as OrderDetailData } from '../../types/order.types'

function describeProblem(p: CheckoutProblem): string {
  switch (p.type) {
    case 'unavailable':
      return `${p.productName} ya no está disponible.`
    case 'price_changed':
      return `${p.productName} cambió de precio ($${p.from} → $${p.to}).`
    case 'insufficient_stock':
      return `${p.productName} ya no tiene stock suficiente.`
    case 'total_changed':
      return `El total cambió de $${p.expected} a $${p.actual}.`
  }
}

/**
 * CU-13 Ver mis pedidos (detalle, pasos 5-8) y las acciones que se
 * disparan desde acá: reintentar el pago (flujo 7b), cancelar (CU-14) y
 * solicitar un cambio o una devolución (CU-15). Qué acción se ofrece lo
 * decide el backend (`actions`), con las mismas reglas con que valida.
 */
export function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrderDetail(id)

  const [showCancel, setShowCancel] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string; details?: string[] } | null>(null)

  const setOrder = (next: OrderDetailData) => {
    queryClient.setQueryData(['order', next.id], next)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  // CU-13 (flujo 6a): pedirle a la pasarela el estado real del pago.
  const syncPayment = useMutation({
    mutationFn: () => ordersService.syncPayment(id!),
    onSuccess: setOrder,
  })

  // CU-13 (flujo 7b).
  const retryPayment = useMutation({
    mutationFn: () => ordersService.retryPayment(id!),
    onSuccess: ({ redirectUrl }) => {
      window.location.href = redirectUrl
    },
    onError: (err) => {
      const problems = (err as { response?: { data?: { problems?: CheckoutProblem[] } } })?.response?.data?.problems
      setNotice({
        tone: 'error',
        text: apiErrorMessage(err, 'No pudimos iniciar el pago. Probá de nuevo en unos minutos.'),
        details: problems?.map(describeProblem),
      })
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  // CU-14.
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      ordersService.cancel(id!, { expectedStatus: order!.status, ...(reason ? { reason } : {}) }),
    onSuccess: ({ refundRequested, order: updated }) => {
      setShowCancel(false)
      setOrder(updated)
      setNotice({
        tone: 'ok',
        text: refundRequested
          ? 'Cancelamos tu pedido e iniciamos el reembolso. Te avisamos por correo cuando se acredite.'
          : 'Cancelamos tu pedido. Te enviamos la confirmación por correo.',
      })
    },
    onError: (err) => {
      setShowCancel(false)
      // CU-14 (flujo 5a): el estado cambió mientras el Cliente miraba; se
      // muestra el nuevo antes de que vuelva a intentar.
      if (apiErrorCode(err) === 'ORDER_STATUS_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['order', id] })
      }
      setNotice({ tone: 'error', text: apiErrorMessage(err, 'No pudimos cancelar el pedido.') })
    },
  })

  if (isLoading) return <main className="px-4 py-16 text-center text-neutral-600">Cargando el pedido…</main>
  if (isError || !order) {
    // CU-13 (flujo 5a).
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-neutral-700">Pedido no disponible.</p>
        <Link to="/account/orders" className="mt-3 inline-block text-sm underline">
          Volver a mis pedidos
        </Link>
      </main>
    )
  }

  const { actions } = order
  const address = order.shippingAddress

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/account/orders" className="text-sm text-neutral-500 underline">
            ← Mis pedidos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-800">Pedido #{order.orderNumber}</h1>
          <p className="text-sm text-neutral-500">Realizado el {formatDateTime(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {notice && (
        <section
          className={`rounded-lg border p-4 text-sm ${
            notice.tone === 'ok' ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <p>{notice.text}</p>
          {notice.details && notice.details.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {notice.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* CU-13 (paso 7 / flujo 7a): acciones según el estado. */}
      <section className="flex flex-wrap gap-3">
        {actions.retryPayment.allowed && (
          <button
            type="button"
            onClick={() => retryPayment.mutate()}
            disabled={retryPayment.isPending}
            className="rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {retryPayment.isPending ? 'Redirigiendo a MercadoPago…' : 'Reintentar el pago'}
          </button>
        )}
        {actions.requestReturn.allowed && (
          <Link
            to={`/account/orders/${order.id}/return`}
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm"
          >
            Solicitar cambio o devolución
          </Link>
        )}
        {actions.cancel.allowed && (
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700"
          >
            Cancelar pedido
          </button>
        )}
      </section>
      {/* CU-14 (flujos 2a/2c): por qué ya no puede cancelar por su cuenta, sólo si es informativo. */}
      {!actions.cancel.allowed && actions.cancel.code === 'CANCEL_WINDOW_EXPIRED' && (
        <p className="text-sm text-neutral-600">{actions.cancel.message}</p>
      )}
      {!actions.requestReturn.allowed && order.status === 'entregado' && (
        <p className="text-sm text-neutral-600">{actions.requestReturn.message}</p>
      )}
      {actions.retryPayment.allowed && actions.retryPayment.deadline && (
        <p className="text-sm text-neutral-600">
          Tenés hasta el {formatDateTime(actions.retryPayment.deadline)} para pagar; después el pedido se cancela y liberamos
          los productos.
        </p>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-neutral-800">Productos</h2>
        <ul className="mt-3 divide-y divide-neutral-100">
          {order.items.map((item) => {
            const attributes = Object.values(item.variantAttributes ?? {})
            return (
              <li key={item.id} className="flex justify-between gap-4 py-2">
                <span>
                  {item.productName}
                  {attributes.length > 0 && <span className="text-neutral-500"> ({attributes.join(' / ')})</span>}
                  <span className="text-neutral-500">
                    {' '}
                    · {item.quantity} × ${item.unitPrice}
                  </span>
                </span>
                <span>${item.subtotal}</span>
              </li>
            )
          })}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-neutral-200 pt-3">
          <div className="flex justify-between">
            <dt className="text-neutral-600">Subtotal</dt>
            <dd>${order.subtotal}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-600">Envío ({order.shippingMethod.name})</dt>
            <dd>${order.shippingCost}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd>${order.total}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-neutral-800">Envío</h2>
          <p className="mt-2 text-neutral-700">
            {address.street} {address.number}
            {address.floorApt ? `, ${address.floorApt}` : ''}
          </p>
          <p className="text-neutral-700">
            {address.city}, {address.province} ({address.postalCode})
          </p>
          <p className="text-neutral-500">Tel. {address.phone}</p>
          <p className="mt-2 text-neutral-600">Método: {order.shippingMethod.name}</p>
          {/* CU-13 (paso 6): seguimiento sólo si el Administrador lo cargó. */}
          {order.tracking && (
            <div className="mt-2 text-neutral-600">
              {order.tracking.carrier && <p>Transportista: {order.tracking.carrier}</p>}
              {order.tracking.number && <p>Seguimiento: {order.tracking.number}</p>}
              {order.tracking.dispatchedAt && <p>Despachado el {formatDate(order.tracking.dispatchedAt)}</p>}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-neutral-800">Pago</h2>
          <p className="mt-2 text-neutral-700">Estado: {PAYMENT_STATUS_LABELS[order.payment.status]}</p>
          {order.payment.method && (
            <p className="text-neutral-600">
              Medio: {order.payment.method}
              {order.payment.installments && order.payment.installments > 1 ? ` en ${order.payment.installments} cuotas` : ''}
            </p>
          )}
          {order.refunds.map((refund) => (
            <p key={refund.id} className="mt-1 text-neutral-600">
              {REFUND_STATUS_LABELS[refund.status]}: ${refund.amount}
            </p>
          ))}
          {/* CU-13 (flujo 6a). */}
          {order.payment.mayBeOutdated && (
            <div className="mt-3 text-neutral-500">
              <p>Si ya pagaste, el pago puede demorar unos minutos en reflejarse.</p>
              <button
                type="button"
                onClick={() => syncPayment.mutate()}
                disabled={syncPayment.isPending}
                className="mt-1 underline disabled:opacity-60"
              >
                {syncPayment.isPending ? 'Consultando…' : 'Actualizar estado del pago'}
              </button>
            </div>
          )}
        </section>
      </div>

      {order.returnRequests.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-neutral-800">Cambios y devoluciones</h2>
          <ul className="mt-3 space-y-3">
            {order.returnRequests.map((request) => (
              <li key={request.id} className="rounded border border-neutral-100 p-3">
                <p className="font-medium text-neutral-800">
                  Solicitud #{request.requestNumber} · {request.type === 'cambio' ? 'Cambio' : 'Devolución'} ·{' '}
                  {RETURN_STATUS_LABELS[request.status]}
                </p>
                <ul className="text-neutral-600">
                  {request.items.map((i) => (
                    <li key={i.orderItemId}>
                      {i.productName} ×{i.quantityRequested}
                      {/* CU-22 (paso 5, flujo 4a): aprobación parcial y lo recibido. */}
                      {i.quantityApproved !== null && i.quantityApproved !== i.quantityRequested && (
                        <span className="text-neutral-500"> · aprobadas {i.quantityApproved}</span>
                      )}
                      {i.quantityReceived !== null && <span className="text-neutral-500"> · recibidas {i.quantityReceived}</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-neutral-500">Motivo: {request.reason}</p>
                {request.photos.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {request.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="Foto adjunta" className="h-16 w-16 rounded border border-neutral-200 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {request.resolutionNote && <p className="text-neutral-600">Respuesta: {request.resolutionNote}</p>}
                {/* CU-22 (flujo 10a): la reposición del cambio, con su seguimiento. */}
                {request.replacements.map((r, index) => (
                  <p key={index} className="text-neutral-600">
                    Reposición: {r.productName}
                    {Object.keys(r.variantAttributes).length > 0 && ` (${Object.values(r.variantAttributes).join(' / ')})`} ×
                    {r.quantity} ·{' '}
                    {r.status === 'despachado'
                      ? `despachada${r.tracking?.carrier ? ` por ${r.tracking.carrier}` : ''}${
                          r.tracking?.number ? `, seguimiento ${r.tracking.number}` : ''
                        }`
                      : 'pendiente de despacho'}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-neutral-800">Historial</h2>
        <ol className="mt-3 space-y-1">
          {order.statusHistory.map((entry) => (
            <li key={`${entry.to}-${entry.at}`} className="flex justify-between gap-4">
              <span className="text-neutral-700">{ORDER_STATUS_LABELS[entry.to]}</span>
              <span className="text-neutral-500">{formatDateTime(entry.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {showCancel && (
        <CancelOrderDialog
          order={order}
          pending={cancel.isPending}
          onConfirm={(reason) => cancel.mutate(reason)}
          onClose={() => setShowCancel(false)}
        />
      )}
    </main>
  )
}
