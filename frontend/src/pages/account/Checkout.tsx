import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AddressForm } from '../../features/addresses/components/AddressForm'
import { addressesService } from '../../services/addresses.service'
import { checkoutService } from '../../services/checkout.service'
import type { CheckoutAdjustment, CheckoutProblem } from '../../types/order.types'

type ApiError = { response?: { status?: number; data?: { code?: string; message?: string | string[]; problems?: CheckoutProblem[] } } }

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as ApiError)?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? fallback
}

function describeAdjustment(a: CheckoutAdjustment): string {
  switch (a.type) {
    case 'removed':
      return `${a.productName}: se quitó del carrito (${a.reason === 'unavailable' ? 'ya no está disponible' : 'sin stock'}).`
    case 'quantity_reduced':
      return `${a.productName}: sólo quedan ${a.to} unidades, se ajustó la cantidad (tenías ${a.from}).`
    case 'price_updated':
      return `${a.productName}: el precio cambió de $${a.from} a $${a.to}.`
  }
}

function describeProblem(p: CheckoutProblem): string {
  switch (p.type) {
    case 'unavailable':
      return `${p.productName} ya no está disponible.`
    case 'price_changed':
      return `${p.productName} cambió de precio ($${p.from} → $${p.to}).`
    case 'insufficient_stock':
      return `${p.productName} ya no tiene stock suficiente.`
    case 'total_changed':
      return `El total cambió de $${p.expected} a $${p.actual}.`
  }
}

/**
 * CU-03 Realizar checkout: revalidación del carrito → dirección → envío →
 * resumen → confirmación y redirección a la pasarela. Una sola página con
 * los pasos en secuencia: cada uno se habilita cuando el anterior está
 * resuelto.
 */
