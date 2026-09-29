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
import { User } from '../../users/entities/user.entity.js';
import { Payment } from './payment.entity.js';

/** Estados de CU-21 ("reembolso en trámite", "reembolsado", "reembolso rechazado", "pendiente de gestión"). */
export enum RefundStatus {
  EN_TRAMITE = 'en_tramite',
  REEMBOLSADO = 'reembolsado',
  RECHAZADO = 'rechazado',
  PENDIENTE_DE_GESTION = 'pendiente_de_gestion',
}

/**
 * Caso de uso que pidió el reembolso (CU-21 paso 3). `CU-05` cubre los
 * reembolsos automáticos que decidió el usuario en la Fase 6: un pago
 * acreditado sobre un pedido ya cancelado o ya pagado (doble cobro).
 */
export enum RefundOrigin {
  CU_05 = 'CU-05',
  CU_14 = 'CU-14',
  CU_19 = 'CU-19',
  CU_22 = 'CU-22',
}

/** Requieren que el Administrador reintente o lo resuelva por fuera (alerta de CU-21 4a/5a). */
export const REFUND_NEEDS_ATTENTION: readonly RefundStatus[] = [RefundStatus.RECHAZADO, RefundStatus.PENDIENTE_DE_GESTION];

/**
 * Reembolso de un pago acreditado (CU-21). Se registra "en trámite" dentro
 * de la misma transacción que la cancelación o devolución que lo origina
 * (CU-21 pasos 1-3), y recién después se pide a la pasarela (pasos 4-6):
 * así nunca queda una cancelación firme sin su reembolso anotado, ni un
 * reembolso pedido a la pasarela por una cancelación que hizo rollback.
 *
 * `externalRefundId` null + `en_tramite` = todavía no se pidió a la
 * pasarela (o el pedido quedó a mitad): `RefundsService` lo retoma.
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

  /**
   * Intento de pedido a la pasarela. Forma la clave de idempotencia: el
   * mismo intento reenviado (timeout, cron) nunca crea un segundo reembolso;
   * sólo un reintento del Administrador tras un rechazo abre un intento nuevo.
   */
  @Column({ type: 'int', default: 1 })
  attempt: number;

  /** Último error de la pasarela (rechazo o falta de respuesta), para el Administrador. */
  @Column({ name: 'last_error', type: 'varchar', nullable: true })
  lastError: string | null;

  /** Resolución manual del Administrador ("devuelto por fuera"). */
  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedBy: Relation<User> | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;
}
