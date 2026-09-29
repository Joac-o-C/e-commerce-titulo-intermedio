import { useState } from 'react'
import type { AdminCancelReason, AdminOrderDetail } from '../../../types/admin-orders.types'
import { ADMIN_CANCEL_REASON_LABELS } from '../admin-labels'

interface Props {
  order: AdminOrderDetail
  pending: boolean
  error: string | null
  onConfirm: (input: { reason: AdminCancelReason; detail?: string }) => void
  onClose: () => void
}

/**
 * CU-19 (flujo 5a): consecuencias de cancelar según el estado actual
 * (decisiones de la Fase 6) y motivo obligatorio de una lista + detalle.
 */
export function AdminCancelOrderDialog({ order, pending, error, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState<AdminCancelReason | ''>('')
  const [detail, setDetail] = useState('')
  const dispatched = order.status === 'despachado'
  const refundAmount = dispatched ? order.subtotal : order.total

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-neutral-800">¿Cancelar el pedido #{order.orderNumber}?</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600">
          {dispatched ? (
            <li>
              El pedido ya se despachó: el stock <strong>no</strong> se reingresa solo. Cuando vuelva el paquete, registralo en
              Stock.
            </li>
          ) : (
            <li>Se libera la reserva o se reingresa el stock de los productos.</li>
          )}
          {order.paidAt ? (
            <li>
              Se reembolsa ${refundAmount} al Cliente
              {dispatched && ` (el total sin el envío de $${order.shippingCost})`}.
            </li>
          ) : (
            <li>No hay pago acreditado: no hay nada que reembolsar.</li>
          )}
          <li>Se le avisa al Cliente por correo. Esta acción no se puede deshacer.</li>
        </ul>

        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Motivo</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as AdminCancelReason | '')}
            className="rounded border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Elegí un motivo</option>
            {Object.entries(ADMIN_CANCEL_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Detalle (opcional)</span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className="rounded border border-neutral-300 px-4 py-2 text-sm">
            Volver
          </button>
          <button
            type="button"
            onClick={() => reason && onConfirm({ reason, ...(detail.trim() ? { detail: detail.trim() } : {}) })}
            disabled={pending || !reason}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
