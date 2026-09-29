import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { ProductVariant } from '../../../products/entities/product-variant.entity.js';
import { OrderItem } from '../../entities/order-item.entity.js';
import { ReturnRequest } from './return-request.entity.js';

export enum ReplacementStatus {
  PENDIENTE_DESPACHO = 'pendiente_despacho',
  DESPACHADO = 'despachado',
}

/**
 * Reposición de un cambio (CU-22 flujo 10a). Decisión de la Fase 6: el
 * Administrador elige la variante de reemplazo, su stock se descuenta al
 * registrarla y queda "pendiente de despacho" hasta que la marca despachada
 * (con seguimiento opcional). Guarda un snapshot, como el pedido.
 */
@Entity('return_replacements')
export class ReturnReplacement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReturnRequest, (request) => request.replacements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: Relation<ReturnRequest>;

  @Column({ name: 'return_request_id' })
  returnRequestId: string;

  /** Ítem del pedido que se cambia. */
  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: Relation<OrderItem>;

  @Column({ name: 'order_item_id' })
  orderItemId: string;

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

  @Column({ type: 'enum', enum: ReplacementStatus, enumName: 'replacement_status' })
  status: ReplacementStatus;

  @Column({ name: 'tracking_carrier', type: 'varchar', nullable: true })
  trackingCarrier: string | null;

  @Column({ name: 'tracking_number', type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
