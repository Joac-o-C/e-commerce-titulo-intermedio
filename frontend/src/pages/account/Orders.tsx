import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OrderStatusBadge } from '../../features/orders/components/OrderStatusBadge'
import { useMyOrders } from '../../features/orders/hooks/useMyOrders'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDate } from '../../features/orders/order-labels'
import type { OrderListFilters, OrderStatus } from '../../types/order.types'

/** Tope de la columna `order_number` (int4). */
const MAX_ORDER_NUMBER = 2147483647

/** Día elegido en un `<input type="date">` → instante ISO de su comienzo o fin, en la zona del Cliente. */
function dayBoundary(day: string, edge: 'start' | 'end'): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59, 999)
  return date.toISOString()
}

/**
 * CU-13 Ver mis pedidos (listado). Los filtros viven en la URL para que
 * "volver a la lista" desde el detalle (paso 8) conserve la búsqueda.
 */
export function Orders() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? '1') || 1
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const fromDay = params.get('from') ?? ''
  const toDay = params.get('to') ?? ''
  const number = params.get('number') ?? ''

  // Un número que no puede existir (no entero, o fuera del rango de la
  // columna) no se consulta: directamente no coincide ningún pedido.
  const numberIsValid = /^\d+$/.test(number) && Number(number) >= 1 && Number(number) <= MAX_ORDER_NUMBER
  const impossibleNumber = number !== '' && !numberIsValid

  const filters: OrderListFilters = {
    page,
    ...(status ? { status } : {}),
    ...(fromDay ? { from: dayBoundary(fromDay, 'start') } : {}),
    ...(toDay ? { to: dayBoundary(toDay, 'end') } : {}),
    ...(numberIsValid ? { number: Number(number) } : {}),
  }
  const hasFilters = !!(status || fromDay || toDay || number)
  const query = useMyOrders(filters, !impossibleNumber)
  const { isLoading, isError, isFetching } = query
  const data = impossibleNumber
    ? { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }
    : query.data

  const goToPage = (next: number) => {
    const copy = new URLSearchParams(params)
    copy.set('page', String(next))
    setParams(copy)
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-800">Mis pedidos</h1>

      {/* CU-13 (flujo 3a). La key lo reinicia cuando la URL cambia sin desmontar la página (link del header, atrás/adelante). */}
      <OrderFilters
        key={`${status}|${fromDay}|${toDay}|${number}`}
        initial={{ status, from: fromDay, to: toDay, number }}
        onApply={setParams}
      />

      {isLoading && <p className="text-neutral-600">Cargando tus pedidos…</p>}
      {isError && <p className="text-red-600">No pudimos cargar tus pedidos. Probá de nuevo en unos minutos.</p>}

      {data && data.items.length === 0 && (
        <section className="rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
          {hasFilters ? (
            <p className="text-neutral-600">Ningún pedido coincide con la búsqueda.</p>
          ) : (
            // CU-13 (flujo 2a): estado vacío con enlace al catálogo.
            <>
              <p className="text-neutral-600">Todavía no hiciste ningún pedido.</p>
              <Link to="/" className="mt-3 inline-block text-sm underline">
                Ir al catálogo
              </Link>
            </>
          )}
        </section>
      )}

      {data && data.items.length > 0 && (
        <section className={`space-y-3 ${isFetching ? 'opacity-60' : ''}`}>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {data.items.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/account/orders/${order.id}`}
                  className="grid grid-cols-2 gap-2 px-4 py-3 text-sm hover:bg-neutral-50 sm:grid-cols-5 sm:items-center"
                >
                  <span className="font-medium text-neutral-800">Pedido #{order.orderNumber}</span>
                  <span className="text-neutral-600">{formatDate(order.createdAt)}</span>
                  <span className="text-neutral-600">
                    {order.itemCount} {order.itemCount === 1 ? 'producto' : 'productos'} · ${order.total}
                  </span>
                  <span className="text-neutral-600">Pago: {PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                  <span className="sm:text-right">
                    <OrderStatusBadge status={order.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data.totalPages > 1 && (
            <nav className="flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-neutral-600">
                Página {data.page} de {data.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => goToPage(page + 1)}
                className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
              >
                Siguiente
              </button>
            </nav>
          )}
        </section>
      )}
    </main>
  )
}

interface FilterValues {
  status: OrderStatus | ''
  from: string
  to: string
  number: string
}

/** CU-13 (flujo 3a): filtros por estado, fechas y número de pedido. Se aplican al buscar, no al tipear. */
function OrderFilters({ initial, onApply }: { initial: FilterValues; onApply: (params: URLSearchParams) => void }) {
  const [draft, setDraft] = useState(initial)
  const hasFilters = !!(initial.status || initial.from || initial.to || initial.number)

  const applyFilters = (e: FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams()
    if (draft.status) next.set('status', draft.status)
    if (draft.from) next.set('from', draft.from)
    if (draft.to) next.set('to', draft.to)
    if (draft.number.trim()) next.set('number', draft.number.trim().replace(/^#/, ''))
    onApply(next)
  }

  const clearFilters = () => {
    setDraft({ status: '', from: '', to: '', number: '' })
    onApply(new URLSearchParams())
  }

  return (
    <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-5">
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Número</span>
        <input
          value={draft.number}
          onChange={(e) => setDraft({ ...draft, number: e.target.value })}
          placeholder="#123"
          inputMode="numeric"
          className="rounded border border-neutral-300 px-2 py-1.5"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Estado</span>
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as OrderStatus | '' })}
          className="rounded border border-neutral-300 px-2 py-1.5"
        >
          <option value="">Todos</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Desde</span>
        <input
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          className="rounded border border-neutral-300 px-2 py-1.5"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Hasta</span>
        <input
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          className="rounded border border-neutral-300 px-2 py-1.5"
        />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-white">
          Buscar
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="rounded border border-neutral-300 px-3 py-1.5">
            Limpiar
          </button>
        )}
      </div>
    </form>
  )
}
