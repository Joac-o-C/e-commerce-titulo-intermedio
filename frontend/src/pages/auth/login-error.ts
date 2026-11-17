import { plural } from '../../lib/format'

interface LoginErrorBody {
  code?: string
  message?: string
  retryAfterMinutes?: number
}

export interface LoginError {
  message: string
  /** Bloqueo temporal (CU-06, flujo 5a): además del texto en el formulario se avisa con un toast. */
  locked: boolean
}

/**
 * Traduce el error del login a un mensaje para el usuario (CU-06, flujos
 * 5a/6a/7a/7b). Los textos del backend para 401 ya son genéricos (no
 * distinguen email inexistente de contraseña incorrecta), así que se usan
 * tal cual; sin respuesta (red caída) o con un 5xx se muestra un mensaje propio.
 */
export function loginErrorMessage(err: unknown): LoginError {
  const response = (err as { response?: { status?: number; data?: LoginErrorBody } })?.response

  if (response?.status === 429) {
    const minutes = response.data?.retryAfterMinutes
    return {
      locked: true,
      message: minutes
        ? `Por seguridad, bloqueamos el inicio de sesión por varios intentos fallidos. Probá de nuevo en ${plural(minutes, 'minuto', 'minutos')}.`
        : 'Por seguridad, bloqueamos el inicio de sesión por varios intentos fallidos. Probá de nuevo en unos minutos.',
    }
  }

  if (!response || (response.status ?? 0) >= 500) {
    return { locked: false, message: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' }
  }

  return { locked: false, message: response.data?.message ?? 'El email o la contraseña no son correctos.' }
}
