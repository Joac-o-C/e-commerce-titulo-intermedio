import { describe, expect, it } from 'vitest'
import { formatPrice, plural } from './format'

describe('formatPrice', () => {
  it('formatea los strings decimales que manda la API', () => {
    expect(formatPrice('6500.00')).toBe('$6.500')
    expect(formatPrice('112000.00')).toBe('$112.000')
  })

  it('muestra centavos sólo cuando hay', () => {
    expect(formatPrice('39900.50')).toBe('$39.900,50')
    expect(formatPrice(1234.56)).toBe('$1.234,56')
  })

  it('tolera valores vacíos o inválidos', () => {
    expect(formatPrice(null)).toBe('—')
    expect(formatPrice(undefined)).toBe('—')
    expect(formatPrice('abc')).toBe('—')
  })
})

describe('plural', () => {
  it('elige singular o plural según la cantidad', () => {
    expect(plural(1, 'resultado', 'resultados')).toBe('1 resultado')
    expect(plural(0, 'resultado', 'resultados')).toBe('0 resultados')
    expect(plural(14, 'resultado', 'resultados')).toBe('14 resultados')
  })
})
