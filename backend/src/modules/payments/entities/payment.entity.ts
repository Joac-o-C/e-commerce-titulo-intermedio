import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity.js';

export enum PaymentStatus {
  PENDIENTE = 'pendiente',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
  PENDIENTE_ACREDITACION = 'pendiente_acreditacion',
  CANCELADO = 'cancelado',
}

/** Estados de los que un pago ya no vuelve: una notificación "pendiente" posterior llegó fuera de orden (CU-05 6a). */
export const FINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.APROBADO,
  PaymentStatus.RECHAZADO,
  PaymentStatus.CANCELADO,
];

/**
 * Pago registrado por CU-05 (paso 8), uno por cada pago que la pasarela
 * informa — un pedido puede tener varios (un rechazo y después un
 * aprobado, o un reintento de pago de CU-13). La UNIQUE de
 * `external_payment_id` es lo que hace idempotente al webhook: dos
 * notificaciones del mismo pago nunca generan dos filas.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ default: 'mercadopago' })
  provider: string;

  @Column({ name: 'external_payment_id', unique: true })
  externalPaymentId: string;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'payment_status' })
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'int', nullable: true })
  installments: number | null;

  @Column({ type: 'varchar', nullable: true })
  method: string | null;

  /** Respuesta cruda de la pasarela al reconciliar, sólo para auditoría. */
  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: unknown;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
