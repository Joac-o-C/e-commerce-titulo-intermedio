import { Link } from 'react-router-dom'
import { useToastStore } from '../../store/toast.store'

const TONE_CLASSES = {
  info: 'bg-neutral-800 text-white',
  success: 'bg-neutral-800 text-white',
  warning: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
}

/** Pila de avisos abajo de la pantalla; se montan una sola vez en `Layout`. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${TONE_CLASSES[toast.tone]}`}
        >
          {toast.tone === 'success' && (
            <span aria-hidden="true" className="text-green-400">
              ✓
            </span>
          )}
          <p className="flex-1">{toast.message}</p>
          {toast.action && (
            <Link
              to={toast.action.to}
              onClick={() => dismiss(toast.id)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              {toast.action.label}
            </Link>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Cerrar aviso"
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
