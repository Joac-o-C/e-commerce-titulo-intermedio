import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

/** Envuelve rutas que requieren sesión iniciada (ej. /account/addresses). */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status)

  if (status === 'idle' || status === 'loading') {
    return null
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
