import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../store/auth.store'

/** JWT sin firma válida: el store sólo decodifica el payload. */
function fakeJwt(sub: string): string {
  return `h.${btoa(JSON.stringify({ sub, role: 'cliente' }))}.s`
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: 'Unauthorized',
    data: { message: 'Unauthorized' },
    headers: {},
    config,
  })
}

// El refresh usa una instancia propia creada con axios.create: se intercepta
// el adapter por default para ver también esas llamadas.
let refreshCalls: number
let refreshResult: 'ok' | 'fail'
const protectedCalls: (string | undefined)[] = []

const adapter: AxiosAdapter = async (config) => {
  if (config.url === '/auth/refresh') {
    refreshCalls++
    await new Promise((r) => setTimeout(r, 5))
    if (refreshResult === 'fail') throw unauthorized(config)
    return { data: { accessToken: fakeJwt('renovado') }, status: 200, statusText: 'OK', headers: {}, config }
  }
  const auth = config.headers?.Authorization as string | undefined
  protectedCalls.push(auth)
  if (config.url?.startsWith('/auth/') || auth !== `Bearer ${fakeJwt('renovado')}`) throw unauthorized(config)
  return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
}

// La instancia del refresh se crea al importar api-client y copia el adapter
// de ese momento: hay que fijarlo antes de importarla.
axios.defaults.adapter = adapter
const { apiClient } = await import('./api-client')

describe('apiClient (CU-06/CU-10: sesión con refresh token)', () => {
  beforeEach(() => {
    refreshCalls = 0
    refreshResult = 'ok'
    protectedCalls.length = 0
    apiClient.defaults.adapter = adapter
    useAuthStore.getState().setSession(fakeJwt('vencido'))
  })

  it('ante un 401 renueva el access token y reintenta el request una vez', async () => {
    const res = await apiClient.get('/orders')

    expect(res.data).toEqual({ ok: true })
    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toEqual([`Bearer ${fakeJwt('vencido')}`, `Bearer ${fakeJwt('renovado')}`])
    expect(useAuthStore.getState().accessToken).toBe(fakeJwt('renovado'))
  })

  it('varios 401 simultáneos comparten un único refresh', async () => {
    await Promise.all([apiClient.get('/orders'), apiClient.get('/cart'), apiClient.get('/addresses')])

    expect(refreshCalls).toBe(1)
  })

  it('si el refresh falla, cierra la sesión local y propaga el error', async () => {
    refreshResult = 'fail'

    await expect(apiClient.get('/orders')).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null, status: 'unauthenticated' })
  })

  it('un 401 de /auth/* (p. ej. login con contraseña incorrecta) no dispara el refresh', async () => {
    const err = await apiClient.post('/auth/login', {}).catch((e: AxiosError) => e)

    expect((err as AxiosError).response?.status).toBe(401)
    expect(refreshCalls).toBe(0)
    expect(useAuthStore.getState().status).toBe('authenticated')
  })
})
