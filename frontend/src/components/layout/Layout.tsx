import { Link, Outlet } from 'react-router-dom'
import { useCart } from '../../features/cart/hooks/useCart'
import { useGuestCartStore } from '../../store/cart.store'
import { useAuthStore } from '../../store/auth.store'
import { STORE_NAME } from '../../lib/brand'
import { plural } from '../../lib/format'
import { BrandLogo } from '../brand/BrandLogo'
import { Toaster } from '../ui/Toaster'
import { ThemePicker } from '../dev/ThemePicker'
import { AccountMenu } from './AccountMenu'
import { AdminBar } from './AdminBar'
import { CartIcon, BoxIcon, UserIcon } from './icons'

// Selector de tema (Fase 6): sólo con VITE_THEME_SELECTION=true en el .env.
const SHOW_THEME_PICKER = import.meta.env.VITE_THEME_SELECTION?.trim().toLowerCase() === 'true'

const NAV_LINK = 'flex items-center gap-1.5 rounded p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:px-2.5'

/**
 * Header y footer compartidos por toda la SPA. En mobile los accesos del
 * header quedan como íconos (con su nombre accesible) para que entren en
 * una sola fila junto a la marca.
 */
export function Layout() {
  const authStatus = useAuthStore((s) => s.status)
  const isAdmin = useAuthStore((s) => s.user?.role === 'administrador')
  const { data: cart } = useCart()
  const guestItems = useGuestCartStore((s) => s.items)

  const cartCount =
    authStatus === 'authenticated' ? cart?.totalItems ?? 0 : guestItems.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link to="/" aria-label={`${STORE_NAME}, ir al catálogo`} className="rounded py-1">
            <BrandLogo />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
            {authStatus === 'authenticated' ? (
              <>
                <Link to="/account/orders" aria-label="Mis pedidos" className={NAV_LINK}>
                  <BoxIcon />
                  <span className="hidden sm:inline">Mis pedidos</span>
                </Link>
                <AccountMenu triggerClassName={NAV_LINK} />
              </>
            ) : (
              <Link to="/login" aria-label="Iniciar sesión" className={NAV_LINK}>
                <UserIcon />
                <span className="hidden sm:inline">Iniciar sesión</span>
              </Link>
            )}
            <Link
              to="/cart"
              aria-label={cartCount > 0 ? `Carrito, ${plural(cartCount, 'producto', 'productos')}` : 'Carrito'}
              className={NAV_LINK}
            >
              <span className="relative">
                <CartIcon />
                {cartCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 min-w-4.5 rounded-full bg-primary px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-on-primary ring-2 ring-white"
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">Carrito</span>
            </Link>
          </nav>
        </div>
        {isAdmin && <AdminBar />}
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {STORE_NAME}
          </p>
          <p>Proyecto académico · Analista en Sistemas</p>
        </div>
      </footer>
      <Toaster />
      {SHOW_THEME_PICKER && <ThemePicker />}
    </div>
  )
}
