import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { ProductVariant } from './product-variant.entity.js';

export enum StockMovementType {
  REPOSICION = 'reposicion',
  AJUSTE = 'ajuste',
  MERMA = 'merma',
  DEVOLUCION = 'devolucion',
  // CU-05 (7.a): descuento firme de un pedido pagado. Automático (sin actor).
  VENTA = 'venta',
}

/**
 * Movimiento de inventario sobre una variante (CU-18): historial de sólo
 * lectura que justifica que la gestión de stock sea un caso de uso propio.
 * `actorId` es nullable para los movimientos automáticos: `venta` (CU-05,
 * descuento firme al acreditarse el pago) no tiene actor humano. Reservar o
 * liberar stock no genera movimiento: no cambia `stockTotal`, sólo
 * `stockReserved`.
 */
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: Relation<ProductVariant>;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ type: 'enum', enum: StockMovementType })
  type: StockMovementType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'resulting_stock_total', type: 'int' })
  resultingStockTotal: number;

  @Column({ type: 'varchar', nullable: true })
  reason?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: Relation<User> | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
