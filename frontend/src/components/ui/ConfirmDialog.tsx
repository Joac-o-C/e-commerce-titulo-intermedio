interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmación genérica para bajas lógicas (CU-16/17). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-neutral-800">{title}</h2>
        {description && <p className="mt-2 text-sm text-neutral-600">{description}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-300 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
