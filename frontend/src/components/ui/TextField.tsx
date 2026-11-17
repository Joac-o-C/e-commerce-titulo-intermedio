import { useId, type ComponentProps, type ReactNode } from 'react'

export const INPUT_CLASSES =
  'w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-800 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500'

export interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  error?: string
  hint?: string
  /** Contenido extra dentro del recuadro del input, a la derecha (p. ej. el botón de mostrar contraseña). */
  trailing?: ReactNode
}

/**
 * Campo de formulario con etiqueta siempre visible y error asociado
 * (`aria-describedby`). Se usa con react-hook-form: `<TextField {...register('email')} />`
 * (en React 19 `ref` llega como prop común).
 */
export function TextField({ label, error, hint, trailing, id, className = '', ...inputProps }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT_CLASSES} ${trailing ? 'pr-11' : ''}`}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
