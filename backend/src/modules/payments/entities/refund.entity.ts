import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity.js';
import { Payment } from './payment.entity.js';

/** Estados de CU-21 ("reembolso en trámite", "reembolsado", "reembolso rechazado", "pendiente de gestión"). */
export enum RefundStatus {
  EN_TRAMITE = 'en_tramite',
  REEMBOLSADO = 'reembolsado',
  RECHAZADO = 'rechazado',
  PENDIENTE_DE_GESTION = 'pendiente_de_gestion',
}

/** Caso de uso que pidió el reembolso (CU-21 paso 3). */
export enum RefundOrigin {
  CU_14 = 'CU-14',
  CU_19 = 'CU-19',
  CU_22 = 'CU-22',
}

/**
 * Reembolso de un pago acreditado (CU-21). Se registra "en trámite" dentro
 * de la misma transacción que la cancelación o devolución que lo origina
 * (CU-21 pasos 1-3), y recién después se pide a la pasarela (pasos 4-6):
 * así nunca queda una cancelación firme sin su reembolso anotado, ni un
 * reembolso pedido a la pasarela por una cancelación que hizo rollback.
 *
 * Fase 5: sólo el registro. `externalRefundId` null + `en_tramite` =
 * todavía no se pidió a la pasarela; la ejecución y el webhook de
 * resultado son la Fase 6.
 */
@Entity('refunds')
@Index(['orderId', 'createdAt'])
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment: Relation<Payment>;

  @Column({ name: 'payment_id' })
  paymentId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: RefundStatus, enumName: 'refund_status' })
  status: RefundStatus;

  @Column({ name: 'external_refund_id', type: 'varchar', nullable: true })
  externalRefundId: string | null;

  @Column({ name: 'origin_cu', type: 'enum', enum: RefundOrigin, enumName: 'refund_origin' })
  originCu: RefundOrigin;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
