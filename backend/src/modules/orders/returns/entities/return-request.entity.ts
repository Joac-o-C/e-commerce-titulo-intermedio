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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Resolución (CU-22, Fase 6).
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedBy: Relation<User> | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;
}
