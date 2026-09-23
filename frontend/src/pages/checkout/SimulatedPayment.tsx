import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fakePaymentService } from '../../services/fake-payment.service'

type Outcome = 'approved' | 'rejected' | 'pending'

const OUTCOMES: { value: Outcome; label: string; className: string }[] = [
  { value: 'approved', label: 'Pagar (aprobado)', className: 'bg-green-700 text-white' },
  { value: 'pending', label: 'Pagar en efectivo (queda pendiente)', className: 'bg-amber-600 text-white' },
  { value: 'rejected', label: 'Pagar (rechazado)', className: 'bg-red-600 text-white' },
]

/**
 * Pasarela de pago simulada (backend con PAYMENT_GATEWAY=fake): reemplaza
 * a la pantalla de MercadoPago en desarrollo. Cada botón dispara en el
 * backend el mismo webhook firmado que mandaría MercadoPago (CU-05) y
 * después vuelve a la página de resultado, como la back_url real.
 */
export function SimulatedPayment() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const preferenceId = params.get('preferenceId') ?? ''

  const preference = useQuery({
    queryKey: ['fake-payment', preferenceId],
    queryFn: () => fakePaymentService.getPreference(preferenceId),
    enabled: !!preferenceId,
    retry: false,
  })

  const pay = useMutation({
    mutationFn: (outcome: Outcome) => fakePaymentService.pay(preferenceId, outcome),
    onSuccess: ({ redirectUrl }) => {
      // La back_url apunta a este mismo frontend: se navega sin recargar la app.
      const url = new URL(redirectUrl)
      navigate(url.pathname + url.search)
    },
  })

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-lg border-2 border-dashed border-sky-400 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Pasarela simulada · modo desarrollo</p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-800">MercadoPago (simulado)</h1>

        {preference.isLoading && <p className="mt-4 text-sm text-neutral-500">Cargando…</p>}
        {preference.isError && (
          <p className="mt-4 text-sm text-red-600">
            No encontramos esta preferencia de pago. Si reiniciaste el backend, la pasarela simulada perdió su estado:
            volvé a hacer el checkout.
          </p>
        )}

        {preference.data && (
          <>
            <ul className="mt-4 divide-y divide-neutral-100 text-sm">
              {preference.data.items.map((item) => (
                <li key={item.id} className="flex justify-between py-2">
                  <span>
                    {item.title} × {item.quantity}
                  </span>
                  <span>${(item.unitPrice * item.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold">
              <span>Total a pagar</span>
              <span>${preference.data.amount}</span>
            </p>

            <div className="mt-6 space-y-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={pay.isPending || pay.isSuccess}
                  onClick={() => pay.mutate(o.value)}
                  className={`w-full rounded py-2 text-sm disabled:opacity-50 ${o.className}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {pay.isError && <p className="mt-3 text-sm text-red-600">No se pudo procesar el pago simulado.</p>}
            <button
              type="button"
              onClick={() => navigate(`/checkout/result?orderId=${preference.data.orderId}`)}
              className="mt-4 text-sm text-neutral-600 underline"
            >
              Volver a la tienda sin pagar
            </button>
          </>
        )}
      </div>
    </main>
  )
}
