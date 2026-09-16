import { apiClient } from './api-client'
import type { Address, CreateAddressInput, UpdateAddressInput } from '../types/address.types'

export const addressesService = {
  async list() {
    const { data } = await apiClient.get<Address[]>('/users/me/addresses')
    return data
  },

  async create(input: CreateAddressInput) {
    const { data } = await apiClient.post<Address>('/users/me/addresses', input)
    return data
  },

  async update(id: string, input: UpdateAddressInput) {
    const { data } = await apiClient.patch<Address>(`/users/me/addresses/${id}`, input)
    return data
  },

  remove(id: string, newDefaultId?: string) {
    return apiClient.delete(`/users/me/addresses/${id}`, {
      params: newDefaultId ? { newDefaultId } : undefined,
    })
  },

  async markDefault(id: string) {
    const { data } = await apiClient.patch<Address>(`/users/me/addresses/${id}/default`)
    return data
  },
}
