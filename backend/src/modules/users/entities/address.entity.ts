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
import { User } from './user.entity.js';

/**
 * Libreta de direcciones de un Cliente (CU-12). Las bajas son siempre
 * lógicas (isActive) porque los pedidos confirmados guardan una copia
 * (snapshot) independiente de la dirección al momento del checkout — borrar
 * o editar una entrada de la libreta nunca debe alterar un pedido histórico.
 */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  alias: string;

  @Column()
  street: string;

  @Column()
  number: string;

  @Column({ name: 'floor_apt', type: 'varchar', nullable: true })
  floorApt?: string | null;

  @Column()
  city: string;

  @Column()
  province: string;

  @Column({ name: 'postal_code' })
  postalCode: string;

  @Column()
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  notes?: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