export function Checkout() {
  const queryClient = useQueryClient()

  // --- Pasos 2-3: revalidación del carrito (flujos 2a/3a/3b) ---
  const revalidate = useMutation({ mutationFn: checkoutService.revalidate })
  const [adjustments, setAdjustments] = useState<CheckoutAdjustment[]>([])
  const [adjustmentsAcknowledged, setAdjustmentsAcknowledged] = useState(true)
  const runRevalidation = () =>
    revalidate.mutateAsync().then((result) => {
      setAdjustments(result.adjustments)
      // CU-03 (3a/3b): si se ajustó el carrito, hay que reconfirmar antes de seguir.
      setAdjustmentsAcknowledged(result.adjustments.length === 0)
      queryClient.setQueryData(['cart'], result.cart)
      return result
    })

  // Sólo al entrar al checkout (paso 1: "Finalizar compra"). El ref evita
  // la segunda corrida del efecto en StrictMode: esa segunda revalidación
  // ya no encontraría nada que ajustar y taparía los ajustes de la primera.
  const revalidationStarted = useRef(false)
  useEffect(() => {
    if (revalidationStarted.current) return
    revalidationStarted.current = true
    void runRevalidation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Pasos 4-6: dirección (flujos 4a/6a) ---
  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesService.list,
  })
  const [addressId, setAddressId] = useState<string | null>(null)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const selectedAddressId = addressId ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null

  const createAddress = useMutation({
    mutationFn: addressesService.create,
    onSuccess: (created) => {
      // CU-03 (4a): al volver de CU-12, la dirección nueva queda seleccionada.
      setAddressId(created.id)
      setShowAddressForm(false)
      setShippingMethodId(null)
      void queryClient.invalidateQueries({ queryKey: ['addresses'] })
    },
  })

  // --- Pasos 7-8: envío (flujo 7a) ---
  const shippingMethods = useQuery({
    queryKey: ['checkout', 'shipping-methods', selectedAddressId],
    queryFn: () => checkoutService.shippingMethods(selectedAddressId!),
    enabled: !!selectedAddressId,
    retry: false,
  })
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null)

  // --- Pasos 9-11: resumen ---
  const quote = useQuery({
    queryKey: ['checkout', 'quote', selectedAddressId, shippingMethodId],
    queryFn: () => checkoutService.quote(selectedAddressId!, shippingMethodId!),
    enabled: !!selectedAddressId && !!shippingMethodId && revalidate.isSuccess,
    retry: false,
  })

  // --- Pasos 12-18: confirmación ---
  const [staleProblems, setStaleProblems] = useState<CheckoutProblem[] | null>(null)
  const confirm = useMutation({
    mutationFn: checkoutService.confirm,
    onSuccess: ({ redirectUrl }) => {
      // CU-03 (paso 18): el carrito quedó asociado al pedido.
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      window.location.assign(redirectUrl)
    },
    onError: async (err) => {
      const data = (err as ApiError)?.response?.data
      if (data?.code === 'CHECKOUT_STALE') {
        // CU-03 (13a): se informa el motivo y se vuelve al resumen con el
        // carrito revalidado (lo que ya no alcance se ajusta ahí).
        setStaleProblems(data.problems ?? [])
        await runRevalidation()
        void queryClient.invalidateQueries({ queryKey: ['checkout', 'quote'] })
      } else if (data?.code === 'PAYMENT_GATEWAY_UNAVAILABLE') {
        // CU-03 (17a): el pedido se canceló y el carrito volvió a estar disponible.
        void queryClient.invalidateQueries({ queryKey: ['cart'] })
      }
    },
  })

  const onConfirm = () => {
    if (!selectedAddressId || !shippingMethodId || !quote.data) return
    setStaleProblems(null)
    confirm.mutate({ addressId: selectedAddressId, shippingMethodId, expectedTotal: quote.data.total })
  }

  if (revalidate.isPending || revalidate.isIdle) return <main className="px-4 py-8 text-center">Revisando tu carrito…</main>
  if (revalidate.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-600">{errorMessage(revalidate.error, 'No pudimos revisar tu carrito')}</p>
        <button type="button" onClick={() => void runRevalidation()} className="mt-2 text-sm underline">
          Reintentar
        </button>
      </main>
    )
  }

  // CU-03 (flujo 2a): carrito vacío (o vaciado por la revalidación).
  if (revalidate.data.cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        {/* Un mismo ítem puede tener dos ajustes (cantidad y precio): la key combina ambos. */}
        {adjustments.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm text-amber-800">
            {adjustments.map((a) => (
              <li key={`${a.itemId}-${a.type}`}>{describeAdjustment(a)}</li>
            ))}
          </ul>
        )}
        <p className="text-neutral-600">Tu carrito está vacío.</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">
          Ir al catálogo
        </Link>
      </main>
    )
  }

  const shippingError = shippingMethods.isError ? errorMessage(shippingMethods.error, 'No pudimos cargar los envíos') : null
  const confirmError =
    confirm.isError && !staleProblems ? errorMessage(confirm.error, 'No pudimos confirmar el pedido') : null

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Finalizar compra</h1>

      {adjustments.length > 0 && !adjustmentsAcknowledged && (
        <section className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Actualizamos tu carrito con el stock y los precios actuales:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
            {adjustments.map((a) => (
              <li key={`${a.itemId}-${a.type}`}>{describeAdjustment(a)}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-4">
            <button type="button" onClick={() => setAdjustmentsAcknowledged(true)} className="rounded bg-amber-700 px-3 py-1 text-white">
              Entendido, continuar
            </button>
            <Link to="/cart" className="self-center underline">
              Volver al carrito
            </Link>
          </div>
        </section>
      )}

      {/* Paso 1: dirección */}
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium text-neutral-800">1. Dirección de envío</h2>
        {addressesLoading && <p className="text-sm text-neutral-500">Cargando direcciones…</p>}
        {addresses.map((address) => (
          <label key={address.id} className="flex cursor-pointer items-start gap-3 rounded border border-neutral-200 p-3">
            <input
              type="radio"
              name="address"
              checked={selectedAddressId === address.id}
              onChange={() => {
                setAddressId(address.id)
                setShippingMethodId(null)
              }}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">{address.alias}</span>
              <br />
              {address.street} {address.number}
              {address.floorApt ? ` ${address.floorApt}` : ''}, {address.city}, {address.province} ({address.postalCode})
            </span>
          </label>
        ))}
        {/* CU-03 (4a): sin direcciones, o el cliente quiere usar una nueva. */}
        {showAddressForm || (!addressesLoading && addresses.length === 0) ? (
          <AddressForm
            title="Nueva dirección"
            isPending={createAddress.isPending}
            error={createAddress.isError ? errorMessage(createAddress.error, 'No pudimos guardar la dirección') : null}
            onSubmit={createAddress.mutateAsync}
            onCancel={addresses.length > 0 ? () => setShowAddressForm(false) : undefined}
          />
        ) : (
          <button type="button" onClick={() => setShowAddressForm(true)} className="text-sm underline">
            Usar una dirección nueva
          </button>
        )}
      </section>

      {/* Paso 2: envío */}
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium text-neutral-800">2. Envío</h2>
        {!selectedAddressId && <p className="text-sm text-neutral-500">Elegí una dirección primero.</p>}
        {shippingMethods.isLoading && <p className="text-sm text-neutral-500">Cargando métodos de envío…</p>}
        {/* CU-03 (6a/7a): dirección inválida o sin métodos de envío: elegir otra. */}
        {shippingError && <p className="text-sm text-red-600">{shippingError}</p>}
        {shippingMethods.data?.map((method) => (
          <label key={method.id} className="flex cursor-pointer items-start gap-3 rounded border border-neutral-200 p-3">
            <input
              type="radio"
              name="shipping"
              checked={shippingMethodId === method.id}
              onChange={() => setShippingMethodId(method.id)}
              className="mt-1"
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">{method.name}</span>
              {method.description && <span className="block text-neutral-500">{method.description}</span>}
            </span>
            <span className="text-sm font-medium">${method.cost}</span>
          </label>
        ))}
      </section>

      {/* Pasos 3-4: resumen y pago */}
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium text-neutral-800">3. Resumen</h2>
        {!shippingMethodId && <p className="text-sm text-neutral-500">Elegí un método de envío para ver el total.</p>}
        {quote.isLoading && <p className="text-sm text-neutral-500">Calculando…</p>}
        {quote.isError && <p className="text-sm text-red-600">{errorMessage(quote.error, 'No pudimos calcular el total')}</p>}
        {quote.data && (
          <>
            <ul className="divide-y divide-neutral-100 text-sm">
              {quote.data.items.map((item) => (
                <li key={item.id} className="flex justify-between py-2">
                  <span>
                    {item.productName}
                    {Object.keys(item.variantAttributes).length > 0 && (
                      <span className="text-neutral-500"> ({Object.values(item.variantAttributes).join(' / ')})</span>
                    )}{' '}
                    × {item.quantity}
                  </span>
                  <span>${item.subtotal}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-600">Subtotal</dt>
                <dd>${quote.data.subtotal}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600">Envío ({quote.data.shippingMethod.name})</dt>
                <dd>${quote.data.shippingCost}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>${quote.data.total}</dd>
              </div>
            </dl>
            <p className="text-sm text-neutral-600">
              Medio de pago: <span className="font-medium">MercadoPago</span>. Te vamos a redirigir para pagar.
            </p>
          </>
        )}

        {staleProblems && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">No pudimos confirmar: algo cambió desde que revisaste el pedido.</p>
            <ul className="mt-1 list-disc pl-5">
              {staleProblems.map((p, i) => (
                <li key={i}>{describeProblem(p)}</li>
              ))}
            </ul>
            <p className="mt-1">Revisá el resumen actualizado y confirmá de nuevo.</p>
          </div>
        )}
        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}

        <button
          type="button"
          onClick={onConfirm}
          disabled={!quote.data || !adjustmentsAcknowledged || confirm.isPending || confirm.isSuccess}
          className="w-full rounded bg-neutral-800 py-2 text-white disabled:opacity-50"
        >
          {confirm.isPending || confirm.isSuccess ? 'Redirigiendo a MercadoPago…' : 'Confirmar y pagar'}
        </button>
      </section>
    </main>
  )
}
