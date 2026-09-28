import type { Product } from './entities/product.entity.js';

/**
 * Regla única de "producto comprable": activo (sin baja lógica, CU-16) y
 * publicado. La usan el carrito (CU-02/11), el checkout (CU-03 paso 13) y
 * el reintento de pago (CU-13 7b); si la regla cambia (p. ej. variantes
 * con baja propia), cambia sólo acá.
 */
export function isPurchasable(product: Pick<Product, 'isActive' | 'isPublished'> | null | undefined): boolean {
  return !!product && product.isActive && product.isPublished;
}
