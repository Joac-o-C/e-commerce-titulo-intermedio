export interface Address {
  id: string
  userId: string
  alias: string
  street: string
  number: string
  floorApt: string | null
  city: string
  province: string
  postalCode: string
  phone: string
  notes: string | null
  isDefault: boolean
  isActive: boolean
}

export type CreateAddressInput = Omit<
  Address,
  'id' | 'userId' | 'isActive'
>

export type UpdateAddressInput = Partial<CreateAddressInput>
