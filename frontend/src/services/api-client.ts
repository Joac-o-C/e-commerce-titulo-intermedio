import axios from 'axios'
import { useAuthStore } from '../store/auth.store'

/**
 * Instancia única de axios para hablar con el backend NestJS. Cada
 * servicio de dominio (auth, catálogo, carrito, pedidos...) construye sus
 * llamadas sobre esta instancia en vez de crear clientes HTTP propios.
 *
 * withCredentials: true porque el refresh token viaja en una cookie
 * httpOnly seteada por el backend (otro origen: :3000 vs :5173 de Vite).
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

// Instancia sin el interceptor de Authorization: /auth/refresh no debe
// reenviar el access token vencido que disparó el 401 en primer lugar.
const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const { data } = await refreshClient.post<{ accessToken: string }>('/auth/refresh')
  return data.accessToken
}

// Los endpoints de /auth/* (login, register, refresh, forgot/reset-password,
// verify-email) nunca deben disparar un intento de refresh ante un 401: ese
// código ahí significa "credenciales inválidas" o "token inválido", no
// "se venció la sesión de un endpoint protegido". Si no se excluyen, un
// login con password incorrecta dispara un refresh (que también falla sin
// sesión) y ese error de refresh termina pisando el mensaje real del login.
const AUTH_ENDPOINTS_WITHOUT_RETRY = ['/auth/'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined
    const isAuthEndpoint = AUTH_ENDPOINTS_WITHOUT_RETRY.some((path) =>
      originalRequest?.url?.includes(path),
    )

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null
        })
        const accessToken = await refreshPromise
        useAuthStore.getState().setSession(accessToken)
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().clear()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)
