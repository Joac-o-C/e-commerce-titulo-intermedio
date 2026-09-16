import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro de cada intento de login (éxito o fallo), soporte del bloqueo
 * por cuenta e IP de CU-06 (flujo 5a). No es una de las entidades del
 * modelo de datos general del TP: es un detalle de implementación del
 * throttling, deliberadamente separado de User para no mezclar responsabilidad.
 * email se guarda aunque la cuenta no exista, para poder contar intentos
 * fallidos incluso contra emails inexistentes.
 */
@Entity('login_attempts')
@Index(['email', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
export class LoginAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ name: 'ip_address' })
  ipAddress: string;

  @Column()
  success: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
