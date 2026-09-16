import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

/** Envuelve rutas del panel admin (CU-16/17/18): exige sesión y rol administrador. */
export function AdminRoute() {
  const status = useAuthStore((state) => state.status)
  const role = useAuthStore((state) => state.user?.role)

  if (status === 'idle' || status === 'loading') {
    return null
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  if (role !== 'administrador') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
