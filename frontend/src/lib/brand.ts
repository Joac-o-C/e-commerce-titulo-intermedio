/**
 * Nombre de la tienda que se muestra en el header, el footer y la pestaña.
 * Se configura con `VITE_STORE_NAME` en el `.env`; si falta, queda "Tienda".
 */
export const STORE_NAME = import.meta.env.VITE_STORE_NAME?.trim() || 'Tienda'
