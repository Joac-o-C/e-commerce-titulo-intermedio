import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { fromCents, toCents } from '../../common/money.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ProductsService } from '../products/products.service.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart, CartStatus } from './entities/cart.entity.js';

/** CU-02 (3a/5a), CU-11 (6a) y la fusión de CU-06: nunca se ajusta la cantidad sola. */
export class InsufficientStockException extends HttpException {
  constructor(public readonly maxAvailable: number) {
    super({ code: 'INSUFFICIENT_STOCK', message: 'No hay stock suficiente', maxAvailable }, HttpStatus.CONFLICT);
  }
}

type ResolveOutcome =
  | { outcome: 'ok'; product: Product; variant: ProductVariant }
  | { outcome: 'insufficient_stock'; maxAvailable: number }
  | { outcome: 'unavailable' };

export interface CartItemView {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantAttributes: Record<string, string>;
  quantity: number;
  unitPriceSnapshot: string;
  subtotal: string;
  isUnavailable: boolean;
  isOutOfStock: boolean;
  priceChanged: boolean;
}

/** CU-03 (flujos 3a/3b): un cambio que la revalidación aplicó al carrito. */
export type CheckoutAdjustment =
  | { itemId: string; productName: string; type: 'removed'; reason: 'unavailable' | 'out_of_stock' }
  | { itemId: string; productName: string; type: 'quantity_reduced'; from: number; to: number }
  | { itemId: string; productName: string; type: 'price_updated'; from: string; to: string };

export interface MergeItemResult {
  variantId: string;
  requestedQuantity: number;
  outcome: 'ok' | 'insufficient_stock' | 'unavailable';
  maxAvailable?: number;
}

/**
 * CU-02 Agregar producto al carrito, CU-11 Modificar o quitar ítem del
 * carrito, y la fusión de carrito de invitado que CU-06 da por hecha. Sólo
 * modela el carrito de Clientes autenticados: el de invitado vive 100% en
 * el frontend (Zustand + localStorage).
 */
