import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cartService } from '../../../services/cart.service'
import { useGuestCartStore } from '../../../store/cart.store'
import type { GuestCartItem, MergeItemResult } from '../../../types/cart.types'
import { useCartMerge } from './useCartMerge'
import { useGuestCart } from './useGuestCart'

vi.mock('../../../services/cart.service', () => ({
  cartService: {
    resolveGuestItem: vi.fn(),
    previewMerge: vi.fn(),
    confirmMerge: vi.fn(),
  },
}))

const service = vi.mocked(cartService)

const guestItem = (variantId: string, quantity: number): GuestCartItem => ({
  variantId,
  productId: `p-${variantId}`,
  productName: `Producto ${variantId}`,
  variantAttributes: {},
  quantity,
})

beforeEach(() => {
  vi.resetAllMocks()
  useGuestCartStore.getState().clear()
})

describe('useGuestCart', () => {
  describe('CU-02 Agregar producto al carrito (Visitante)', () => {
    it('valida contra el servidor sumando lo que ya estaba en el carrito', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-1', 2))
      service.resolveGuestItem.mockResolvedValue({ variantId: 'v-1', requestedQuantity: 3, outcome: 'ok' })
      const { result } = renderHook(() => useGuestCart())

      await act(() => result.current.addItem('v-1', 'p-v-1', 'Producto v-1', {}, 1))

      expect(service.resolveGuestItem).toHaveBeenCalledWith('v-1', 1, 2)
      expect(useGuestCartStore.getState().items[0].quantity).toBe(3)
      expect(result.current.totalItems).toBe(3)
    })

    it('stock insuficiente: informa el máximo y no toca el carrito', async () => {
      const answer: MergeItemResult = { variantId: 'v-1', requestedQuantity: 5, outcome: 'insufficient_stock', maxAvailable: 2 }
      service.resolveGuestItem.mockResolvedValue(answer)
      const { result } = renderHook(() => useGuestCart())

      const res = await act(() => result.current.addItem('v-1', 'p', 'P', {}, 5))

      expect(res).toEqual(answer)
      expect(useGuestCartStore.getState().items).toEqual([])
    })
  })

  describe('CU-11 Modificar o quitar ítem del carrito (Visitante)', () => {
    it('fija la cantidad absoluta sólo si el servidor la acepta', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-1', 1))
      service.resolveGuestItem
        .mockResolvedValueOnce({ variantId: 'v-1', requestedQuantity: 4, outcome: 'ok' })
        .mockResolvedValueOnce({ variantId: 'v-1', requestedQuantity: 9, outcome: 'insufficient_stock', maxAvailable: 4 })
      const { result } = renderHook(() => useGuestCart())

      await act(() => result.current.updateQuantity('v-1', 4))
      await act(() => result.current.updateQuantity('v-1', 9))

      expect(service.resolveGuestItem).toHaveBeenLastCalledWith('v-1', 9, 0)
      expect(useGuestCartStore.getState().items[0].quantity).toBe(4)
    })
  })
})

describe('useCartMerge', () => {
  describe('CU-06 Iniciar sesión (fusión del carrito de invitado)', () => {
    let queryClient: QueryClient
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    beforeEach(() => {
      queryClient = new QueryClient()
    })

    it('sin carrito de invitado no llama al servidor', async () => {
      const { result } = renderHook(() => useCartMerge(), { wrapper })

      await expect(act(() => result.current.run())).resolves.toBe(false)
      expect(service.previewMerge).not.toHaveBeenCalled()
    })

    it('sin conflictos fusiona directo y vacía el carrito de invitado', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-1', 2))
      service.previewMerge.mockResolvedValue([{ variantId: 'v-1', requestedQuantity: 2, outcome: 'ok' }])
      const { result } = renderHook(() => useCartMerge(), { wrapper })

      await expect(act(() => result.current.run())).resolves.toBe(false)

      expect(service.confirmMerge).toHaveBeenCalledWith([{ variantId: 'v-1', quantity: 2 }])
      expect(useGuestCartStore.getState().items).toEqual([])
      expect(result.current.conflicts).toBeNull()
    })

    it('con conflictos no fusiona nada y deja el lote entero para el modal', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-1', 2))
      useGuestCartStore.getState().setItem(guestItem('v-2', 5))
      service.previewMerge.mockResolvedValue([
        { variantId: 'v-1', requestedQuantity: 2, outcome: 'ok' },
        { variantId: 'v-2', requestedQuantity: 5, outcome: 'insufficient_stock', maxAvailable: 3 },
      ])
      const { result } = renderHook(() => useCartMerge(), { wrapper })

      await expect(act(() => result.current.run())).resolves.toBe(true)

      expect(service.confirmMerge).not.toHaveBeenCalled()
      expect(result.current.conflicts?.map((c) => c.guestItem.variantId)).toEqual(['v-1', 'v-2'])
    })

    it('confirmar fusiona las cantidades elegidas y vacía el carrito de invitado', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-2', 5))
      const { result } = renderHook(() => useCartMerge(), { wrapper })

      await act(() => result.current.confirm({ 'v-2': 3 }))

      expect(service.confirmMerge).toHaveBeenCalledWith([{ variantId: 'v-2', quantity: 3 }])
      expect(useGuestCartStore.getState().items).toEqual([])
    })

    it('cancelar deja el carrito de invitado intacto', async () => {
      useGuestCartStore.getState().setItem(guestItem('v-1', 2))
      service.previewMerge.mockResolvedValue([{ variantId: 'v-1', requestedQuantity: 2, outcome: 'unavailable' }])
      const { result } = renderHook(() => useCartMerge(), { wrapper })

      await act(() => result.current.run())
      act(() => result.current.cancel())

      expect(result.current.conflicts).toBeNull()
      expect(useGuestCartStore.getState().items).toHaveLength(1)
    })
  })
})
