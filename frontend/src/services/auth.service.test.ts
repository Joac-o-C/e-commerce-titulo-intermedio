import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './api-client'
import { authService } from './auth.service'

vi.mock('./api-client', () => ({ apiClient: { post: vi.fn() } }))

const post = vi.mocked(apiClient.post)

function httpError(status: number): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig
  return new AxiosError(String(status), 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config,
  })
}

const authHeaderOf = (call: unknown[]) =>
  (call[2] as { headers: Record<string, string> }).headers.Authorization

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CU-10 Cerrar sesión — authService.revokeSession', () => {
  it('revoca la sesión actual con el token que tenía la sesión', async () => {
    post.mockResolvedValueOnce({ data: {} })

    await authService.revokeSession('actual', 'tok')

    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('/auth/logout')
    expect(authHeaderOf(post.mock.calls[0])).toBe('Bearer tok')
  })

  it('flujo 1a: revoca todas las sesiones', async () => {
    post.mockResolvedValueOnce({ data: {} })

    await authService.revokeSession('todas', 'tok')

    expect(post.mock.calls[0][0]).toBe('/auth/logout-all')
  })

  it('con el access token vencido, lo renueva una vez y reintenta', async () => {
    post
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: { accessToken: 'nuevo' } })
      .mockResolvedValueOnce({ data: {} })

    await authService.revokeSession('actual', 'vencido')

    expect(post.mock.calls.map((c) => c[0])).toEqual(['/auth/logout', '/auth/refresh', '/auth/logout'])
    expect(authHeaderOf(post.mock.calls[2])).toBe('Bearer nuevo')
  })

  it('flujo 2a: si tampoco hay refresh válido, no queda sesión que revocar y no es error', async () => {
    post.mockRejectedValueOnce(httpError(401)).mockRejectedValueOnce(httpError(401))

    await expect(authService.revokeSession('actual', 'vencido')).resolves.toBeUndefined()
  })

  it('flujo 3a: si el servidor no está disponible, falla', async () => {
    post.mockRejectedValueOnce(httpError(503))

    await expect(authService.revokeSession('actual', 'tok')).rejects.toThrow()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('flujo 3a: si el refresh falla por otra causa que 401, también falla', async () => {
    post.mockRejectedValueOnce(httpError(401)).mockRejectedValueOnce(httpError(500))

    await expect(authService.revokeSession('actual', 'vencido')).rejects.toThrow()
  })
})
