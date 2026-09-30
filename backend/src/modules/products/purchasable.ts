import type { Product } from './entities/product.entity.js';
import type { ProductVariant } from './entities/product-variant.entity.js';

/**
 * Regla única de "producto comprable": activo (sin baja lógica, CU-16) y
 * publicado. La usan el carrito (CU-02/11), el checkout (CU-03 paso 13) y
 * el reintento de pago (CU-13 7b). Si se pasa la variante, además no tiene
 * que estar dada de baja (CU-16: quitada de la lista al editar).
 */
export function isPurchasable(
  product: Pick<Product, 'isActive' | 'isPublished'> | null | undefined,
  variant?: Pick<ProductVariant, 'isActive'> | null,
): boolean {
  return !!product && product.isActive && product.isPublished && (variant === undefined || !!variant?.isActive);
}

/** Variantes vigentes de un producto, en el orden en que las ve el Cliente (CU-09). */
export function activeVariantsInOrder<T extends Pick<ProductVariant, 'isActive' | 'position'>>(variants: T[]): T[] {
  return variants.filter((v) => v.isActive).sort((a, b) => a.position - b.position);
}
