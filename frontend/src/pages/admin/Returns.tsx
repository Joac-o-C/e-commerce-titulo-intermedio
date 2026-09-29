import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Pagination } from '../../components/ui/Pagination'
import { Table, type TableColumn } from '../../components/ui/Table'
import { RETURN_STATUS_LABELS, formatDate, formatDateTime } from '../../features/orders/order-labels'
import { adminReturnsService } from '../../services/admin-returns.service'
import type { AdminReturnFilters, AdminReturnRow } from '../../types/admin-orders.types'
import type { ReturnRequestStatus } from '../../types/order.types'

/** Filtros rápidos de la bandeja; cada uno es un conjunto de parámetros de la URL. */
const VIEWS: { label: string; params: Record<string, string> }[] = [
  { label: 'Todas', params: {} },
  { label: 'Por resolver', params: { status: 'solicitada' } },
  { label: 'Aprobadas (esperando el producto)', params: { status: 'aprobada' } },
  { label: 'Recepción vencida', params: { reception: 'vencidas' } },
  { label: 'Reposición por despachar', params: { replacements: 'pendientes' } },
  { label: 'Resueltas', params: { status: 'resuelta' } },
  { label: 'Rechazadas', params: { status: 'rechazada' } },
]

/**
 * CU-22 Resolver solicitud de cambio o devolución (admin): bandeja de
 * solicitudes (precondición 3), con el seguimiento de las aprobadas que no
 * llegaron a tiempo (flujo 8a) y de las reposiciones pendientes (10a).
 */
export function AdminReturns() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? '1') || 1
  const status = params.get('status') ?? ''
  const reception = params.get('reception') ?? ''
  const replacements = params.get('replacements') ?? ''

  const filters: AdminReturnFilters = {
    page,
    ...(status ? { status: status as ReturnRequestStatus } : {}),
    ...(reception === 'vencidas' ? { reception: 'vencidas' as const } : {}),
    ...(replacements === 'pendientes' ? { replacements: 'pendientes' as const } : {}),
  }
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['admin', 'returns', filters],
    queryFn: () => adminReturnsService.list(filters),
    placeholderData: keepPreviousData,
  })

  const isCurrent = (view: Record<string, string>) =>
    (view.status ?? '') === status && (view.reception ?? '') === reception && (view.replacements ?? '') === replacements

  const columns: TableColumn<AdminReturnRow>[] = [
    {
      header: 'Solicitud',
      render: (r) => (
        <Link to={`/admin/returns/${r.id}`} className="font-medium text-neutral-800 underline">
          #{r.requestNumber}
        </Link>
      ),
    },
    { header: 'Fecha', render: (r) => formatDateTime(r.createdAt) },
    {
      header: 'Pedido',
      render: (r) => (
        <Link to={`/admin/orders/${r.order.id}`} className="underline">
          #{r.order.orderNumber}
        </Link>
      ),
    },
    {
      header: 'Cliente',
      render: (r) => (
        <>
          <span className="block">{r.customer.name}</span>
          <span className="text-xs text-neutral-500">{r.customer.email}</span>
        </>
      ),
    },
    { header: 'Tipo', render: (r) => (r.type === 'cambio' ? 'Cambio' : 'Devolución') },
    { header: 'Unidades', render: (r) => r.units, className: 'text-right' },
    {
      header: 'Estado',
      render: (r) => (
        <>
          {RETURN_STATUS_LABELS[r.status]}
          {r.receptionDeadline && (
            <span className={`block text-xs ${r.receptionOverdue ? 'font-medium text-red-700' : 'text-neutral-500'}`}>
              {r.receptionOverdue ? 'Plazo de recepción vencido' : `Recibir hasta el ${formatDate(r.receptionDeadline)}`}
            </span>
          )}
        </>
      ),
    },
  ]

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Cambios y devoluciones</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        {VIEWS.map((view) => (
          <button
            key={view.label}
            type="button"
            onClick={() => setParams(new URLSearchParams(view.params))}
            className={`rounded-full border px-3 py-1 ${
              isCurrent(view.params) ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-300 bg-white text-neutral-700'
            }`}
          >
            {view.label}
            {view.params.status === 'solicitada' && !!data?.counters.pending && ` (${data.counters.pending})`}
            {view.params.reception === 'vencidas' && !!data?.counters.overdue && ` (${data.counters.overdue})`}
          </button>
        ))}
      </nav>

      {isLoading && <p className="text-neutral-600">Cargando solicitudes…</p>}
      {isError && <p className="text-red-600">No pudimos cargar las solicitudes.</p>}

      {data && (
        <section className={`space-y-3 ${isFetching ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <Table columns={columns} rows={data.items} rowKey={(r) => r.id} emptyMessage="No hay solicitudes en esta vista" />
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(next) => {
              const copy = new URLSearchParams(params)
              copy.set('page', String(next))
              setParams(copy)
            }}
          />
        </section>
      )}
    </main>
  )
}
