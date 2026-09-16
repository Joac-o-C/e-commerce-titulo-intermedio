import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo de plantillas de correo (CU-20). En esta fase solo se disparan
 * VERIFICACION, RESET_PASSWORD y PASSWORD_CHANGED (CU-01/07/08); el resto
 * se activa en fases posteriores (CU-05, 14, 15, 19, 21, 22).
 */
export enum EmailTemplate {
  VERIFICACION = 'verificacion',
  RESET_PASSWORD = 'reset_password',
  PASSWORD_CHANGED = 'password_changed',
  RESULTADO_PAGO = 'resultado_pago',
  CONFIRMACION_PEDIDO = 'confirmacion_pedido',
  CAMBIO_ESTADO_PEDIDO = 'cambio_estado_pedido',
  CANCELACION = 'cancelacion',
  COMPROBANTE_POSVENTA = 'comprobante_posventa',
  RESULTADO_REEMBOLSO = 'resultado_reembolso',
}

export enum EmailStatus {
  ENVIADO = 'enviado',
  FALLIDO = 'fallido',
  REINTENTANDO = 'reintentando',
  REBOTADO = 'rebotado',
  OMITIDO_POR_RATE_LIMIT = 'omitido_por_rate_limit',
}

/**
 * Auditoría de cada intento de envío de correo (CU-20), y a la vez la
 * fuente de verdad para el rate limit de 3 envíos/hora por cuenta+plantilla
 * (CU-20 flujo 1a) — se cuenta contra esta tabla, sin un contador aparte.
 */
@Entity('email_logs')
@Index(['userId', 'template', 'createdAt'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId?: string | null;

  @Column({ name: 'recipient_email' })
  recipientEmail: string;

  @Column({ type: 'enum', enum: EmailTemplate })
  template: EmailTemplate;

  @Column({ name: 'payload_snapshot', type: 'jsonb', nullable: true })
  payloadSnapshot?: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: EmailStatus })
  status: EmailStatus;

  @Column({ name: 'related_order_id', type: 'varchar', nullable: true })
  relatedOrderId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
