import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Order } from './order.entity.js';

/**
 * Ítem de pedido: snapshot inmutable de producto, variante, cantidad y
 * precio al confirmar el checkout (CU-03 paso 14). `productId`/`variantId`
 * quedan sólo como referencia histórica — las bajas de catálogo son
 * lógicas, así que la FK nunca queda colgando.
 */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: Relation<ProductVariant>;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ name: 'product_name_snapshot' })
  productNameSnapshot: string;

  @Column({ name: 'variant_attributes_snapshot', type: 'jsonb', default: {} })
  variantAttributesSnapshot: Record<string, string>;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price_snapshot', type: 'decimal', precision: 10, scale: 2 })
  unitPriceSnapshot: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: string;
}
