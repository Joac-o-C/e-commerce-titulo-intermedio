import { useState } from 'react'
import type { CreateAddressInput } from '../../../types/address.types'
import { TextField } from '../../../components/ui/TextField'

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

type AddressField = Exclude<keyof CreateAddressInput, 'isDefault'>

interface FieldConfig {
  field: AddressField
  label: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'tel'
  optional?: boolean
  /** Ocupa las dos columnas de la grilla en pantallas medianas o más. */
  wide?: boolean
}

const FIELDS: FieldConfig[] = [
  { field: 'alias', label: 'Nombre de la dirección', placeholder: 'Ej: Casa, Trabajo', wide: true },
  { field: 'street', label: 'Calle', placeholder: 'Ej: Av. Corrientes', autoComplete: 'address-line1' },
  { field: 'number', label: 'Número', placeholder: 'Ej: 1234', inputMode: 'numeric' },
  { field: 'floorApt', label: 'Piso / Depto', placeholder: 'Ej: 3° B', autoComplete: 'address-line2', optional: true },
  { field: 'postalCode', label: 'Código postal', placeholder: 'Ej: 5000', autoComplete: 'postal-code' },
  { field: 'city', label: 'Ciudad', autoComplete: 'address-level2' },
  { field: 'province', label: 'Provincia', autoComplete: 'address-level1' },
  { field: 'phone', label: 'Teléfono', placeholder: 'Ej: 351 555-1234', autoComplete: 'tel', inputMode: 'tel', wide: true },
  { field: 'notes', label: 'Referencias para el envío', placeholder: 'Ej: timbre roto, portón verde', optional: true, wide: true },
]

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(({ field, label, placeholder, autoComplete, inputMode, optional, wide }) => (
          <TextField
            key={field}
            label={optional ? `${label} (opcional)` : label}
            value={form[field] ?? ''}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            required={!optional}
            className={wide ? 'sm:col-span-2' : ''}
          />
        ))}
      </div>
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
          className="rounded bg-primary hover:bg-primary-hover px-4 py-2 text-on-primary disabled:opacity-50"
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
