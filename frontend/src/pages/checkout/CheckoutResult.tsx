import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersService } from '../../services/orders.service'
import type { OrderStatus } from '../../types/order.types'

const POLL_MS = 5000
/** ~2 minutos: después, el resultado lo trae el correo (CU-05 paso 9) o recargar la página. */
const MAX_POLLS = 24

const MESSAGES: Partial<Record<OrderStatus, { title: string; body: string; tone: string }>> = {
  pagado: {
    title: '¡Pago aprobado!',
    body: 'Recibimos tu pago y tu pedido ya está confirmado. Te enviamos el detalle por correo.',
    tone: 'border-green-300 bg-green-50 text-green-900',
  },
  pago_pendiente_acreditacion: {
    title: 'Pago pendiente de acreditación',
    body: 'Tu pago se registró pero todavía no se acreditó (por ejemplo, un pago en efectivo). Mantenemos tu stock reservado y te avisamos por correo cuando se acredite.',
    tone: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  pago_rechazado: {
    title: 'El pago fue rechazado',
    body: 'MercadoPago no aprobó el pago, así que liberamos el stock que teníamos reservado para este pedido.',
    tone: 'border-red-300 bg-red-50 text-red-900',
  },
  pendiente_pago: {
    title: 'Esperando la confirmación del pago',
    body: 'Todavía no recibimos la confirmación de MercadoPago. Si ya pagaste, puede demorar unos minutos; si no, el pedido queda reservado por 24 horas.',
    tone: 'border-neutral-300 bg-neutral-50 text-neutral-800',
  },
  cancelado: {
    title: 'Pedido cancelado',
    body: 'Este pedido se canceló (por ejemplo, porque venció la reserva sin pago).',
    tone: 'border-neutral-300 bg-neutral-50 text-neutral-800',
  },
}

/**
 * Página de retorno de la pasarela (CU-05 paso 11). Pantalla informativa:
 * nunca toma el resultado de los parámetros de la URL (`status`,
 * `payment_id` los pone la pasarela y se pueden manipular). Pide al
 * backend reconciliar contra la pasarela y muestra el estado real del
 * pedido; si el pago todavía no llegó, vuelve a reconciliar cada pocos
 * segundos mientras siga "pendiente de pago".
 */
export function CheckoutResult() {
  const [params] = useSearchParams()
  const orderId = params.get('orderId') ?? ''
  const queryClient = useQueryClient()

  useEffect(() => {
    // El carrito de este pedido quedó asociado: el header debe mostrar el nuevo.
    void queryClient.invalidateQueries({ queryKey: ['cart'] })
  }, [queryClient])

  // Cada consulta pide al backend reconciliar contra la pasarela (no sólo
  // leer la base): sin webhook (sandbox sin túnel) es la única forma de
  // enterarse del pago. Mientras el pedido siga esperando el primer
  // resultado se reintenta, con tope para no consultar indefinidamente.
  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersService.syncPayment(orderId),
    enabled: !!orderId,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === 'pendiente_pago' && query.state.dataUpdateCount < MAX_POLLS ? POLL_MS : false,
  })

  if (!orderId) {
    return <main className="px-4 py-16 text-center text-neutral-600">No encontramos el pedido.</main>
  }
  if (order.isLoading) {
    return <main className="px-4 py-16 text-center text-neutral-600">Consultando el estado de tu pago…</main>
  }
  if (order.isError || !order.data) {
    return <main className="px-4 py-16 text-center text-red-600">No pudimos consultar el pedido.</main>
  }

  const message = MESSAGES[order.data.status]

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      {message ? (
        <section className={`rounded-lg border p-5 ${message.tone}`}>
          <h1 className="text-xl font-semibold">{message.title}</h1>
          <p className="mt-2 text-sm">{message.body}</p>
        </section>
      ) : (
        <h1 className="text-xl font-semibold text-neutral-800">Estado del pedido: {order.data.status}</h1>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
        <p className="text-neutral-500">Pedido #{order.data.id.slice(0, 8)}</p>
        <ul className="mt-3 divide-y divide-neutral-100">
          {order.data.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2">
              <span>
                {item.productName} × {item.quantity}
              </span>
              <span>${item.subtotal}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-neutral-200 pt-3">
          <div className="flex justify-between">
            <dt className="text-neutral-600">Envío ({order.data.shippingMethod.name})</dt>
            <dd>${order.data.shippingCost}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd>${order.data.total}</dd>
          </div>
        </dl>
        <p className="mt-3 text-neutral-600">
          Envío a {order.data.shippingAddress.street} {order.data.shippingAddress.number}, {order.data.shippingAddress.city}
        </p>
      </section>

      <Link to="/" className="inline-block text-sm underline">
        Seguir comprando
      </Link>
    </main>
  )
}
