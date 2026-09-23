import { useState } from 'react'
import type { CreateAddressInput } from '../../../types/address.types'

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

const FIELDS = [
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

interface AddressFormProps {
  title?: string
  isPending: boolean
  error?: string | null
  /** Resuelve si se guardó: recién ahí se limpia el formulario. */
  onSubmit: (input: CreateAddressInput) => Promise<unknown>
  onCancel?: () => void
}

/**
 * Alta de dirección (CU-12). La usan la libreta de direcciones y el paso
 * de dirección del checkout (CU-03 flujo 4a, «extend» de CU-12).
 */
export function AddressForm({ title = 'Agregar dirección', isPending, error, onSubmit, onCancel }: AddressFormProps) {
  const [form, setForm] = useState<CreateAddressInput>(emptyForm)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await onSubmit(form)
      setForm(emptyForm)
    } catch {
      // El error lo muestra el llamador vía `error`; el formulario conserva lo tipeado.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-neutral-300 bg-white p-4">
      <h2 className="font-medium text-neutral-800">{title}</h2>
      {FIELDS.map(([field, label]) => (
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-800 px-4 py-2 text-white disabled:opacity-50"
        >
          Guardar dirección
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-neutral-600 underline">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
