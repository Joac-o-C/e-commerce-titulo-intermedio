import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MergeConflict } from '../hooks/useCartMerge'
import { MergeCartModal } from './MergeCartModal'

const conflict = (variantId: string, result: Omit<MergeConflict['result'], 'variantId'>): MergeConflict => ({
  result: { variantId, ...result },
  guestItem: { variantId, productId: 'p', productName: `Producto ${variantId}`, variantAttributes: {}, quantity: result.requestedQuantity },
})

const conflicts = [
  conflict('ok', { requestedQuantity: 2, outcome: 'ok' }),
  conflict('corto', { requestedQuantity: 5, outcome: 'insufficient_stock', maxAvailable: 3 }),
  conflict('baja', { requestedQuantity: 1, outcome: 'unavailable' }),
]

describe('MergeCartModal (CU-06, fusión con conflictos)', () => {
  it('por default deja el máximo disponible de lo que no alcanza y descarta lo no disponible', async () => {
    const onConfirm = vi.fn()
    render(<MergeCartModal conflicts={conflicts} onConfirm={onConfirm} onCancel={vi.fn()} />)

    expect(screen.getByText(/ya no está disponible/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(onConfirm).toHaveBeenCalledWith({ ok: 2, corto: 3 })
  })

  it('si se destilda el ítem recortado, no se agrega', async () => {
    const onConfirm = vi.fn()
    render(<MergeCartModal conflicts={conflicts} onConfirm={onConfirm} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(onConfirm).toHaveBeenCalledWith({ ok: 2 })
  })

  it('Cancelar no confirma nada', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<MergeCartModal conflicts={conflicts} onConfirm={onConfirm} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
