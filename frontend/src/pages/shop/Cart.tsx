import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { QuantityStepper } from '../../components/ui/QuantityStepper'
import { Skeleton } from '../../components/ui/Skeleton'
import { useCart } from '../../features/cart/hooks/useCart'
import { useCartMutations } from '../../features/cart/hooks/useCartMutations'
import { useGuestCart } from '../../features/cart/hooks/useGuestCart'
import { useGuestCartView } from '../../features/cart/hooks/useGuestCartView'
import { useAuthStore } from '../../store/auth.store'
import { formatPrice, plural } from '../../lib/format'

/** CU-11 Modificar o quitar ítem del carrito (vista + acciones). */
export function Cart() {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated')
  const [confirmClear, setConfirmClear] = useState(false)

  const { data: cart, isLoading: cartLoading } = useCart()
  const { updateItem, removeItem, clear } = useCartMutations()

  const guest = useGuestCart()
  const guestView = useGuestCartView()

  /**
   * CU-11: el selector ya no deja pasar del stock disponible (el + se
   * desactiva), y si se escribe un número mayor se lleva al máximo.
   */
  const requestQuantity = (apply: (quantity: number) => unknown, quantity: number, stockAvailable: number) => {
    const next = Math.min(quantity, stockAvailable)
    if (next < 1 || !Number.isInteger(next)) return
    apply(next)
  }

  const clearDialog = (onConfirm: () => void) => (
    <ConfirmDialog
      open={confirmClear}
      title="Vaciar el carrito"
      description="Se van a quitar todos los ítems. Esta acción no se puede deshacer."
      confirmLabel="Vaciar"
      onConfirm={() => {
        onConfirm()
        setConfirmClear(false)
      }}
      onCancel={() => setConfirmClear(false)}
    />
  )

  if (isAuthenticated) {
    if (cartLoading) return <CartSkeleton />

    const items = cart?.items ?? []
    // CU-11 (flujo 2a): carrito vacío.
    if (items.length === 0) return <EmptyCart />

    return (
      <CartLayout
        dialog={clearDialog(() => clear.mutate())}
        summary={
          <CartSummary totalItems={cart?.totalItems ?? 0} totalAmount={cart?.totalAmount ?? '0'} onClear={() => setConfirmClear(true)}>
            {/* CU-03 (paso 1). */}
            <Link to="/checkout" className="block w-full rounded bg-primary py-3 text-center font-medium text-on-primary hover:bg-primary-hover">
              Finalizar compra
            </Link>
          </CartSummary>
        }
      >
        {items.map((item) => (
          <CartItemRow
            key={item.id}
            productId={item.productId}
            name={item.productName}
            imageUrl={item.mainImageUrl}
            attributes={item.variantAttributes}
            quantity={item.quantity}
            subtotal={item.subtotal}
            unitPrice={item.unitPriceSnapshot}
            isUnavailable={item.isUnavailable}
            isOutOfStock={item.isOutOfStock}
            stockAvailable={item.stockAvailable}
            onQuantityChange={(q) =>
              requestQuantity((n) => updateItem.mutate({ itemId: item.id, quantity: n }), q, item.stockAvailable)
            }
            onRemove={() => removeItem.mutate(item.id)}
          />
        ))}
      </CartLayout>
    )
  }

  // --- Visitante: carrito de invitado (Zustand + localStorage) ---
  if (guestView.isLoading) return <CartSkeleton />

  if (guestView.view.length === 0) return <EmptyCart />

  return (
    <CartLayout
      dialog={clearDialog(() => guest.clear())}
      summary={
        <CartSummary totalItems={guestView.totalItems} totalAmount={guestView.totalAmount} onClear={() => setConfirmClear(true)}>
          {/* CU-03: no hay checkout de invitado. Al iniciar sesión se fusiona el
              carrito (CU-06) y se sigue directo al checkout. */}
          <Link
            to="/login"
            state={{ from: '/checkout' }}
            className="block w-full rounded bg-primary py-3 text-center font-medium text-on-primary hover:bg-primary-hover"
          >
            Iniciá sesión para comprar
          </Link>
          <p className="mt-2 text-center text-xs text-neutral-500">Tu carrito se guarda al iniciar sesión.</p>
        </CartSummary>
      }
    >
      {guestView.view.map((item) => (
        <CartItemRow
          key={item.variantId}
          productId={item.productId}
          name={item.productName}
          imageUrl={item.mainImageUrl}
          attributes={item.variantAttributes}
          quantity={item.quantity}
          subtotal={item.subtotal}
          unitPrice={item.unitPrice}
          isUnavailable={item.isUnavailable}
          isOutOfStock={item.isOutOfStock}
          stockAvailable={item.stockAvailable}
          onQuantityChange={(q) => requestQuantity((n) => guest.updateQuantity(item.variantId, n), q, item.stockAvailable)}
          onRemove={() => guest.removeItem(item.variantId)}
        />
      ))}
    </CartLayout>
  )
}

