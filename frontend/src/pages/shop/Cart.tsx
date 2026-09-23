import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useCart } from '../../features/cart/hooks/useCart'
import { useCartMutations } from '../../features/cart/hooks/useCartMutations'
import { useGuestCart } from '../../features/cart/hooks/useGuestCart'
import { useGuestCartView } from '../../features/cart/hooks/useGuestCartView'
import { useAuthStore } from '../../store/auth.store'
import type { InsufficientStockError } from '../../types/cart.types'

interface ExcessPrompt {
  key: string
  requested: number
  max: number
}

/** Lanzada por el flujo de invitado para reusar el mismo prompt de "dejar esa cantidad o cancelar" que el backend. */
class InsufficientStockClientError extends Error {
  maxAvailable: number

  constructor(maxAvailable: number) {
    super('No hay stock suficiente')
    this.maxAvailable = maxAvailable
  }
}

function readMaxAvailable(err: unknown): number | null {
  if (err instanceof InsufficientStockClientError) return err.maxAvailable
  const data = (err as { response?: { data?: InsufficientStockError } })?.response?.data
  return data?.code === 'INSUFFICIENT_STOCK' ? data.maxAvailable : null
}

/** CU-11 Modificar o quitar ítem del carrito (vista + acciones). */
export function Cart() {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated')
  const [confirmClear, setConfirmClear] = useState(false)
  const [excessPrompt, setExcessPrompt] = useState<ExcessPrompt | null>(null)

  const { data: cart, isLoading: cartLoading } = useCart()
  const { updateItem, removeItem, clear } = useCartMutations()

  const guest = useGuestCart()
  const guestView = useGuestCartView()

  const requestQuantity = async (key: string, apply: (quantity: number) => Promise<unknown>, quantity: number) => {
    if (quantity < 1 || !Number.isInteger(quantity)) return
    try {
      await apply(quantity)
      setExcessPrompt(null)
    } catch (err) {
      const max = readMaxAvailable(err)
      // CU-11 (flujo 6a): informar el máximo, nunca ajustar solo.
      if (max !== null) setExcessPrompt({ key, requested: quantity, max })
      else throw err
    }
  }

  if (isAuthenticated) {
    if (cartLoading) return <main className="px-4 py-8 text-center">Cargando…</main>

    const items = cart?.items ?? []
    // CU-11 (flujo 2a): carrito vacío.
    if (items.length === 0) {
      return (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-neutral-600">Tu carrito está vacío.</p>
          <Link to="/" className="mt-2 inline-block text-sm underline">
            Ir al catálogo
          </Link>
        </main>
      )
    }

    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-neutral-800">Tu carrito</h1>
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-neutral-800">{item.productName}</p>
                  {Object.keys(item.variantAttributes).length > 0 && (
                    <p className="text-sm text-neutral-500">{Object.values(item.variantAttributes).join(' / ')}</p>
                  )}
                  {item.isUnavailable && (
                    <p className="mt-1 text-sm text-red-600">Ya no está disponible.</p>
                  )}
                  {!item.isUnavailable && item.isOutOfStock && (
                    <p className="mt-1 text-sm text-red-600">Sin stock por ahora.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem.mutate(item.id)}
                  className="text-sm text-neutral-500 underline"
                >
                  Quitar
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">Cantidad</span>
                  <input
                    // `key` fuerza a remontar el input con el nuevo
                    // `defaultValue` cuando la cantidad cambia por otra vía
                    // (ej. "Dejar en {max}" del prompt de abajo) — sin esto
                    // el valor mostrado queda pegado al último tipeado.
                    key={item.quantity}
                    type="number"
                    min={1}
                    defaultValue={item.quantity}
                    disabled={item.isUnavailable}
                    onBlur={(e) =>
                      requestQuantity(item.id, (q) => updateItem.mutateAsync({ itemId: item.id, quantity: q }), Number(e.target.value))
                    }
                    className="w-20 rounded border border-neutral-300 px-2 py-1"
                  />
                </div>
                <p className="font-medium text-neutral-800">${item.subtotal}</p>
              </div>

              {excessPrompt?.key === item.id && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                  <p>
                    Sólo quedan {excessPrompt.max} unidades disponibles (pediste {excessPrompt.requested}).
                  </p>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        updateItem.mutate({ itemId: item.id, quantity: excessPrompt.max })
                        setExcessPrompt(null)
                      }}
                    >
                      Dejar en {excessPrompt.max}
                    </button>
                    <button type="button" className="underline" onClick={() => setExcessPrompt(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4">
          <button type="button" onClick={() => setConfirmClear(true)} className="text-sm text-neutral-500 underline">
            Vaciar carrito
          </button>
          <div className="text-right">
            <p className="text-sm text-neutral-500">{cart?.totalItems} ítem(s)</p>
            <p className="text-lg font-semibold text-neutral-800">${cart?.totalAmount}</p>
          </div>
        </div>

        {/* CU-03 (paso 1). */}
        <div className="mt-4 text-right">
          <Link to="/checkout" className="inline-block rounded bg-neutral-800 px-6 py-2 text-white">
            Finalizar compra
          </Link>
        </div>

        <ConfirmDialog
          open={confirmClear}
          title="Vaciar el carrito"
          description="Se van a quitar todos los ítems. Esta acción no se puede deshacer."
          confirmLabel="Vaciar"
          onConfirm={() => {
            clear.mutate()
            setConfirmClear(false)
          }}
          onCancel={() => setConfirmClear(false)}
        />
      </main>
    )
  }

  // --- Visitante: carrito de invitado (Zustand + localStorage) ---
  if (guestView.isLoading) return <main className="px-4 py-8 text-center">Cargando…</main>

  if (guestView.view.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-neutral-600">Tu carrito está vacío.</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">
          Ir al catálogo
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Tu carrito</h1>
      <div className="mt-6 space-y-4">
        {guestView.view.map((item) => (
          <div key={item.variantId} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-neutral-800">{item.productName}</p>
                {Object.keys(item.variantAttributes).length > 0 && (
                  <p className="text-sm text-neutral-500">{Object.values(item.variantAttributes).join(' / ')}</p>
                )}
                {item.isUnavailable && <p className="mt-1 text-sm text-red-600">Ya no está disponible.</p>}
                {!item.isUnavailable && item.isOutOfStock && (
                  <p className="mt-1 text-sm text-red-600">Sin stock por ahora.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => guest.removeItem(item.variantId)}
                className="text-sm text-neutral-500 underline"
              >
                Quitar
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">Cantidad</span>
                <input
                  key={item.quantity}
                  type="number"
                  min={1}
                  defaultValue={item.quantity}
                  disabled={item.isUnavailable}
                  onBlur={(e) =>
                    requestQuantity(item.variantId, async (q) => {
                      const result = await guest.updateQuantity(item.variantId, q)
                      if (result.outcome === 'insufficient_stock') {
                        throw new InsufficientStockClientError(result.maxAvailable ?? 0)
                      }
                    }, Number(e.target.value))
                  }
                  className="w-20 rounded border border-neutral-300 px-2 py-1"
                />
              </div>
              <p className="font-medium text-neutral-800">${item.subtotal}</p>
            </div>

            {excessPrompt?.key === item.variantId && (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                <p>
                  Sólo quedan {excessPrompt.max} unidades disponibles (pediste {excessPrompt.requested}).
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => guest.updateQuantity(item.variantId, excessPrompt.max).then(() => setExcessPrompt(null))}
                  >
                    Dejar en {excessPrompt.max}
                  </button>
                  <button type="button" className="underline" onClick={() => setExcessPrompt(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4">
        <button type="button" onClick={() => setConfirmClear(true)} className="text-sm text-neutral-500 underline">
          Vaciar carrito
        </button>
        <div className="text-right">
          <p className="text-sm text-neutral-500">{guestView.totalItems} ítem(s)</p>
          <p className="text-lg font-semibold text-neutral-800">${guestView.totalAmount}</p>
        </div>
      </div>

      {/* CU-03: no hay checkout de invitado. Al iniciar sesión se fusiona el
          carrito (CU-06) y se sigue directo al checkout. */}
      <div className="mt-4 text-right">
        <Link
          to="/login"
          state={{ from: '/checkout' }}
          className="inline-block rounded bg-neutral-800 px-6 py-2 text-white"
        >
          Iniciá sesión para finalizar la compra
        </Link>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Vaciar el carrito"
        description="Se van a quitar todos los ítems. Esta acción no se puede deshacer."
        confirmLabel="Vaciar"
        onConfirm={() => {
          guest.clear()
          setConfirmClear(false)
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </main>
  )
}
