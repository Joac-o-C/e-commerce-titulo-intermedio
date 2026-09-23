import { Link, Outlet } from 'react-router-dom'
import { useCart } from '../../features/cart/hooks/useCart'
import { useGuestCartStore } from '../../store/cart.store'
import { useAuthStore } from '../../store/auth.store'

/**
 * Header compartido por toda la SPA (no existía antes de Fase 3: hasta
 * ahora cada página era un `<main>` standalone). Se introduce recién ahora
 * porque el badge de cantidad del carrito es lo primero que necesita
 * verse en todas las páginas.
 */
export function Layout() {
  const authStatus = useAuthStore((s) => s.status)
  const { data: cart } = useCart()
  const guestItems = useGuestCartStore((s) => s.items)

  const cartCount =
    authStatus === 'authenticated' ? cart?.totalItems ?? 0 : guestItems.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-neutral-800">
            Catálogo
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {authStatus === 'authenticated' ? (
              <Link to="/account/addresses" className="text-neutral-600 hover:text-neutral-900">
                Mi cuenta
              </Link>
            ) : (
              <Link to="/login" className="text-neutral-600 hover:text-neutral-900">
                Iniciar sesión
              </Link>
            )}
            <Link to="/cart" className="relative text-neutral-600 hover:text-neutral-900">
              Carrito
              {cartCount > 0 && (
                <span className="absolute -right-3 -top-2 rounded-full bg-neutral-800 px-1.5 py-0.5 text-xs text-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
