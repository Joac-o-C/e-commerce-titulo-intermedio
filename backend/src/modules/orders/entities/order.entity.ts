import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { OrderCancellationCause, OrderStatus } from '../order-status.js';
import { OrderItem } from './order-item.entity.js';
import { OrderStatusHistory } from './order-status-history.entity.js';

/** Copia de la dirección al confirmar (CU-03 paso 14): no cambia si se edita la libreta. */
export interface ShippingAddressSnapshot {
  alias: string;
  street: string;
  number: string;
  floorApt: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  notes: string | null;
}

export interface ShippingMethodSnapshot {
  id: string;
  name: string;
  cost: string;
}

/**
 * Pedido (CU-03 en adelante). Guarda un snapshot completo de ítems,
 * dirección, envío y total: no depende del catálogo ni de la libreta de
 * direcciones actuales.
 *
 * `stockReservationActive` indica si el stock de los ítems sigue reservado
 * a nombre de este pedido: CU-03 lo reserva, CU-05 lo confirma (descuento
 * firme) o lo libera, y el vencimiento de 24 h lo libera. Sin este flag,
 * un pago aprobado después de que la reserva se liberó (CU-05 7a-1)
 * descontaría stock reservado por otro pedido.
 */
@Entity('orders')
@Index(['userId', 'createdAt'])
@Index(['status', 'reservationExpiresAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id' })
  userId: string;

  /** Carrito que originó el pedido (CU-03 paso 16). Referencia informativa, sin FK. */
  @Column({ name: 'cart_id', type: 'uuid', nullable: true })
  cartId: string | null;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status' })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: string;

  @Column({ name: 'shipping_cost', type: 'decimal', precision: 10, scale: 2 })
  shippingCost: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: string;

  @Column({ name: 'shipping_method_snapshot', type: 'jsonb' })
  shippingMethodSnapshot: ShippingMethodSnapshot;

  @Column({ name: 'shipping_address_snapshot', type: 'jsonb' })
  shippingAddressSnapshot: ShippingAddressSnapshot;

  /** Sólo con status `cancelado`: distingue el vencimiento de reserva de una cancelación deliberada. */
  @Column({
    name: 'cancellation_cause',
    type: 'enum',
    enum: OrderCancellationCause,
    enumName: 'order_cancellation_cause',
    nullable: true,
  })
  cancellationCause: OrderCancellationCause | null;

  @Column({ name: 'stock_reservation_active', default: false })
  stockReservationActive: boolean;

  /** CU-03 (18a): vencida esta fecha sin pago acreditado, se libera el stock y el pedido pasa a "cancelado". */
  @Column({ name: 'reservation_expires_at', type: 'timestamptz' })
  reservationExpiresAt: Date;

  /** Última preferencia creada en la pasarela (CU-03 paso 17; el reintento de pago crea otra). */
  @Column({ name: 'payment_preference_id', type: 'varchar', nullable: true })
  paymentPreferenceId: string | null;

  /** Notas para el Administrador, p. ej. el faltante de stock de CU-05 (7a-1). Se muestran en CU-19. */
  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string | null;

  // Datos de despacho (CU-19, Fase 6). Opcionales, según la consolidación de CU.
  @Column({ name: 'tracking_carrier', type: 'varchar', nullable: true })
  trackingCarrier: string | null;

  @Column({ name: 'tracking_number', type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: Relation<OrderItem>[];

  @OneToMany(() => OrderStatusHistory, (entry) => entry.order)
  statusHistory: Relation<OrderStatusHistory>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
