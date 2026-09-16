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
import { User } from '../../users/entities/user.entity.js';

/**
 * Sesión de refresh (CU-06/CU-10). Cada renovación crea una fila nueva y
 * revoca la anterior (rotación); logout revoca solo la sesión actual,
 * logout-all revoca todas las vigentes del usuario. tokenHash es un sha256
 * del valor opaco que ve el cliente — nunca se persiste en texto plano.
 */
@Entity('refresh_tokens')
@Index(['userId', 'revokedAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'created_by_ip' })
  createdByIp: string;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