@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly itemRepo: Repository<CartItem>,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Crea el carrito del cliente en su primer uso si todavía no existe, o
   * después de que el anterior quedó asociado a un pedido (CU-03).
   * Dos requests concurrentes del mismo usuario recién logueado (ej. la
   * fusión de CU-06 y el `GET /cart` del badge del header) pueden
   * encontrar ambas "no existe" antes de que la primera termine de
   * insertar: el índice único parcial de `user_id` (sólo carritos activos)
   * hace fallar a la segunda, que simplemente relee el que la otra creó.
   */
  async getOrCreateCart(userId: string): Promise<Cart> {
    const cart = await this.cartRepo.findOne({ where: { userId, status: CartStatus.ACTIVO } });
    if (cart) return cart;

    try {
      return await this.cartRepo.save(this.cartRepo.create({ userId, status: CartStatus.ACTIVO }));
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const race = await this.cartRepo.findOne({ where: { userId, status: CartStatus.ACTIVO } });
      if (!race) throw err;
      return race;
    }
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito (vista) */
  async getCart(userId: string): Promise<{ cartId: string; items: CartItemView[]; totalItems: number; totalAmount: string }> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.itemRepo.find({
      where: { cartId: cart.id },
      relations: { product: true, variant: { product: true } },
      order: { addedAt: 'ASC' },
    });
    const views = items.map((item) => this.toItemView(item));
    return this.toCartTotals(cart.id, views);
  }

  /**
   * @usecase CU-02 Agregar producto al carrito
   */
  async addItem(userId: string, variantId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    this.assertMutable(cart);

    const existing = await this.itemRepo.findOne({ where: { cartId: cart.id, variantId } });
    const resolution = await this.resolveItem(variantId, quantity, existing?.quantity ?? 0);

    if (resolution.outcome === 'unavailable') {
      // CU-02 (flujo 3b): producto/variante dado de baja o sin publicar.
      throw new BadRequestException('El producto o la variante no está disponible');
    }
    if (resolution.outcome === 'insufficient_stock') {
      // CU-02 (flujo 3a/5a): informar el máximo, nunca ajustar solo.
      throw new InsufficientStockException(resolution.maxAvailable);
    }

    if (existing) {
      existing.quantity += quantity;
      existing.unitPriceSnapshot = resolution.product.price;
      await this.itemRepo.save(existing);
    } else {
      await this.upsertNewItem(cart.id, variantId, quantity, resolution.product);
    }

    return this.getCart(userId);
  }

  /**
   * @usecase CU-11 Modificar o quitar ítem del carrito
   */
  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    this.assertMutable(cart);
    const item = await this.findOwnedItemOrFail(cart.id, itemId);

    // Bajar la cantidad nunca requiere disponibilidad: sólo subir la exige,
    // porque es la única dirección en la que puede faltar stock o el ítem
    // puede haber quedado no disponible (CU-11, flujo 6b).
    if (quantity > item.quantity) {
      const resolution = await this.resolveItem(item.variantId, quantity, 0);
      if (resolution.outcome === 'unavailable') {
        throw new BadRequestException(
          'El producto ya no está disponible: podés bajar la cantidad o quitarlo, pero no aumentarla',
        );
      }
      if (resolution.outcome === 'insufficient_stock') {
        // CU-11 (flujo 6a).
        throw new InsufficientStockException(resolution.maxAvailable);
      }
      item.unitPriceSnapshot = resolution.product.price;
    }

    item.quantity = quantity;
    await this.itemRepo.save(item);
    return this.getCart(userId);
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito (flujo 3a) */
  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    this.assertMutable(cart);
    const item = await this.findOwnedItemOrFail(cart.id, itemId);
    await this.itemRepo.remove(item);
    return this.getCart(userId);
  }

  /** @usecase CU-11 Modificar o quitar ítem del carrito (flujo 3b) */
  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    this.assertMutable(cart);
    await this.itemRepo.delete({ cartId: cart.id });
    return this.getCart(userId);
  }

  /**
   * Fusión de carrito de invitado (CU-06), paso de preview: no persiste
   * nada, sólo informa qué pasaría con cada ítem.
   */
  async previewMerge(userId: string, items: { variantId: string; quantity: number }[]): Promise<MergeItemResult[]> {
    const cart = await this.getOrCreateCart(userId);
    // Sólo lee (no persiste nada): resolver cada ítem en paralelo es seguro
    // y evita que un carrito de invitado grande demore un round-trip por ítem.
    return Promise.all(
      items.map(async ({ variantId, quantity }) => {
        const existing = await this.itemRepo.findOne({ where: { cartId: cart.id, variantId } });
        const resolution = await this.resolveItem(variantId, quantity, existing?.quantity ?? 0);
        return this.toMergeItemResult(variantId, quantity, resolution);
      }),
    );
  }

  /**
   * Fusión de carrito de invitado (CU-06), paso de confirm: aplica las
   * cantidades que el usuario aceptó en el modal. Revalida cada ítem por si
   * el estado cambió entre el preview y el confirm (ventana corta, pero
   * real); lo que ya no resuelve se omite y se reporta, en vez de fallar
   * todo el lote.
   */
  async confirmMerge(userId: string, items: { variantId: string; quantity: number }[]) {
    const cart = await this.getOrCreateCart(userId);
    this.assertMutable(cart);

    // Cada ítem de la fusión resuelve/persiste una variante distinta (el
    // frontend nunca manda la misma dos veces): resolverlos en paralelo no
    // tiene el riesgo de doble-inserción de un `addItem` concurrente porque
    // `upsertNewItem` ya está a prueba de esa carrera.
    const outcomes = await Promise.all(
      items.map(async ({ variantId, quantity }) => {
        const existing = await this.itemRepo.findOne({ where: { cartId: cart.id, variantId } });
        const resolution = await this.resolveItem(variantId, quantity, existing?.quantity ?? 0);

        if (resolution.outcome !== 'ok') {
          return { skipped: this.toMergeItemResult(variantId, quantity, resolution) };
        }

        if (existing) {
          existing.quantity += quantity;
          existing.unitPriceSnapshot = resolution.product.price;
          await this.itemRepo.save(existing);
        } else {
          await this.upsertNewItem(cart.id, variantId, quantity, resolution.product);
        }
        return { merged: this.toMergeItemResult(variantId, quantity, resolution) };
      }),
    );

    const merged = outcomes.map((o) => o.merged).filter((m): m is MergeItemResult => !!m);
    const skipped = outcomes.map((o) => o.skipped).filter((s): s is MergeItemResult => !!s);

    return { merged, skipped, cart: await this.getCart(userId) };
  }

  /**
   * Resolución server-side de una variante para el carrito de invitado
   * (público, sin persistencia): la ficha exige que el servidor nunca
   * confíe en precio/stock enviados por el cliente, incluso para Visitante.
   */
  async resolveGuestItem(variantId: string, quantity: number, alreadyInCart: number): Promise<MergeItemResult> {
    const resolution = await this.resolveItem(variantId, quantity, alreadyInCart);
    return this.toMergeItemResult(variantId, quantity, resolution);
  }

  /**
   * CU-03 (paso 3): revalida cada ítem contra el catálogo en servidor y, a
   * diferencia de CU-02/CU-11, **sí ajusta** el carrito — la ficha del
   * checkout lo pide así (flujos 3a/3b: "ajusta el carrito, informa los
   * cambios y pide reconfirmar"). Devuelve los ajustes para que el
   * frontend los muestre antes de seguir.
   *
   * @usecase CU-03 Realizar checkout
   */
  async revalidateForCheckout(userId: string): Promise<{ adjustments: CheckoutAdjustment[]; cart: Awaited<ReturnType<CartService['getCart']>> }> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.itemRepo.find({
      where: { cartId: cart.id },
      relations: { product: true, variant: true },
    });

    const adjustments: CheckoutAdjustment[] = [];
    for (const item of items) {
      const base = { itemId: item.id, productName: item.product.name };

      if (!item.product.isActive || !item.product.isPublished) {
        // CU-03 (flujo 3a): producto dado de baja o despublicado.
        await this.itemRepo.remove(item);
        adjustments.push({ ...base, type: 'removed', reason: 'unavailable' });
        continue;
      }
      const available = item.variant.stockAvailable;
      if (available <= 0) {
        // CU-03 (flujo 3a): sin stock.
        await this.itemRepo.remove(item);
        adjustments.push({ ...base, type: 'removed', reason: 'out_of_stock' });
        continue;
      }

      let changed = false;
      if (item.quantity > available) {
        // CU-03 (flujo 3a): stock insuficiente, se reduce al máximo disponible.
        adjustments.push({ ...base, type: 'quantity_reduced', from: item.quantity, to: available });
        item.quantity = available;
        changed = true;
      }
      if (item.product.price !== item.unitPriceSnapshot) {
        // CU-03 (flujo 3b): el precio vigente difiere del del carrito.
        adjustments.push({ ...base, type: 'price_updated', from: item.unitPriceSnapshot, to: item.product.price });
        item.unitPriceSnapshot = item.product.price;
        changed = true;
      }
      if (changed) await this.itemRepo.save(item);
    }

    return { adjustments, cart: await this.getCart(userId) };
  }

  /**
   * CU-03 (paso 13): toma el carrito activo del cliente con lock de fila
   * dentro de la transacción del checkout — dos "confirmar" concurrentes
   * (doble click, dos pestañas) se serializan acá, y el segundo ya no
   * encuentra un carrito activo con ítems.
   */
  async lockActiveCartForCheckout(manager: EntityManager, userId: string): Promise<{ cart: Cart; items: CartItem[] } | null> {
    const cart = await manager.getRepository(Cart).findOne({
      where: { userId, status: CartStatus.ACTIVO },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cart) return null;
    const items = await manager.getRepository(CartItem).find({
      where: { cartId: cart.id },
      relations: { product: true, variant: true },
      order: { addedAt: 'ASC' },
    });
    return { cart, items };
  }

  /** CU-03 (paso 16): el carrito queda asociado al pedido y ya no es editable. */
  async markAssociatedToOrder(manager: EntityManager, cartId: string): Promise<void> {
    await manager.getRepository(Cart).update(cartId, { status: CartStatus.ASOCIADO_A_PEDIDO });
  }

  /**
   * CU-03 (flujo 17a): la pasarela no creó la preferencia, así que el
   * carrito tiene que volver a quedar "intacto y editable". Entre que se
   * asoció al pedido y esta compensación, algo del frontend (el badge del
   * header) pudo haber creado un carrito activo nuevo y vacío: se descarta
   * ese para no chocar contra el índice único. Si el cliente ya le cargó
   * ítems, se respeta ese carrito nuevo (lo comprado sigue en el snapshot
   * del pedido cancelado) y se devuelve `false`.
   */
  async restoreAfterFailedCheckout(manager: EntityManager, cartId: string, userId: string): Promise<boolean> {
    const cartRepo = manager.getRepository(Cart);
    const newer = await cartRepo.findOne({ where: { userId, status: CartStatus.ACTIVO } });
    if (newer) {
      if ((await manager.getRepository(CartItem).count({ where: { cartId: newer.id } })) > 0) return false;
      await cartRepo.delete(newer.id);
    }
    await cartRepo.update(cartId, { status: CartStatus.ACTIVO });
    return true;
  }

  /**
   * Núcleo de validación reusado por `addItem`, `updateItemQuantity`,
   * `previewMerge`/`confirmMerge` y `resolveGuestItem`: resuelve la
   * variante contra el catálogo en servidor y compara el stock disponible
   * contra lo que ya haya en el carrito más lo pedido — nunca confía en
   * datos que puedan venir manipulados desde el cliente.
   */
  private async resolveItem(variantId: string, requestedQuantity: number, alreadyInCart: number): Promise<ResolveOutcome> {
    let product: Product;
    let variant: ProductVariant;
    try {
      const resolved = await this.productsService.resolveVariantForPurchase(variantId);
      product = resolved.product;
      variant = resolved.variant;
    } catch {
      return { outcome: 'unavailable' };
    }

    const totalRequested = alreadyInCart + requestedQuantity;
    if (totalRequested > variant.stockAvailable) {
      return { outcome: 'insufficient_stock', maxAvailable: Math.max(0, variant.stockAvailable - alreadyInCart) };
    }
    return { outcome: 'ok', product, variant };
  }

  private toMergeItemResult(variantId: string, requestedQuantity: number, resolution: ResolveOutcome): MergeItemResult {
    if (resolution.outcome === 'ok') {
      return { variantId, requestedQuantity, outcome: 'ok' };
    }
    if (resolution.outcome === 'insufficient_stock') {
      return { variantId, requestedQuantity, outcome: 'insufficient_stock', maxAvailable: resolution.maxAvailable };
    }
    return { variantId, requestedQuantity, outcome: 'unavailable' };
  }

  private toItemView(item: CartItem): CartItemView {
    const isUnavailable = !item.variant.product.isActive || !item.variant.product.isPublished;
    const isOutOfStock = !isUnavailable && item.variant.stockAvailable <= 0;
    const currentPrice = item.product.price;
    return {
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId,
      variantAttributes: item.variant.attributes,
      quantity: item.quantity,
      unitPriceSnapshot: item.unitPriceSnapshot,
      subtotal: fromCents(toCents(item.unitPriceSnapshot) * item.quantity),
      isUnavailable,
      isOutOfStock,
      // Sólo informativo en la vista: el precio real se actualiza al
      // modificar la cantidad (CU-11, flujo 7), no con sólo mirar el carrito.
      priceChanged: currentPrice !== item.unitPriceSnapshot,
    };
  }

  private toCartTotals(cartId: string, items: CartItemView[]) {
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = fromCents(items.reduce((sum, i) => sum + toCents(i.subtotal), 0));
    return { cartId, items, totalItems, totalAmount };
  }

  private assertMutable(cart: Cart): void {
    // CU-11 (flujo 9a): el carrito ya asociado a un pedido es inmutable.
    // `getOrCreateCart` sólo devuelve carritos activos, así que esto sólo
    // salta si el checkout asoció el carrito en medio de esta request.
    if (cart.status === CartStatus.ASOCIADO_A_PEDIDO) {
      throw new ConflictException('Este carrito ya está asociado a un pedido; iniciá un carrito nuevo');
    }
  }

  private async findOwnedItemOrFail(cartId: string, itemId: string): Promise<CartItem> {
    // CU-11 (flujo 6c): ítem que no pertenece al carrito del usuario.
    const item = await this.itemRepo.findOne({
      where: { id: itemId, cartId },
      relations: { product: true, variant: { product: true } },
    });
    if (!item) throw new NotFoundException('El ítem no pertenece a este carrito');
    return item;
  }

  /**
   * Inserta un ítem nuevo para una variante que `addItem`/`confirmMerge` ya
   * comprobaron que no estaba en el carrito. La comprobación previa es
   * TOCTOU (dos requests concurrentes por la misma variante, ej. doble
   * click): la UNIQUE de `(cart_id, variant_id)` es la salvaguarda real, y
   * si se dispara, la segunda request suma su cantidad sobre la fila que
   * la primera ya insertó en vez de fallar.
   */
  private async upsertNewItem(cartId: string, variantId: string, quantity: number, product: Product): Promise<void> {
    try {
      await this.itemRepo.save(
        this.itemRepo.create({ cartId, productId: product.id, variantId, quantity, unitPriceSnapshot: product.price }),
      );
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const race = await this.itemRepo.findOneBy({ cartId, variantId });
      if (!race) throw err;
      race.quantity += quantity;
      race.unitPriceSnapshot = product.price;
      await this.itemRepo.save(race);
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }
}
