import { describe, expect, it } from 'vitest'
import { loginErrorMessage } from './login-error'

const httpError = (status: number, data?: object) => ({ response: { status, data } })

describe('loginErrorMessage', () => {
  it('429: avisa el bloqueo con los minutos que informa el backend', () => {
    const result = loginErrorMessage(httpError(429, { code: 'ACCOUNT_LOCKED', retryAfterMinutes: 12 }))
    expect(result.locked).toBe(true)
    expect(result.message).toContain('Probá de nuevo en 12 minutos.')
  })

  it('429: usa singular para 1 minuto', () => {
    expect(loginErrorMessage(httpError(429, { retryAfterMinutes: 1 })).message).toContain('en 1 minuto.')
  })

  it('429 sin minutos: mensaje sin número', () => {
    expect(loginErrorMessage(httpError(429)).message).toContain('en unos minutos')
  })

  it('401: usa el mensaje genérico del backend', () => {
    const result = loginErrorMessage(httpError(401, { message: 'El email o la contraseña no son correctos' }))
    expect(result).toEqual({ locked: false, message: 'El email o la contraseña no son correctos' })
  })

  it('sin respuesta o 5xx: problema de conexión', () => {
    expect(loginErrorMessage(new Error('Network Error')).message).toMatch(/No pudimos conectarnos/)
    expect(loginErrorMessage(httpError(503)).message).toMatch(/No pudimos conectarnos/)
  })
})
