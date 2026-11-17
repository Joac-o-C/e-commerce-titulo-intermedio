interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  label?: string
  size?: 'md' | 'sm'
}

/**
 * Selector de cantidad con botones − / +. Pide el cambio con `onChange`
 * (incluso por encima de `max` si se escribe a mano), así la página decide
 * qué hacer con un exceso de stock (CU-09 8a / CU-02 3a): nunca ajusta solo.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  label = 'Cantidad',
  size = 'md',
}: QuantityStepperProps) {
  const box = size === 'md' ? 'h-11 w-11 text-lg' : 'h-9 w-9'
  const atMin = value <= min
  const atMax = max !== undefined && value >= max

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center rounded border border-neutral-300 bg-white ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        aria-label="Restar uno"
        disabled={disabled || atMin}
        onClick={() => onChange(value - 1)}
        className={`${box} flex items-center justify-center text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isInteger(next) && next >= min) onChange(next)
        }}
        className={`${size === 'md' ? 'h-11 w-12' : 'h-9 w-10'} border-x border-neutral-300 text-center text-neutral-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <button
        type="button"
        aria-label="Sumar uno"
        disabled={disabled || atMax}
        onClick={() => onChange(value + 1)}
        className={`${box} flex items-center justify-center text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent`}
      >
        +
      </button>
    </div>
  )
}
