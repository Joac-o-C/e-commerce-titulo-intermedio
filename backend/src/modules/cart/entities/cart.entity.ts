import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { CartItem } from './cart-item.entity.js';

export enum CartStatus {
  ACTIVO = 'activo',
  ASOCIADO_A_PEDIDO = 'asociado_a_pedido',
}

/**
 * Carrito de un Cliente autenticado (CU-02/CU-11). El carrito de invitado
 * vive 100% en el frontend (Zustand + localStorage): esta entidad nunca lo
 * modela. Se crea de forma perezosa en el primer acceso del cliente (ver
 * `CartService.getOrCreateCart`), no en el registro — el resultado
 * observable es el mismo que "creado por defecto al registrarse".
 * `status` pasa a `asociado_a_pedido` al confirmar el checkout (CU-03, Fase
 * 4) y vuelve el carrito inmutable (CU-11, flujo 9a).
 */
@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'enum', enum: CartStatus, default: CartStatus.ACTIVO })
  status: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart)
  items: Relation<CartItem>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
