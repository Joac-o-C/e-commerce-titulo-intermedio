import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService, type LogoutScope } from '../../services/auth.service'
import { useAuthStore } from '../../store/auth.store'
import { useToastStore } from '../../store/toast.store'

const SUCCESS_MESSAGE: Record<LogoutScope, string> = {
  actual: 'Cerraste sesión.',
  todas: 'Cerraste sesión en todos los dispositivos.',
}

/**
 * @usecase CU-10 Cerrar sesión
 *
 * El cierre en el navegador es inmediato (pasos 6-7): se redirige al inicio
 * y se descartan la sesión y los datos cacheados del usuario. La revocación
 * en el servidor corre después, y el aviso se muestra recién cuando termina,
 * para no informar un cierre que el servidor no confirmó.
 */
export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useToastStore((s) => s.show)

  return async (scope: LogoutScope = 'actual') => {
    const accessToken = useAuthStore.getState().accessToken

    // Primero se termina la navegación: si la sesión se limpia mientras la
    // ruta protegida sigue montada, ProtectedRoute redirige a /login y pisa
    // este navigate. El router aplica sus cambios en una transición, así que
    // no alcanza con esperar la promesa: flushSync fuerza a desmontarla ya.
    await navigate('/', { flushSync: true })
    useAuthStore.getState().clear()
    // Las consultas del usuario (carrito, pedidos, direcciones...) se
    // descartan para que otra cuenta no las vea en este navegador.
    queryClient.removeQueries()

    authService
      .revokeSession(scope, accessToken)
      .then(() => showToast(SUCCESS_MESSAGE[scope]))
      // CU-10 (flujo 3a): sin confirmación del servidor; el navegador ya
      // quedó deslogueado igual.
      .catch(() =>
        showToast('Cerraste sesión en este navegador, pero no pudimos confirmarlo con el servidor.', 'warning'),
      )
  }
}
