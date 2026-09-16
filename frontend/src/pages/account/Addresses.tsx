import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addressesService } from '../../services/addresses.service'
import type { Address, CreateAddressInput } from '../../types/address.types'

const emptyForm: CreateAddressInput = {
  alias: '',
  street: '',
  number: '',
  floorApt: '',
  city: '',
  province: '',
  postalCode: '',
  phone: '',
  notes: '',
  isDefault: false,
}

/** CU-12 Gestionar direcciones. */
export function Addresses() {
  const queryClient = useQueryClient()
  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesService.list,
  })

  const [form, setForm] = useState<CreateAddressInput>(emptyForm)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [replacementDefaultId, setReplacementDefaultId] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses'] })

  const createMutation = useMutation({
    mutationFn: addressesService.create,
    onSuccess: () => {
      setForm(emptyForm)
      invalidate()
    },
  })

  const removeMutation = useMutation({
    mutationFn: ({ id, newDefaultId }: { id: string; newDefaultId?: string }) =>
      addressesService.remove(id, newDefaultId),
    onSuccess: () => {
      setPendingDeleteId(null)
      setReplacementDefaultId('')
      invalidate()
    },
  })

  const markDefaultMutation = useMutation({
    mutationFn: addressesService.markDefault,
    onSuccess: invalidate,
  })

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault()
    createMutation.mutate(form)
  }

  // CU-12 (flujo 3b): si la que se borra es la predeterminada y quedan
  // otras, primero hay que elegir cuál pasa a serlo.
  const handleDelete = (address: Address) => {
    const others = addresses.filter((a) => a.id !== address.id)
    if (address.isDefault && others.length > 0) {
      setPendingDeleteId(address.id)
      return
    }
    removeMutation.mutate({ id: address.id })
  }

  if (isLoading) return <p className="p-6">Cargando direcciones...</p>

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-neutral-800">Mis direcciones</h1>

      <ul className="space-y-3">
        {addresses.map((address) => (
          <li key={address.id} className="rounded border border-neutral-300 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {address.alias} {address.isDefault && <span className="text-xs text-green-700">(predeterminada)</span>}
                </p>
                <p className="text-sm text-neutral-600">
                  {address.street} {address.number}, {address.city}, {address.province} ({address.postalCode})
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                {!address.isDefault && (
                  <button
                    onClick={() => markDefaultMutation.mutate(address.id)}
                    className="underline"
                  >
                    Marcar predeterminada
                  </button>
                )}
                <button onClick={() => handleDelete(address)} className="text-red-600 underline">
                  Eliminar
                </button>
              </div>
            </div>

            {pendingDeleteId === address.id && (
              <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                <p className="text-sm text-neutral-700">
                  Es tu dirección predeterminada. Elegí cuál pasa a serlo antes de eliminarla:
                </p>
                <select
                  value={replacementDefaultId}
                  onChange={(e) => setReplacementDefaultId(e.target.value)}
                  className="w-full rounded border border-neutral-300 px-2 py-1"
                >
                  <option value="">Elegir dirección</option>
                  {addresses
                    .filter((a) => a.id !== address.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.alias}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!replacementDefaultId}
                  onClick={() => removeMutation.mutate({ id: address.id, newDefaultId: replacementDefaultId })}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Confirmar eliminación
                </button>
              </div>
            )}
          </li>
        ))}
        {addresses.length === 0 && <p className="text-neutral-600">Todavía no cargaste direcciones.</p>}
      </ul>

      <form onSubmit={handleCreate} className="space-y-3 rounded border border-neutral-300 p-4">
        <h2 className="font-medium text-neutral-800">Agregar dirección</h2>
        {(
          [
            ['alias', 'Alias'],
            ['street', 'Calle'],
            ['number', 'Número'],
            ['floorApt', 'Piso/Depto (opcional)'],
            ['city', 'Ciudad'],
            ['province', 'Provincia'],
            ['postalCode', 'Código postal'],
            ['phone', 'Teléfono'],
            ['notes', 'Referencias (opcional)'],
          ] as const
        ).map(([field, label]) => (
          <input
            key={field}
            value={form[field] ?? ''}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            placeholder={label}
            required={!['floorApt', 'notes'].includes(field)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
        ))}
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.isDefault ?? false}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          Marcar como predeterminada
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-neutral-800 px-4 py-2 text-white disabled:opacity-50"
        >
          Guardar dirección
        </button>
      </form>
    </main>
  )
}