function CartLayout({ children, summary, dialog }: { children: ReactNode; summary: ReactNode; dialog: ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-800">Tu carrito</h1>
        <Link to="/" className="text-sm text-neutral-600 underline hover:text-neutral-900">
          Seguir comprando
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <ul className="space-y-3">{children}</ul>
        <div className="lg:sticky lg:top-6">{summary}</div>
      </div>
      {dialog}
    </main>
  )
}

interface CartItemRowProps {
  productId: string
  name: string
  imageUrl: string | null
  attributes: Record<string, string>
  quantity: number
  subtotal: string
  unitPrice: string
  isUnavailable: boolean
  isOutOfStock: boolean
  stockAvailable: number
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

function CartItemRow({
  productId,
  name,
  imageUrl,
  attributes,
  quantity,
  subtotal,
  unitPrice,
  isUnavailable,
  isOutOfStock,
  stockAvailable,
  onQuantityChange,
  onRemove,
}: CartItemRowProps) {
  const variantLabel = Object.values(attributes).join(' / ')

  return (
    <li className={`rounded-lg border border-neutral-200 bg-white p-4 ${isUnavailable ? 'opacity-70' : ''}`}>
      <div className="flex gap-4">
        <Link to={`/products/${productId}`} className="h-20 w-20 shrink-0 overflow-hidden rounded bg-neutral-100" tabIndex={-1} aria-hidden="true">
          {imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover" />}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/products/${productId}`} className="font-medium text-neutral-800 hover:underline">
                {name}
              </Link>
              {variantLabel && <p className="text-sm text-neutral-500">{variantLabel}</p>}
              {quantity > 1 && <p className="text-xs text-neutral-500">{formatPrice(unitPrice)} c/u</p>}
              {isUnavailable && <p className="mt-1 text-sm text-red-600">Ya no está disponible.</p>}
              {!isUnavailable && isOutOfStock && <p className="mt-1 text-sm text-red-600">Sin stock por ahora.</p>}
            </div>
            <p className="shrink-0 font-semibold text-neutral-900">{formatPrice(subtotal)}</p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <QuantityStepper
              size="sm"
              value={quantity}
              onChange={onQuantityChange}
              max={stockAvailable}
              disabled={isUnavailable}
              label={`Cantidad de ${name}`}
            />
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 rounded px-2 py-1 text-sm text-neutral-600 hover:bg-red-50 hover:text-red-700"
            >
              <TrashIcon />
              Quitar
            </button>
          </div>
        </div>
      </div>

    </li>
  )
}

function CartSummary({
  totalItems,
  totalAmount,
  onClear,
  children,
}: {
  totalItems: number
  totalAmount: string
  onClear: () => void
  children: ReactNode
}) {
  return (
    <section aria-label="Resumen del carrito" className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-neutral-600">{plural(totalItems, 'producto', 'productos')}</p>
        <p className="text-xl font-semibold text-neutral-900">{formatPrice(totalAmount)}</p>
      </div>
      <p className="mt-1 text-xs text-neutral-500">El envío se calcula en el siguiente paso.</p>
      <div className="mt-4">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 w-full text-center text-sm text-neutral-500 underline hover:text-neutral-800"
      >
        Vaciar carrito
      </button>
    </section>
  )
}

function EmptyCart() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <BagIcon />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-neutral-800">Tu carrito está vacío</h1>
      <p className="mt-1 text-sm text-neutral-500">Cuando agregues productos, los vas a ver acá.</p>
      <Link to="/" className="mt-6 inline-block rounded bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover">
        Ir al catálogo
      </Link>
    </main>
  )
}

function CartSkeleton() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Cargando carrito">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-4">
              <Skeleton className="h-20 w-20" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="mt-3 h-9 w-28" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </main>
  )
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  )
}
