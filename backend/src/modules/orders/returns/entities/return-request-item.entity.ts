import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { OrderItem } from '../../entities/order-item.entity.js';
import { ReturnRequest } from './return-request.entity.js';

/** Estado físico del producto devuelto (CU-22 paso 9, flujo 9a). */
export enum ReturnItemCondition {
  OK = 'ok',
  DANADO = 'danado',
}

/**
 * Ítem de pedido incluido en una solicitud de posventa. Un ítem puede
 * aparecer en varias solicitudes (decisión de la Fase 6: se pueden volver a
 * pedir las unidades no aprobadas); cuántas quedan disponibles lo calcula
 * `eligibleUnits`, y dos altas simultáneas se serializan con el lock del
 * pedido (CU-15 6a).
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

  @Index()
  @Column({ name: 'order_item_id' })
  orderItemId: string;

  @Column({ name: 'quantity_requested', type: 'int' })
  quantityRequested: number;

  /** Lo fija el Administrador al aprobar (CU-22 paso 4, flujo 4a). */
  @Column({ name: 'quantity_approved', type: 'int', nullable: true })
  quantityApproved: number | null;

  /** CU-22 (paso 8). */
  @Column({ name: 'quantity_received', type: 'int', nullable: true })
  quantityReceived: number | null;

  @Column({ type: 'enum', enum: ReturnItemCondition, enumName: 'return_item_condition', nullable: true })
  condition: ReturnItemCondition | null;

  /** Devolución: si se reembolsa este ítem (siempre en buen estado; a criterio del admin si llegó dañado, 9a). */
  @Column({ name: 'refund_approved', type: 'boolean', nullable: true })
  refundApproved: boolean | null;
}
