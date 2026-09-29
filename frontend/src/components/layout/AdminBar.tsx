import { NavLink } from 'react-router-dom'
import { useAdminSummary, useFakeGatewayEnabled } from '../../features/admin/useAdminSummary'

interface Badge {
  count: number
  to: string
  title: string
  tone: string
}

function Item({ to, label, badges = [] }: { to: string; label: string; badges?: Badge[] }) {
  return (
    <span className="flex items-center gap-1">
      <NavLink
        to={to}
        className={({ isActive }) => (isActive ? 'font-medium text-neutral-900' : 'text-neutral-600 hover:text-neutral-900')}
      >
        {label}
      </NavLink>
      {badges
        .filter((b) => b.count > 0)
        .map((b) => (
          <NavLink key={b.title} to={b.to} title={b.title} className={`rounded-full px-1.5 text-xs font-medium ${b.tone}`}>
            {b.count}
          </NavLink>
        ))}
    </span>
  )
}

/**
 * Barra del panel admin (decisión de la Fase 6), sólo para el
 * Administrador. Cada contador lleva al listado ya filtrado.
 */
export function AdminBar() {
  const { data: summary } = useAdminSummary()
  const fakeGateway = useFakeGatewayEnabled()

  return (
    <div className="border-t border-neutral-100 bg-neutral-100">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Admin</span>
        <Item
          to="/admin/orders"
          label="Pedidos"
          badges={[
            {
              count: summary?.refundsNeedingAttention ?? 0,
              to: '/admin/orders?refunds=requieren_gestion',
              title: 'Reembolsos que requieren gestión',
              tone: 'bg-red-600 text-white',
            },
          ]}
        />
        <Item
          to="/admin/returns"
          label="Posventa"
          badges={[
            {
              count: summary?.returnsPending ?? 0,
              to: '/admin/returns?status=solicitada',
              title: 'Solicitudes por resolver',
              tone: 'bg-amber-500 text-white',
            },
            {
              count: summary?.returnsOverdue ?? 0,
              to: '/admin/returns?reception=vencidas',
              title: 'Devoluciones con plazo de recepción vencido',
              tone: 'bg-red-600 text-white',
            },
            {
              count: summary?.replacementsPending ?? 0,
              to: '/admin/returns?replacements=pendientes',
              title: 'Reposiciones pendientes de despacho',
              tone: 'bg-blue-600 text-white',
            },
          ]}
        />
        <Item to="/admin/products" label="Productos" />
        <Item to="/admin/categories" label="Categorías" />
        <Item to="/admin/stock" label="Stock" />
        <Item to="/admin/shipping-methods" label="Envíos" />
        {fakeGateway && <Item to="/admin/fake-gateway" label="Pasarela simulada" />}
      </nav>
    </div>
  )
}
