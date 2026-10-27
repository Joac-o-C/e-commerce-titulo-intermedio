import { apiClient } from './api-client'
import type { LoginResponse } from '../types/auth.types'

export interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  passwordConfirmation: string
  acceptTerms: boolean
}

export type LogoutScope = 'actual' | 'todas'

function isUnauthorized(err: unknown) {
  return (err as { response?: { status?: number } })?.response?.status === 401
}

export const authService = {
  register(input: RegisterInput) {
    return apiClient.post<{ message: string }>('/auth/register', input)
  },

  async login(email: string, password: string) {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password })
    return data
  },

  async refresh() {
    const { data } = await apiClient.post<LoginResponse>('/auth/refresh')
    return data
  },

  /**
   * CU-10: revoca en el servidor la sesión actual o, en el flujo 1a, todas
   * las de la cuenta. Recibe el access token que tenía la sesión porque el
   * store ya se limpió (el cierre en el navegador es inmediato).
   */
  async revokeSession(scope: LogoutScope, accessToken: string | null) {
    const path = scope === 'todas' ? '/auth/logout-all' : '/auth/logout'
    const post = (token: string | null) =>
      apiClient.post(path, null, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

    try {
      await post(accessToken)
    } catch (err) {
      if (!isUnauthorized(err)) throw err
      // /auth/* no pasa por el refresh automático del interceptor: si el
      // access token venció, se renueva acá una sola vez sin tocar el store.
      let freshToken: string
      try {
        ;({ accessToken: freshToken } = await authService.refresh())
      } catch (refreshErr) {
        // CU-10 (flujo 2a): el refresh token ya no es válido, no queda
        // sesión que revocar en el servidor.
        if (isUnauthorized(refreshErr)) return
        throw refreshErr
      }
      await post(freshToken)
    }
  },

  verifyEmail(token: string) {
    return apiClient.post<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  },

  resendVerification(email: string) {
    return apiClient.post<{ message: string }>('/auth/verify-email/resend', { email })
  },

  forgotPassword(email: string) {
    return apiClient.post<{ message: string }>('/auth/forgot-password', { email })
  },

  resetPassword(token: string, password: string, passwordConfirmation: string) {
    return apiClient.post<{ message: string }>('/auth/reset-password', {
      token,
      password,
      passwordConfirmation,
    })
  },
}
