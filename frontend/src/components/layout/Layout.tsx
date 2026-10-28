import { Link, Outlet, useLocation } from 'react-router-dom'
import { useCart } from '../../features/cart/hooks/useCart'
import { useGuestCartStore } from '../../store/cart.store'
import { useAuthStore } from '../../store/auth.store'
import { AdminBar } from './AdminBar'

/**
 * Header compartido por toda la SPA (no existía antes de Fase 3: hasta
 * ahora cada página era un `<main>` standalone). Se introduce recién ahora
 * porque el badge de cantidad del carrito es lo primero que necesita
 * verse en todas las páginas.
 */
export function Layout() {
  const { pathname } = useLocation()
  const adminTheme = pathname.startsWith('/admin/')
  const authStatus = useAuthStore((s) => s.status)
  const isAdmin = useAuthStore((s) => s.user?.role === 'administrador')
  const { data: cart } = useCart()
  const guestItems = useGuestCartStore((s) => s.items)

  const cartCount =
    authStatus === 'authenticated' ? cart?.totalItems ?? 0 : guestItems.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className={`min-h-screen bg-neutral-50${adminTheme ? ' admin-theme' : ''}`}>
      <header className="border-b-2 border-neutral-900 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link
            to="/"
            className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <img src="/nandu-logo.png" alt="Ñandú — Inicio" className="brand-logo h-20 w-20 object-contain sm:h-24 sm:w-24" />
          </Link>
          <nav aria-label="Navegación principal" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-xs sm:gap-x-5 sm:text-sm">
            {authStatus === 'authenticated' ? (
              <>
                <Link to="/account/orders" className="text-neutral-600 hover:text-neutral-900">
                  Mis pedidos
                </Link>
                <Link to="/account/addresses" className="text-neutral-600 hover:text-neutral-900">
                  Mi cuenta
                </Link>
              </>
            ) : (
              <Link to="/login" className="text-neutral-600 hover:text-neutral-900">
                Iniciar sesión
              </Link>
            )}
            <Link to="/cart" className="relative rounded-full bg-neutral-900 px-4 py-2 font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
              Carrito
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 rounded-full border border-neutral-900 bg-white px-1.5 py-0.5 text-xs font-semibold text-neutral-900">
                  {cartCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
        {isAdmin && <AdminBar />}
      </header>
      <Outlet />
    </div>
  )
}
