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

  logout() {
    return apiClient.post('/auth/logout')
  },

  logoutAll() {
    return apiClient.post('/auth/logout-all')
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
