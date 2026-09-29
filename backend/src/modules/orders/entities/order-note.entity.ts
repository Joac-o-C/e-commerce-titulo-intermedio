import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Order } from './order.entity.js';

/**
 * Nota interna de un pedido, visible sólo en el panel (decisión de la Fase 6
 * para CU-19 5c): las del Administrador llevan autor; las del sistema
 * (faltante de stock de CU-05 7a-1, discrepancias de pago) no.
 */
@Entity('order_notes')
@Index(['orderId', 'createdAt'])
export class OrderNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: Relation<User> | null;

  /** null = nota automática del sistema. */
  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  authorId: string | null;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
