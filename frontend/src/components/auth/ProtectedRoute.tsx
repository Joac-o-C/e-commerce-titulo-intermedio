import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { ProgressBar } from '../ui/ProgressBar'

/** Envuelve rutas que requieren sesión iniciada (ej. /account/addresses). */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === 'idle' || status === 'loading') {
    // Mientras AuthBootstrap recupera la sesión: barra arriba en vez de página en blanco.
    return <ProgressBar active className="fixed inset-x-0 top-0 z-50" />
  }

  if (status === 'unauthenticated') {
    // CU-03 (flujo 2b): si la sesión expiró a mitad del checkout, al volver
    // a iniciar sesión se retoma donde estaba (Login lee `state.from`).
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
