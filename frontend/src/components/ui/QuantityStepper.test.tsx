import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuantityStepper } from './QuantityStepper'

describe('QuantityStepper', () => {
  it('suma y resta de a uno', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} onChange={onChange} max={5} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sumar uno' }))
    await userEvent.click(screen.getByRole('button', { name: 'Restar uno' }))
    expect(onChange).toHaveBeenNthCalledWith(1, 3)
    expect(onChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('deshabilita los botones en los límites', () => {
    const { rerender } = render(<QuantityStepper value={1} onChange={() => {}} max={3} />)
    expect(screen.getByRole('button', { name: 'Restar uno' })).toBeDisabled()
    rerender(<QuantityStepper value={3} onChange={() => {}} max={3} />)
    expect(screen.getByRole('button', { name: 'Sumar uno' })).toBeDisabled()
  })
})
