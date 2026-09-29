import { useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Pagination } from '../../components/ui/Pagination'
import { Table, type TableColumn } from '../../components/ui/Table'
import { ADMIN_ORDER_SORT_LABELS } from '../../features/admin/admin-labels'
import { OrderStatusBadge } from '../../features/orders/components/OrderStatusBadge'
import {
  MAX_ORDER_NUMBER,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  apiErrorMessage,
  dayBoundary,
  formatDateTime,
} from '../../features/orders/order-labels'
import { adminOrdersService } from '../../services/admin-orders.service'
import type { AdminOrderFilters, AdminOrderRow, AdminOrderSort } from '../../types/admin-orders.types'
import type { CustomerPaymentStatus, OrderStatus } from '../../types/order.types'

const FILTER_KEYS = ['number', 'customer', 'status', 'paymentStatus', 'from', 'to', 'refunds', 'sort'] as const
type FilterValues = Record<(typeof FILTER_KEYS)[number], string>

/**
 * CU-19 Ver y gestionar pedidos (admin), paso 2: listado de todos los
 * pedidos con búsqueda, filtros y orden (en la URL, así "volver" desde el
 * detalle conserva la búsqueda) y exportación a CSV (flujo 2a).
 */
export function AdminOrders() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? '1') || 1
  const values = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as FilterValues

  // Un número imposible no se consulta: directamente no coincide nada.
  const numberIsValid =
    /^\d+$/.test(values.number) && Number(values.number) >= 1 && Number(values.number) <= MAX_ORDER_NUMBER
  const impossibleNumber = values.number !== '' && !numberIsValid

  const filters: AdminOrderFilters = {
    page,
    ...(numberIsValid ? { number: Number(values.number) } : {}),
    ...(values.customer ? { customer: values.customer } : {}),
    ...(values.status ? { status: values.status as OrderStatus } : {}),
    ...(values.paymentStatus ? { paymentStatus: values.paymentStatus as CustomerPaymentStatus } : {}),
    ...(values.from ? { from: dayBoundary(values.from, 'start') } : {}),
    ...(values.to ? { to: dayBoundary(values.to, 'end') } : {}),
    ...(values.refunds === 'requieren_gestion' ? { refunds: 'requieren_gestion' as const } : {}),
    ...(values.sort ? { sort: values.sort as AdminOrderSort } : {}),
  }

  const query = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => adminOrdersService.list(filters),
    enabled: !impossibleNumber,
    placeholderData: keepPreviousData,
    retry: (count, err) => count < 3 && ((err as { response?: { status?: number } }).response?.status ?? 500) >= 500,
  })
  const data = impossibleNumber ? { items: [], page: 1, totalPages: 0, total: 0, refundsNeedingAttention: 0 } : query.data

  const exportCsv = useMutation({
    mutationFn: () => adminOrdersService.exportCsv(filters),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  const goToPage = (next: number) => {
    const copy = new URLSearchParams(params)
    copy.set('page', String(next))
    setParams(copy)
  }

  const columns: TableColumn<AdminOrderRow>[] = [
    {
      header: 'Pedido',
      render: (o) => (
        <Link to={`/admin/orders/${o.id}`} className="font-medium text-neutral-800 underline">
          #{o.orderNumber}
        </Link>
      ),
    },
    { header: 'Fecha', render: (o) => formatDateTime(o.createdAt) },
    {
      header: 'Cliente',
      render: (o) => (
        <>
          <span className="block">{o.customer.name}</span>
          <span className="text-xs text-neutral-500">{o.customer.email}</span>
        </>
      ),
    },
    { header: 'Productos', render: (o) => o.itemCount, className: 'text-right' },
    { header: 'Total', render: (o) => `$${o.total}`, className: 'text-right' },
    { header: 'Pago', render: (o) => PAYMENT_STATUS_LABELS[o.paymentStatus] },
    { header: 'Estado', render: (o) => <OrderStatusBadge status={o.status} /> },
  ]

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-800">Pedidos</h1>
        <button
          type="button"
          onClick={() => exportCsv.mutate()}
          disabled={exportCsv.isPending || !data || data.total === 0}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {exportCsv.isPending ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
      {exportCsv.isError && <p className="text-sm text-red-600">{apiErrorMessage(exportCsv.error, 'No pudimos exportar el listado.')}</p>}

      {/* Alerta de CU-21 (4a/5a). */}
      {!!data?.refundsNeedingAttention && values.refunds !== 'requieren_gestion' && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Hay {data.refundsNeedingAttention} reembolso(s) que requieren gestión.{' '}
          <Link to="/admin/orders?refunds=requieren_gestion" className="underline">
            Ver los pedidos
          </Link>
        </p>
      )}

      <AdminOrderFilterForm key={FILTER_KEYS.map((k) => values[k]).join('|')} initial={values} onApply={setParams} />

      {query.isLoading && <p className="text-neutral-600">Cargando pedidos…</p>}
      {query.isError && <p className="text-red-600">No pudimos cargar los pedidos.</p>}

      {data && (
        <section className={`space-y-3 ${query.isFetching ? 'opacity-60' : ''}`}>
          <p className="text-sm text-neutral-500">{data.total} pedido(s)</p>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <Table columns={columns} rows={data.items} rowKey={(o) => o.id} emptyMessage="Ningún pedido coincide con la búsqueda" />
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={goToPage} />
        </section>
      )}
    </main>
  )
}

