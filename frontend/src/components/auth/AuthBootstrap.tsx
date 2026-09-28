import { useEffect, type ReactNode } from 'react'
import { authService } from '../../services/auth.service'
import { useAuthStore } from '../../store/auth.store'

/**
 * Un solo refresh por carga de la app. El refresh token rota (CU-06): dos
 * `/auth/refresh` en paralelo con la misma cookie hacen que uno gane y el
 * otro reciba 401 por token ya revocado — y si el 401 resuelve último,
 * borra una sesión válida. Pasaba siempre en desarrollo, porque StrictMode
 * monta el efecto dos veces; compartir la promesa lo evita.
 */
let bootstrapRefresh: ReturnType<typeof authService.refresh> | null = null

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
    // Se libera al resolver: StrictMode vuelve a montar antes de eso (y
    // comparte la promesa), pero un remontaje posterior (HMR, un reset del
    // árbol) tiene que pedir un token nuevo, no reusar uno quizás vencido.
    bootstrapRefresh ??= authService.refresh().finally(() => {
      bootstrapRefresh = null
    })
    bootstrapRefresh
      .then(({ accessToken }) => setSession(accessToken))
      .catch(() => clear())
    // Solo al montar: bootstrap corre una única vez por carga de la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return children
}
