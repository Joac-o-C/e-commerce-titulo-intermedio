import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PaymentAuditEvent {
  /** CU-05 (3a): firma inválida o notificación mal formada. */
  NOTIFICACION_INVALIDA = 'notificacion_invalida',
  /** CU-05 (4a): no existe un pedido para la referencia recibida. */
  PEDIDO_INEXISTENTE = 'pedido_inexistente',
  /** CU-05 (5a): la pasarela no respondió tras los reintentos. */
  PASARELA_NO_DISPONIBLE = 'pasarela_no_disponible',
  /** CU-05 (6a): notificación duplicada o fuera de orden, sin cambios. */
  NOTIFICACION_DUPLICADA = 'notificacion_duplicada',
  /** CU-05 (7b-1), monto que no coincide, doble pago: queda para revisión. */
  DISCREPANCIA = 'discrepancia',
  /** CU-05 (paso 10): pago procesado. */
  PAGO_PROCESADO = 'pago_procesado',
  /** CU-21 (pasos 4-6): la pasarela aceptó el pedido de reembolso. */
  REEMBOLSO_SOLICITADO = 'reembolso_solicitado',
  /** CU-21 (pasos 9-11): la pasarela confirmó el reembolso. */
  REEMBOLSO_ACREDITADO = 'reembolso_acreditado',
  /** CU-21 (flujos 5a/9a): la pasarela rechazó el reembolso. */
  REEMBOLSO_RECHAZADO = 'reembolso_rechazado',
  /** CU-21 (flujo 4a): la pasarela no respondió tras los reintentos. */
  REEMBOLSO_PASARELA_NO_DISPONIBLE = 'reembolso_pasarela_no_disponible',
  /** Gestión del Administrador sobre un reembolso rechazado o pendiente. */
  REEMBOLSO_GESTION_MANUAL = 'reembolso_gestion_manual',
}

/**
 * Auditoría de cada evento de pago y de reembolso (CU-05 paso 10, CU-21
 * paso 11).
 */
@Entity('payment_audit_logs')
@Index(['orderId', 'createdAt'])
export class PaymentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'external_payment_id', type: 'varchar', nullable: true })
  externalPaymentId: string | null;

  @Column({ name: 'event_type', type: 'enum', enum: PaymentAuditEvent })
  eventType: PaymentAuditEvent;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
