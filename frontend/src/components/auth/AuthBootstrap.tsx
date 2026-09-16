import { useEffect, type ReactNode } from 'react'
import { authService } from '../../services/auth.service'
import { useAuthStore } from '../../store/auth.store'

/**
 * Al montar la app, intenta recuperar la sesión usando la cookie httpOnly
 * del refresh token (el access token en memoria se perdió con el reload).
 * Hasta que esto resuelve, status queda en 'loading' — ProtectedRoute
 * espera ese resultado antes de decidir si redirige a /login.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const setStatus = useAuthStore((state) => state.setStatus)
  const setSession = useAuthStore((state) => state.setSession)
  const clear = useAuthStore((state) => state.clear)

  useEffect(() => {
    setStatus('loading')
    authService
      .refresh()
      .then(({ accessToken }) => setSession(accessToken))
      .catch(() => clear())
    // Solo al montar: bootstrap corre una única vez por carga de la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return children
}
