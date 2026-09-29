import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useFakeGatewayEnabled } from '../../features/admin/useAdminSummary'
import { apiErrorMessage } from '../../features/orders/order-labels'
import { fakePaymentService } from '../../services/fake-payment.service'

type Outcome = 'approved' | 'rejected'

function OrderLink({ order }: { order: { id: string; orderNumber: number | null } | null }) {
  if (!order) return <span className="text-neutral-500">sin pedido</span>
  return (
    <Link to={`/admin/orders/${order.id}`} className="underline">
      Pedido #{order.orderNumber ?? '?'}
    </Link>
  )
}

/**
 * Pantalla "Pasarela simulada" (decisión de la Fase 6), sólo con
 * PAYMENT_GATEWAY=fake: hace a mano lo que en MercadoPago pasaría solo
 * más tarde — acreditar o rechazar un pago pendiente (efectivo) y un
 * reembolso en proceso (CU-21 pasos 7-9). Cada acción dispara el mismo
 * webhook firmado que mandaría la pasarela real.
 */
export function AdminFakeGateway() {
  const enabled = useFakeGatewayEnabled()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fake-gateway', 'pending'],
    queryFn: fakePaymentService.pending,
    enabled,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['fake-gateway', 'pending'] })
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const settlePayment = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: Outcome }) => fakePaymentService.settlePayment(id, outcome),
    onSettled: refresh,
  })
  const settleRefund = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: Outcome }) => fakePaymentService.settleRefund(id, outcome),
    onSettled: refresh,
  })
  const actionError = settlePayment.error ?? settleRefund.error
  const busy = settlePayment.isPending || settleRefund.isPending

  if (!enabled) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 text-neutral-600">
        La pasarela simulada no está activa (el backend usa MercadoPago).
      </main>
    )
  }

  const buttons = (onClick: (outcome: Outcome) => void) => (
    <span className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => onClick('approved')} className="rounded bg-green-700 px-3 py-1 text-white disabled:opacity-50">
        Aprobar
      </button>
      <button type="button" disabled={busy} onClick={() => onClick('rejected')} className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50">
        Rechazar
      </button>
    </span>
  )

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8 text-sm">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">Pasarela simulada</h1>
        <p className="text-neutral-500">
          Lo que en MercadoPago se resolvería solo. El estado vive en memoria del backend: al reiniciarlo se pierde lo pendiente.
        </p>
      </div>

      {isLoading && <p className="text-neutral-600">Cargando…</p>}
      {isError && <p className="text-red-600">{apiErrorMessage(error, 'No se pudo consultar la pasarela simulada.')}</p>}
      {actionError && <p className="text-red-600">{apiErrorMessage(actionError, 'No se pudo completar la acción.')}</p>}

      {data && (
        <>
          <section className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold text-neutral-800">Pagos pendientes de acreditación</h2>
            {data.payments.length === 0 ? (
              <p className="mt-2 text-neutral-500">No hay pagos pendientes.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>
                      Pago {p.id} · ${p.amount} · <OrderLink order={p.order} />
                    </span>
                    {buttons((outcome) => settlePayment.mutate({ id: p.id, outcome }))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold text-neutral-800">Reembolsos en proceso</h2>
            {data.refunds.length === 0 ? (
              <p className="mt-2 text-neutral-500">No hay reembolsos en proceso.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {data.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>
                      Reembolso ${r.amount} del pago {r.paymentId} · <OrderLink order={r.order} />
                    </span>
                    {buttons((outcome) => settleRefund.mutate({ id: r.id, outcome }))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
