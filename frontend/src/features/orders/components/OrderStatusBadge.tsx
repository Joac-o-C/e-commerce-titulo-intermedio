import type { OrderStatus } from '../../../types/order.types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '../order-labels'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_TONES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}
