import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { OrderItem } from '../../entities/order-item.entity.js';
import { ReturnRequest } from './return-request.entity.js';

/**
 * Ítem de pedido incluido en una solicitud de posventa. La UNIQUE de
 * `order_item_id` materializa la precondición 4 de CU-15 (un ítem admite
 * una sola solicitud) y resuelve el flujo 6a: dos solicitudes creadas en
 * paralelo sobre el mismo ítem no pueden coexistir.
 */
@Entity('return_request_items')
export class ReturnRequestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReturnRequest, (request) => request.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: Relation<ReturnRequest>;

  @Column({ name: 'return_request_id' })
  returnRequestId: string;

  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: Relation<OrderItem>;

  @Index({ unique: true })
  @Column({ name: 'order_item_id' })
  orderItemId: string;

  @Column({ name: 'quantity_requested', type: 'int' })
  quantityRequested: number;

  /** Lo fija el Administrador al resolver (CU-22). */
  @Column({ name: 'quantity_approved', type: 'int', nullable: true })
  quantityApproved: number | null;
}
