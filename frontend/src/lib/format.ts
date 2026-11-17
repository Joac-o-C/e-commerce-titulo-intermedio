const wholeFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const centsFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })

/**
 * Precio en pesos con separador de miles (`$112.000`, `$39.900,50`): sin decimales si son `,00`.
 * La API manda los importes como string decimal (`"6500.00"`).
 */
export function formatPrice(value: string | number | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : value
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  // Intl usa un espacio duro entre "$" y el número en es-AR; se quita para que quede "$6.500".
  const formatter = Number.isInteger(amount) ? wholeFormatter : centsFormatter
  return formatter.format(amount).replace(/\$\s/, '$')
}

/** `plural(1, 'resultado', 'resultados')` → "1 resultado". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
