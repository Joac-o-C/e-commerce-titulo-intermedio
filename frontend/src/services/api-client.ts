import axios from 'axios'

/**
 * Instancia única de axios para hablar con el backend NestJS. Cada
 * servicio de dominio (auth, catálogo, carrito, pedidos...) construye sus
 * llamadas sobre esta instancia en vez de crear clientes HTTP propios.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})
