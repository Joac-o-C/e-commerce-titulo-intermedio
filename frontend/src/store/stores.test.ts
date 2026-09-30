import { beforeEach, describe, expect, it } from 'vitest'
import type { GuestCartItem } from '../types/cart.types'
import { useAuthStore } from './auth.store'
import { useGuestCartStore } from './cart.store'

describe('useAuthStore', () => {
  it('decodifica id y rol del payload del access token', () => {
    const token = `h.${btoa(JSON.stringify({ sub: 'u-1', role: 'administrador' }))}.s`
    useAuthStore.getState().setSession(token)

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: token,
      user: { id: 'u-1', role: 'administrador' },
      status: 'authenticated',
    })
  })

  it('un token ilegible deja la sesión sin usuario', () => {
    useAuthStore.getState().setSession('no-es-un-jwt')

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clear() cierra la sesión', () => {
    useAuthStore.getState().setSession(`h.${btoa('{"sub":"u","role":"cliente"}')}.s`)
    useAuthStore.getState().clear()

    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, user: null, status: 'unauthenticated' })
  })
})

describe('useGuestCartStore (carrito de Visitante)', () => {
  const item = (variantId: string, quantity: number): GuestCartItem => ({
    variantId,
    productId: 'p-1',
    productName: 'Remera',
    variantAttributes: { Talle: 'M' },
    quantity,
  })

  beforeEach(() => useGuestCartStore.getState().clear())

  it('setItem agrega una variante nueva y reemplaza la cantidad de una existente', () => {
    const { setItem } = useGuestCartStore.getState()
    setItem(item('v-1', 1))
    setItem(item('v-2', 2))
    setItem(item('v-1', 3))

    expect(useGuestCartStore.getState().items.map((i) => [i.variantId, i.quantity])).toEqual([
      ['v-1', 3],
      ['v-2', 2],
    ])
  })

  it('updateQuantity y removeItem actúan sólo sobre la variante indicada', () => {
    const s = useGuestCartStore.getState()
    s.setItem(item('v-1', 1))
    s.setItem(item('v-2', 1))
    s.updateQuantity('v-2', 5)
    s.removeItem('v-1')

    expect(useGuestCartStore.getState().items).toEqual([item('v-2', 5)])
  })

  it('persiste en localStorage', () => {
    useGuestCartStore.getState().setItem(item('v-1', 2))

    expect(JSON.parse(localStorage.getItem('guest-cart')!).state.items).toEqual([item('v-1', 2)])
  })
})
