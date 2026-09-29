import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity.js';
import { Order } from '../../entities/order.entity.js';
import { ReturnRequestItem } from './return-request-item.entity.js';
import { ReturnRequestPhoto } from './return-request-photo.entity.js';
import { ReturnReplacement } from './return-replacement.entity.js';

/** Estados de la solicitud fijados en CU-15 (Observaciones). */
export enum ReturnRequestStatus {
  SOLICITADA = 'solicitada',
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
  RESUELTA = 'resuelta',
}

export enum ReturnRequestType {
  CAMBIO = 'cambio',
  DEVOLUCION = 'devolucion',
}

/**
 * Solicitud de cambio o devolución (CU-15 la crea, CU-22 la resuelve).
 * Cambio y devolución comparten entidad: el alta es idéntica y sólo
 * cambia la resolución.
 */
@Entity('return_requests')
@Index(['orderId'])
@Index(['status', 'createdAt'])
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Número que recibe el Cliente como comprobante (CU-15 paso 6). */
  @Column({ name: 'request_number', type: 'int', unique: true })
  @Generated('increment')
  requestNumber: number;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ type: 'enum', enum: ReturnRequestStatus, enumName: 'return_request_status' })
  status: ReturnRequestStatus;

  @Column({ type: 'enum', enum: ReturnRequestType, enumName: 'return_request_type' })
  type: ReturnRequestType;

  @Column({ type: 'text' })
  reason: string;

  @OneToMany(() => ReturnRequestItem, (item) => item.returnRequest)
  items: Relation<ReturnRequestItem>[];

  @OneToMany(() => ReturnRequestPhoto, (photo) => photo.returnRequest)
  photos: Relation<ReturnRequestPhoto>[];

  @OneToMany(() => ReturnReplacement, (replacement) => replacement.returnRequest)
  replacements: Relation<ReturnReplacement>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Resolución (CU-22).
  /** CU-22 (paso 6). Desde acá corren los 10 días para recibir el producto (flujo 8a). */
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /** CU-22 (paso 8). */
  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  /** Rechazo (3a) o resolución (11): cuándo quedó cerrada. */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedBy: Relation<User> | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  /**
   * Lo que ve el Cliente: motivo del rechazo (3a) o de la parte no aprobada
   * (4a), o la nota de la resolución.
   */
  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  /** CU-22 (paso 4, flujo 9a): nota interna del Administrador; el Cliente no la ve. */
  @Column({ name: 'internal_note', type: 'text', nullable: true })
  internalNote: string | null;

  /** Reembolso de una devolución (CU-22 paso 10 → CU-21). */
  @Column({ name: 'refund_id', type: 'uuid', nullable: true })
  refundId: string | null;
}
