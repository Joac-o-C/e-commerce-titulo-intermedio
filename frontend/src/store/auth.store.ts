import { create } from 'zustand'
import type { AuthUser } from '../types/auth.types'

/**
 * El access token no se persiste (ni localStorage ni sessionStorage):
 * vive solo en este store en memoria, para reducir la superficie de robo
 * vía XSS. Se pierde al recargar la página y se recupera llamando a
 * bootstrap(), que usa la cookie httpOnly del refresh token.
 */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  status: AuthStatus
  setSession: (accessToken: string) => void
  clear: () => void
  setStatus: (status: AuthStatus) => void
}

function decodeUserFromToken(accessToken: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as { sub: string; role: AuthUser['role'] }
    return { id: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  setSession: (accessToken) =>
    set({ accessToken, user: decodeUserFromToken(accessToken), status: 'authenticated' }),
  clear: () => set({ accessToken: null, user: null, status: 'unauthenticated' }),
  setStatus: (status) => set({ status }),
}))