/** CU-19 (paso 2): se aplican al buscar, no al tipear. */
function AdminOrderFilterForm({ initial, onApply }: { initial: FilterValues; onApply: (params: URLSearchParams) => void }) {
  const [draft, setDraft] = useState(initial)
  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && initial[k])
  const set = (key: keyof FilterValues) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value })

  const apply = (e: FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams()
    for (const key of FILTER_KEYS) {
      const value = key === 'number' ? draft[key].trim().replace(/^#/, '') : draft[key].trim()
      if (value) next.set(key, value)
    }
    onApply(next)
  }

  const clear = () => {
    const next = new URLSearchParams()
    if (initial.sort) next.set('sort', initial.sort)
    onApply(next)
  }

  const input = 'rounded border border-neutral-300 px-2 py-1.5'
  return (
    <form onSubmit={apply} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Número</span>
        <input value={draft.number} onChange={set('number')} placeholder="#123" inputMode="numeric" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Cliente</span>
        <input value={draft.customer} onChange={set('customer')} placeholder="Nombre, apellido o email" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Estado</span>
        <select value={draft.status} onChange={set('status')} className={input}>
          <option value="">Todos</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Pago</span>
        <select value={draft.paymentStatus} onChange={set('paymentStatus')} className={input}>
          <option value="">Todos</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Desde</span>
        <input type="date" value={draft.from} onChange={set('from')} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Hasta</span>
        <input type="date" value={draft.to} onChange={set('to')} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-neutral-600">Ordenar por</span>
        <select value={draft.sort} onChange={set('sort')} className={input}>
          <option value="">{ADMIN_ORDER_SORT_LABELS.fecha_desc}</option>
          {Object.entries(ADMIN_ORDER_SORT_LABELS)
            .filter(([value]) => value !== 'fecha_desc')
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-center gap-2 self-end pb-2">
        <input
          type="checkbox"
          checked={draft.refunds === 'requieren_gestion'}
          onChange={(e) => setDraft({ ...draft, refunds: e.target.checked ? 'requieren_gestion' : '' })}
        />
        <span className="text-neutral-700">Reembolsos que requieren gestión</span>
      </label>
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-white">
          Buscar
        </button>
        {hasFilters && (
          <button type="button" onClick={clear} className="rounded border border-neutral-300 px-3 py-1.5">
            Limpiar
          </button>
        )}
      </div>
    </form>
  )
}
