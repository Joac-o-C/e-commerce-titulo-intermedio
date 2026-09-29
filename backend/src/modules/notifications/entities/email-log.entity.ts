import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Catálogo de plantillas de correo (CU-20); el contenido vive en `templates/`. */
export enum EmailTemplate {
  VERIFICACION = 'verificacion',
  RESET_PASSWORD = 'reset_password',
  PASSWORD_CHANGED = 'password_changed',
  RESULTADO_PAGO = 'resultado_pago',
  CONFIRMACION_PEDIDO = 'confirmacion_pedido',
  CAMBIO_ESTADO_PEDIDO = 'cambio_estado_pedido',
  CANCELACION = 'cancelacion',
  COMPROBANTE_POSVENTA = 'comprobante_posventa',
  /** CU-22: aprobación, rechazo, resolución y reposición despachada (décima plantilla, Fase 6). */
  RESULTADO_POSVENTA = 'resultado_posventa',
  RESULTADO_REEMBOLSO = 'resultado_reembolso',
}

export interface PendingMessage {
  subject: string;
  html: string;
  text: string;
}

export enum EmailStatus {
  /** Aceptado para envío; la entrega al Servicio de Correo corre en segundo plano. */
  PENDIENTE = 'pendiente',
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
@Index(['status', 'nextAttemptAt'])
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

  /** Intentos de entrega fallidos por error transitorio (CU-20 flujo 4a). */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt?: Date | null;

  /**
   * Mensaje ya compuesto, sólo mientras falta entregarlo: puede llevar un
   * token de un solo uso, así que se borra al enviarse o al darse por fallido.
   */
  @Column({ name: 'pending_message', type: 'jsonb', nullable: true })
  pendingMessage?: PendingMessage | null;

  @Column({ name: 'last_error', type: 'varchar', nullable: true })
  lastError?: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
