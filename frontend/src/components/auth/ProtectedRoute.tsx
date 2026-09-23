import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

/** Envuelve rutas que requieren sesión iniciada (ej. /account/addresses). */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === 'idle' || status === 'loading') {
    return null
  }

  if (status === 'unauthenticated') {
    // CU-03 (flujo 2b): si la sesión expiró a mitad del checkout, al volver
    // a iniciar sesión se retoma donde estaba (Login lee `state.from`).
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
