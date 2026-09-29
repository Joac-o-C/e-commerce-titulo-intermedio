import type {
  CustomerPaymentStatus,
  OrderDetail,
  OrderStatus,
  RefundStatus,
  ReplacementStatus,
  ReturnRequestStatus,
  ReturnRequestType,
} from './order.types'

type Person = { id: string; name: string } | null
type Tracking = { carrier: string | null; number: string | null; dispatchedAt: string | null }

/** Orden del listado admin (decisión de la Fase 6: fecha, total y estado). */
export type AdminOrderSort = 'fecha_desc' | 'fecha_asc' | 'total_desc' | 'total_asc' | 'estado'

/** CU-19 (paso 2): filtros del listado; también los usa la exportación a CSV (2a). */
export interface AdminOrderFilters {
  page?: number
  number?: number
  customer?: string
  status?: OrderStatus
  paymentStatus?: CustomerPaymentStatus
  from?: string
  to?: string
  refunds?: 'requieren_gestion'
  sort?: AdminOrderSort
}

export interface AdminOrderRow {
  id: string
  orderNumber: number
  createdAt: string
  customer: { name: string; email: string }
  itemCount: number
  total: string
  status: OrderStatus
  paymentStatus: CustomerPaymentStatus
}

export interface AdminOrderPage {
  items: AdminOrderRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  refundsNeedingAttention: number
}

export type RefundOrigin = 'CU-05' | 'CU-14' | 'CU-19' | 'CU-22'

export interface AdminRefund {
  id: string
  amount: string
  status: RefundStatus
  originCu: RefundOrigin
  reason: string | null
  externalRefundId: string | null
  lastError: string | null
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
  /** Alerta de CU-21 (4a/5a): rechazado o pendiente de gestión. */
  needsAttention: boolean
}

/** CU-19 (paso 4): detalle completo, con lo que el Cliente no ve. */
export interface AdminOrderDetail {
  id: string
  orderNumber: number
  status: OrderStatus
  cancellationCause: string | null
  createdAt: string
  paidAt: string | null
  deliveredAt: string | null
  reservationExpiresAt: string | null
  customer: { id: string; name: string; email: string }
  subtotal: string
  shippingCost: string
  total: string
  shippingMethod: { id: string; name: string; cost: string }
  shippingAddress: OrderDetail['shippingAddress']
  tracking: Tracking
  items: {
    id: string
    productId: string
    variantId: string
    productName: string
    variantAttributes: Record<string, string>
    quantity: number
    unitPrice: string
    subtotal: string
    stockCommitted: boolean
  }[]
  paymentStatus: CustomerPaymentStatus
  payments: {
    id: string
    externalPaymentId: string
    status: string
    amount: string
    method: string | null
    installments: number | null
    processedAt: string | null
  }[]
  refunds: AdminRefund[]
  statusHistory: { from: OrderStatus | null; to: OrderStatus; at: string; reason: string | null; actor: Person }[]
  notes: { id: string; text: string; createdAt: string; author: Person }[]
  returnRequests: {
    id: string
    requestNumber: number
    type: ReturnRequestType
    status: ReturnRequestStatus
    createdAt: string
    itemCount: number
  }[]
  actions: { transitions: OrderStatus[]; canCancel: boolean; canEditTracking: boolean }
}

/** CU-19 (flujo 5a): motivos de cancelación del Administrador (decisión de la Fase 6). */
export type AdminCancelReason =
  | 'falta_stock'
  | 'sospecha_fraude'
  | 'pago_abandonado'
  | 'pedido_cliente_fuera_de_plazo'
  | 'otro'

export interface TrackingInput {
  carrier?: string
  number?: string
  dispatchedAt?: string
}

/** Contadores de la barra de admin (decisión de la Fase 6). */
export interface AdminSummary {
  refundsNeedingAttention: number
  returnsPending: number
  returnsOverdue: number
  replacementsPending: number
}

// ─── CU-22 ──────────────────────────────────────────────────────────────

export type ReturnItemCondition = 'ok' | 'danado'

export interface AdminReturnFilters {
  page?: number
  status?: ReturnRequestStatus
  reception?: 'vencidas'
  replacements?: 'pendientes'
}

export interface AdminReturnRow {
  id: string
  requestNumber: number
  type: ReturnRequestType
  status: ReturnRequestStatus
  createdAt: string
  order: { id: string; orderNumber: number }
  customer: { name: string; email: string }
  units: number
  receptionDeadline: string | null
  receptionOverdue: boolean
}

export interface AdminReturnPage {
  items: AdminReturnRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counters: { pending: number; overdue: number }
}

export interface ReplacementOption {
  id: string
  attributes: Record<string, string>
  stockAvailable: number
}

export interface AdminReturnDetail {
  id: string
  requestNumber: number
  type: ReturnRequestType
  status: ReturnRequestStatus
  reason: string
  createdAt: string
  approvedAt: string | null
  receivedAt: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  internalNote: string | null
  refundId: string | null
  receptionDeadline: string | null
  receptionOverdue: boolean
  order: { id: string; orderNumber: number; status: OrderStatus; deliveredAt: string | null }
  customer: { name: string; email: string }
  photos: string[]
  items: {
    orderItemId: string
    productName: string
    variantAttributes: Record<string, string>
    purchased: number
    unitPrice: string
    quantityRequested: number
    quantityApproved: number | null
    quantityReceived: number | null
    condition: ReturnItemCondition | null
    refundApproved: boolean | null
    replacementOptions: ReplacementOption[]
  }[]
  replacements: {
    id: string
    orderItemId: string
    productName: string
    variantAttributes: Record<string, string>
    quantity: number
    status: ReplacementStatus
    tracking: Tracking
  }[]
  actions: { canApproveOrReject: boolean; canReceive: boolean; canDispatchReplacement: boolean }
}

export interface ApproveReturnInput {
  items: { orderItemId: string; quantityApproved: number }[]
  internalNote?: string
  rejectionReason?: string
}

export interface ReceiveReturnInput {
  items: {
    orderItemId: string
    quantityReceived: number
    condition: ReturnItemCondition
    refund?: boolean
    replacementVariantId?: string
  }[]
  internalNote?: string
  resolutionNote?: string
}

// ─── Métodos de envío (alcance extra de la Fase 6) ─────────────────────

export interface AdminShippingMethod {
  id: string
  name: string
  description: string | null
  cost: string
  isActive: boolean
}

export interface ShippingMethodInput {
  name: string
  description?: string | null
  cost: number
}

// ─── Pasarela simulada (PAYMENT_GATEWAY=fake) ──────────────────────────

export interface FakeGatewayPending {
  payments: { id: string; amount: string; status: string; order: { id: string; orderNumber: number | null } | null }[]
  refunds: {
    id: string
    paymentId: string
    amount: string
    status: string
    order: { id: string; orderNumber: number | null } | null
  }[]
}
