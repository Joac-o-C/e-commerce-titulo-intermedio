import { useState } from 'react'
import type { MergeConflict } from '../hooks/useCartMerge'

interface MergeCartModalProps {
  conflicts: MergeConflict[]
  onConfirm: (acceptedQuantities: Record<string, number>) => void
  onCancel: () => void
}

/**
 * CU-06 (fusión del carrito de invitado): un solo modal con todo el lote.
 * Los ítems "ok" se fusionan igual; los recortados por falta de stock
 * quedan con un checkbox (marcado por default) para "dejar esa cantidad";
 * los no disponibles sólo se informan, nunca se fusionan. Cancelar no
 * toca nada — el carrito de invitado sigue intacto en localStorage.
 */
export function MergeCartModal({ conflicts, onConfirm, onCancel }: MergeCartModalProps) {
  const clamped = conflicts.filter((c) => c.result.outcome === 'insufficient_stock')
  const unavailable = conflicts.filter((c) => c.result.outcome === 'unavailable')
  const ok = conflicts.filter((c) => c.result.outcome === 'ok')

  const [accepted, setAccepted] = useState<Record<string, boolean>>(
    Object.fromEntries(clamped.map((c) => [c.result.variantId, true])),
  )

  const handleConfirm = () => {
    const acceptedQuantities: Record<string, number> = {}
    for (const c of ok) acceptedQuantities[c.result.variantId] = c.result.requestedQuantity
    for (const c of clamped) {
      if (accepted[c.result.variantId]) {
        acceptedQuantities[c.result.variantId] = c.result.maxAvailable ?? 0
      }
    }
    onConfirm(acceptedQuantities)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-neutral-800">
          Encontramos productos en tu carrito de invitado
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Algunos cambiaron de disponibilidad desde que los agregaste:
        </p>

        <div className="mt-4 space-y-3 text-sm">
          {ok.map((c) => (
            <p key={c.result.variantId} className="text-neutral-700">
              {c.guestItem.productName} — se agrega tal cual ({c.result.requestedQuantity} unidad
              {c.result.requestedQuantity === 1 ? '' : 'es'}).
            </p>
          ))}

          {clamped.map((c) => (
            <label key={c.result.variantId} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={accepted[c.result.variantId] ?? false}
                onChange={(e) => setAccepted((prev) => ({ ...prev, [c.result.variantId]: e.target.checked }))}
                className="mt-1"
              />
              <span>
                <strong>{c.guestItem.productName}</strong>: pediste {c.result.requestedQuantity}, sólo quedan{' '}
                {c.result.maxAvailable}. Dejar en {c.result.maxAvailable}.
              </span>
            </label>
          ))}

          {unavailable.map((c) => (
            <p key={c.result.variantId} className="text-neutral-500">
              {c.guestItem.productName} — ya no está disponible, no se va a agregar.
            </p>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded border border-neutral-300 px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded bg-neutral-800 px-4 py-2 text-sm text-white"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
