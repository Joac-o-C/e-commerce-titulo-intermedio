import type { ReactNode } from 'react'
import { Spinner } from './Spinner'

interface SubmitButtonProps {
  loading: boolean
  loadingLabel: string
  children: ReactNode
}

/** Botón de envío de formulario que muestra un spinner mientras espera al backend. */
export function SubmitButton({ loading, loadingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded bg-neutral-800 py-2 text-white disabled:opacity-70"
    >
      {loading && <Spinner />}
      {loading ? loadingLabel : children}
    </button>
  )
}
