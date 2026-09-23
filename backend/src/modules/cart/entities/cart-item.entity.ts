import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Cart } from './cart.entity.js';

/**
 * Ítem de carrito (CU-02/CU-11). `unitPriceSnapshot` es el precio vigente
 * del catálogo al momento de agregar o de la última actualización de
 * cantidad — no es el snapshot final e inmutable de un pedido, eso ocurre
 * en `OrderItem` al confirmar el checkout (CU-03, Fase 4). La UNIQUE de
 * `(cart_id, variant_id)` es la salvaguarda real contra dos requests
 * concurrentes insertando la misma variante dos veces (`CartService`
 * comprueba "¿ya existe?" antes de insertar, que es TOCTOU).
 */
@Entity('cart_items')
@Unique('UQ_cart_items_cart_variant', ['cartId', 'variantId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Relation<Cart>;

  @Column({ name: 'cart_id' })
  cartId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: Relation<ProductVariant>;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price_snapshot', type: 'decimal', precision: 10, scale: 2 })
  unitPriceSnapshot: string;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
