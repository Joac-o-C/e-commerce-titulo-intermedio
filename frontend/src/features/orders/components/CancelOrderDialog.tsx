import { useState } from 'react'
import type { OrderDetail } from '../../../types/order.types'
import { formatDateTime } from '../order-labels'

interface CancelOrderDialogProps {
  order: OrderDetail
  pending: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

/**
 * CU-14 (paso 3): muestra las consecuencias de cancelar y pide
 * confirmación, con un motivo opcional.
 */
export function CancelOrderDialog({ order, pending, onConfirm, onClose }: CancelOrderDialogProps) {
  const [reason, setReason] = useState('')
  const paid = order.payment.status === 'aprobado'
  const deadline = order.actions.cancel.allowed ? order.actions.cancel.deadline : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-neutral-800">¿Cancelar el pedido #{order.orderNumber}?</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>Liberamos los productos que teníamos reservados para vos.</li>
          {paid ? (
            <li>
              Te devolvemos ${order.total} al mismo medio de pago. El reembolso puede demorar unos días en verse reflejado.
            </li>
          ) : (
            <li>No se te cobra nada: el pedido todavía no tenía un pago acreditado.</li>
          )}
          <li>Esta acción no se puede deshacer.</li>
        </ul>
        {deadline && (
          <p className="mt-3 text-xs text-neutral-500">Plazo para cancelarlo por tu cuenta: {formatDateTime(deadline)}</p>
        )}
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Motivo (opcional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className="rounded border border-neutral-300 px-4 py-2 text-sm">
            Volver
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
