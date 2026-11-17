import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'
import { PasswordField } from './PasswordField'

describe('TextField', () => {
  it('asocia la etiqueta y el error al input', () => {
    render(<TextField label="Email" error="Email inválido" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Email inválido')
  })
})

describe('PasswordField', () => {
  it('muestra y oculta la contraseña', async () => {
    render(<PasswordField label="Contraseña" />)
    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
