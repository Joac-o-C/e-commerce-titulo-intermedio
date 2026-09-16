import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminStockService } from '../../services/admin-stock.service'
import { Table } from '../../components/ui/Table'
import type { AdjustStockInput, StockItem, StockMovementType } from '../../types/stock.types'

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? fallback
}

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  reposicion: 'Reposición (suma)',
  ajuste: 'Ajuste (fija un valor)',
  merma: 'Merma (resta)',
  devolucion: 'Devolución (suma)',
}

/** CU-18 Gestionar stock (admin). */
export function AdminStock() {
  const queryClient = useQueryClient()
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false)

  const { data: page, isLoading } = useQuery({
    queryKey: ['admin', 'stock', { onlyLowStock, onlyOutOfStock }],
    queryFn: () => adminStockService.list({ onlyLowStock, onlyOutOfStock }),
  })

  const [adjusting, setAdjusting] = useState<StockItem | null>(null)
  const [adjustForm, setAdjustForm] = useState<AdjustStockInput>({
    type: 'reposicion',
    quantity: 0,
    reason: '',
  })
  const [historyOf, setHistoryOf] = useState<StockItem | null>(null)
  const [thresholdOf, setThresholdOf] = useState<StockItem | null>(null)
  const [thresholdValue, setThresholdValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: history } = useQuery({
    queryKey: ['admin', 'stock', 'history', historyOf?.variantId],
    queryFn: () => adminStockService.history(historyOf!.variantId),
    enabled: !!historyOf,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'stock'] })

  const adjustMutation = useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AdjustStockInput }) =>
      adminStockService.adjust(variantId, input),
    onSuccess: () => {
      setAdjusting(null);
      setAdjustForm({ type: 'reposicion', quantity: 0, reason: '' })
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo ajustar el stock')),
  })

  const thresholdMutation = useMutation({
    mutationFn: ({ productId, value }: { productId: string; value: number | null }) =>
      adminStockService.setThreshold(productId, value),
    onSuccess: () => {
      setThresholdOf(null)
      invalidate()
    },
    onError: (err) => setError(extractErrorMessage(err, 'No se pudo actualizar el umbral')),
  })

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-800">Stock</h1>

      <div className="mt-4 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
          />
          Sólo stock bajo
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyOutOfStock}
            onChange={(e) => setOnlyOutOfStock(e.target.checked)}
          />
          Sólo sin stock
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 rounded-lg bg-white p-4 shadow">
        {isLoading ? (
          <p>Cargando…</p>
        ) : (
          <Table
            rows={page?.items ?? []}
            rowKey={(r) => r.variantId}
            columns={[
              { header: 'Producto', render: (r) => r.productName },
              { header: 'SKU', render: (r) => r.sku },
              {
                header: 'Atributos',
                render: (r) => Object.entries(r.attributes).map(([k, v]) => `${k}: ${v}`).join(', '),
              },
              { header: 'Total', render: (r) => r.stockTotal },
              { header: 'Reservado', render: (r) => r.stockReserved },
              { header: 'Disponible', render: (r) => r.stockAvailable },
              {
                header: 'Estado',
                render: (r) =>
                  r.isOutOfStock ? (
                    <span className="text-red-600">Sin stock</span>
                  ) : r.isLowStock ? (
                    <span className="text-amber-600">Stock bajo</span>
                  ) : (
                    <span className="text-green-700">OK</span>
                  ),
              },
              {
                header: 'Acciones',
                render: (r) => (
                  <div className="flex gap-3 text-sm">
                    <button type="button" className="underline" onClick={() => setAdjusting(r)}>
                      Ajustar
                    </button>
                    <button type="button" className="underline" onClick={() => setHistoryOf(r)}>
                      Historial
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setThresholdOf(r)
                        setThresholdValue(r.productLowStockThreshold?.toString() ?? '')
                      }}
                    >
                      Umbral
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              adjustMutation.mutate({ variantId: adjusting.variantId, input: adjustForm })
            }}
            className="w-full max-w-sm space-y-3 rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 className="font-semibold text-neutral-800">Ajustar stock — {adjusting.sku}</h2>
            <p className="text-sm text-neutral-600">
              Total: {adjusting.stockTotal} · Reservado: {adjusting.stockReserved} · Disponible:{' '}
              {adjusting.stockAvailable}
            </p>
            <select
              value={adjustForm.type}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, type: e.target.value as StockMovementType })
              }
              className="w-full rounded border border-neutral-300 px-3 py-2"
            >
              {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })}
              placeholder="Cantidad"
              className="w-full rounded border border-neutral-300 px-3 py-2"
              required
            />
            <input
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="Motivo"
              className="w-full rounded border border-neutral-300 px-3 py-2"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" className="text-sm underline" onClick={() => setAdjusting(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={adjustMutation.isPending}
                className="rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </form>
        </div>
      )}

      {historyOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="font-semibold text-neutral-800">Historial — {historyOf.sku}</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
              {(history ?? []).map((m) => (
                <div key={m.id} className="border-b border-neutral-100 pb-2">
                  <p>
                    <strong>{MOVEMENT_LABELS[m.type]}</strong> · cantidad {m.quantity} → total{' '}
                    {m.resultingStockTotal}
                  </p>
                  <p className="text-neutral-500">
                    {new Date(m.createdAt).toLocaleString()} ·{' '}
                    {m.actor ? `${m.actor.firstName} ${m.actor.lastName}` : 'Sistema'}
                  </p>
                  {m.reason && <p className="text-neutral-600">{m.reason}</p>}
                </div>
              ))}
              {(history ?? []).length === 0 && <p className="text-neutral-500">Sin movimientos.</p>}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="text-sm underline" onClick={() => setHistoryOf(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {thresholdOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              thresholdMutation.mutate({
                productId: thresholdOf.productId,
                value: thresholdValue === '' ? null : Number(thresholdValue),
              })
            }}
            className="w-full max-w-sm space-y-3 rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 className="font-semibold text-neutral-800">Umbral de stock bajo — {thresholdOf.productName}</h2>
            <input
              type="number"
              min={0}
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              placeholder="Dejar vacío para usar el default (5)"
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
            <div className="flex justify-end gap-3">
              <button type="button" className="text-sm underline" onClick={() => setThresholdOf(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-neutral-800 px-4 py-2 text-sm text-white"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
