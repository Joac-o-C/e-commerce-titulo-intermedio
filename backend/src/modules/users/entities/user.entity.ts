import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Address } from './address.entity.js';

export enum UserRole {
  CLIENTE = 'cliente',
  ADMINISTRADOR = 'administrador',
}

export enum UserStatus {
  PENDIENTE_VERIFICACION = 'pendiente_verificacion',
  ACTIVA = 'activa',
  DESHABILITADA = 'deshabilitada',
  SUSPENDIDA = 'suspendida',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENTE })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDIENTE_VERIFICACION,
  })
  status: UserStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Las relaciones a Order/Cart se agregan en las fases que introducen esas
  // entidades (Fases 3/4) — no existen todavía en el modelo de datos.
  @OneToMany(() => Address, (address) => address.user)
  addresses: Relation<Address>[];
}
