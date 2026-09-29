import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { EmailLog, EmailStatus, EmailTemplate } from './entities/email-log.entity.js';
import { MAIL_PROVIDER, MailPermanentError } from './mail-provider.interface.js';
import type { MailProvider } from './mail-provider.interface.js';
import { TEMPLATES } from './templates/index.js';
import type { ComposedMessage, TemplateContext } from './templates/index.js';

export interface SendEmailParams {
  userId?: string | null;
  recipientEmail: string;
  template: EmailTemplate;
  data?: Record<string, unknown>;
  relatedOrderId?: string | null;
}

export interface SendEmailResult {
  status: EmailStatus;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CU-20 (flujo 1a) fija el límite de frecuencia sólo para verificación y
 * restablecimiento (los que el usuario puede disparar a pedido). Los
 * transaccionales (resultado de pago, cambios de estado del pedido...) no
 * se limitan: omitir uno le ocultaría al Cliente un resultado real.
 */
const RATE_LIMITED_TEMPLATES: ReadonlySet<EmailTemplate> = new Set([
  EmailTemplate.VERIFICACION,
  EmailTemplate.RESET_PASSWORD,
]);

/** CU-20 (flujo 4a): espera antes de cada uno de los 5 reintentos (decisión de la Fase 7). */
export const RETRY_BACKOFF_MIN = [5, 10, 20, 40, 80] as const;

/**
 * Plazo durante el cual una fila `pendiente`/`reintentando` pertenece a quien
 * la está entregando. Si el proceso se cae a mitad de camino, el cron la
 * vuelve a tomar pasado este plazo.
 */
const DELIVERY_LEASE_MS = 10 * 60 * 1000;

/** Datos que no se guardan en claro en la auditoría (tokens de un solo uso). */
const REDACTED_KEYS: ReadonlySet<string> = new Set(['token']);

/**
 * Implementación de CU-20 (Enviar notificación por correo): valida
 * destinatario y plantilla, aplica el límite de frecuencia, compone el
 * mensaje y lo entrega al Servicio de Correo en segundo plano, con
 * reintentos y registro de rebotes, dejando auditoría en EmailLog. Es un
 * CU "include" sin actor humano — nunca revierte al CU solicitante.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly maxPerHour: number;
  private readonly baseContext: Omit<TemplateContext, 'recipientName' | 'orderUrl'>;

  constructor(
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(MAIL_PROVIDER)
    private readonly mailProvider: MailProvider,
    configService: ConfigService,
  ) {
    this.maxPerHour = configService.get<number>('EMAIL_RATE_LIMIT_MAX_PER_HOUR')!;
    this.baseContext = {
      frontendUrl: configService.get<string>('FRONTEND_URL')!,
      verificationTtlHours: configService.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_HOURS')!,
      resetTtlHours: configService.get<number>('PASSWORD_RESET_TOKEN_TTL_HOURS')!,
      reservationTtlHours: configService.get<number>('ORDER_RESERVATION_TTL_HOURS')!,
    };
  }

  /**
   * Resuelve en el momento sólo lo que el CU solicitante necesita saber
   * (flujos 2a, 2b y 1a); la entrega al Servicio de Correo corre en
   * segundo plano y el solicitante no la espera (Observaciones de la ficha).
   *
   * @usecase CU-20 Enviar notificación por correo
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const { userId, recipientEmail, template, data, relatedOrderId } = params;
    const base = { userId, recipientEmail, template, data, relatedOrderId };

    // CU-20 (flujo 2a): destinatario sin dirección de correo válida.
    if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
      return this.log({ ...base, status: EmailStatus.FALLIDO, lastError: 'Destinatario sin dirección de correo válida' });
    }

    // CU-20 (flujo 2b): la plantilla solicitada no existe.
    const render = TEMPLATES[template];
    if (!render) {
      this.logger.error(`Plantilla de correo inexistente: ${template}`);
      return this.log({ ...base, status: EmailStatus.FALLIDO, lastError: 'Plantilla inexistente' });
    }

    // CU-20 (flujo 1a): la cuenta ya alcanzó el máximo de esa plantilla en
    // la ventana de una hora — no envía, informa al CU solicitante.
    if (userId && RATE_LIMITED_TEMPLATES.has(template) && (await this.hasReachedRateLimit(userId, template))) {
      return this.log({ ...base, status: EmailStatus.OMITIDO_POR_RATE_LIMIT });
    }

    // CU-20 (paso 3): compone asunto y cuerpo con los datos de la plantilla.
    let message: ComposedMessage;
    try {
      message = render(data ?? {}, await this.buildContext(userId, relatedOrderId));
    } catch (err) {
      // Un error al componer es un defecto de la plantilla: mismo tratamiento que 2b.
      this.logger.error(`No se pudo componer la plantilla ${template}`, err as Error);
      return this.log({ ...base, status: EmailStatus.FALLIDO, lastError: `Error al componer: ${(err as Error).message}` });
    }

    const row = await this.emailLogRepo.save(
      this.emailLogRepo.create({
        ...this.auditFields(base),
        status: EmailStatus.PENDIENTE,
        pendingMessage: message,
        nextAttemptAt: new Date(Date.now() + DELIVERY_LEASE_MS),
      }),
    );

    // CU-20 (pasos 4-6) en segundo plano: una falla de correo nunca llega al solicitante.
    void this.deliver(row).catch((err) => {
      this.logger.error(`Correo ${row.id}: error inesperado al entregar`, err as Error);
    });
    return { status: EmailStatus.PENDIENTE };
  }

  /**
   * Toma los correos cuya espera de reintento venció (o que quedaron
   * colgados en `pendiente` por una caída del proceso) y los vuelve a
   * entregar. Cada fila se reclama con un UPDATE condicional antes de
   * enviarla, así dos ejecuciones concurrentes nunca mandan el mismo correo.
   *
   * @usecase CU-20 Enviar notificación por correo
   */
  @Cron('*/5 * * * *')
  async retryPending(): Promise<void> {
    const now = new Date();
    const due = await this.emailLogRepo.find({
      select: { id: true },
      where: {
        status: In([EmailStatus.PENDIENTE, EmailStatus.REINTENTANDO]),
        nextAttemptAt: LessThanOrEqual(now),
      },
      order: { nextAttemptAt: 'ASC' },
      take: 50,
    });

    for (const { id } of due) {
      const claimed = await this.emailLogRepo.update(
        {
          id,
          status: In([EmailStatus.PENDIENTE, EmailStatus.REINTENTANDO]),
          nextAttemptAt: LessThanOrEqual(now),
        },
        { nextAttemptAt: new Date(Date.now() + DELIVERY_LEASE_MS) },
      );
      if (claimed.affected !== 1) continue; // la tomó otra ejecución

      const row = await this.emailLogRepo.findOneBy({ id });
      if (row) await this.deliver(row);
    }
  }

  /**
   * Entrega un correo ya reclamado al Servicio de Correo y registra el
   * resultado: enviado, rebote (5a) o fallo transitorio con reintento (4a).
   *
   * @usecase CU-20 Enviar notificación por correo
   */
  private async deliver(row: EmailLog): Promise<void> {
    if (!row.pendingMessage) {
      await this.emailLogRepo.update(row.id, {
        status: EmailStatus.FALLIDO,
        nextAttemptAt: null,
        lastError: 'Sin mensaje para entregar',
      });
      return;
    }

    try {
      // CU-20 (pasos 4-5).
      await this.mailProvider.send({ to: row.recipientEmail, ...row.pendingMessage });
    } catch (err) {
      await this.handleDeliveryError(row, err);
      return;
    }

    // CU-20 (paso 6): registra el envío. El mensaje (y su token) ya no hace falta.
    await this.emailLogRepo.update(row.id, {
      status: EmailStatus.ENVIADO,
      sentAt: new Date(),
      pendingMessage: null,
      nextAttemptAt: null,
      lastError: null,
    });
  }

  private async handleDeliveryError(row: EmailLog, err: unknown): Promise<void> {
    const lastError = truncate(err instanceof Error ? err.message : String(err));

    // CU-20 (flujo 5a): rebote — se registra asociado a la cuenta, sin reintentar.
    if (err instanceof MailPermanentError) {
      this.logger.warn(`Correo ${row.id} rebotado (${row.recipientEmail}): ${lastError}`);
      await this.emailLogRepo.update(row.id, {
        status: EmailStatus.REBOTADO,
        pendingMessage: null,
        nextAttemptAt: null,
        lastError,
      });
      if (row.userId) await this.userRepo.update(row.userId, { emailBouncedAt: new Date() });
      return;
    }

    // CU-20 (flujo 4a): falla transitoria — se encola para reintentar, hasta agotar los reintentos.
    const attempts = row.attempts + 1;
    if (attempts <= RETRY_BACKOFF_MIN.length) {
      this.logger.warn(`Correo ${row.id}: falló el intento ${attempts}, se reintenta (${lastError})`);
      await this.emailLogRepo.update(row.id, {
        status: EmailStatus.REINTENTANDO,
        attempts,
        nextAttemptAt: new Date(Date.now() + RETRY_BACKOFF_MIN[attempts - 1] * 60 * 1000),
        lastError,
      });
      return;
    }

    this.logger.error(`Correo ${row.id}: se agotaron los reintentos (${lastError})`);
    await this.emailLogRepo.update(row.id, {
      status: EmailStatus.FALLIDO,
      attempts,
      pendingMessage: null,
      nextAttemptAt: null,
      lastError,
    });
  }

  /**
   * Cuenta los envíos de esta plantilla para esta cuenta en la última hora
   * usando EmailLog como única fuente de verdad, sin contador aparte.
   * @usecase CU-20 Enviar notificación por correo
   */
  private async hasReachedRateLimit(userId: string, template: EmailTemplate): Promise<boolean> {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.emailLogRepo.count({
      where: { userId, template, createdAt: MoreThanOrEqual(windowStart) },
    });
    return count >= this.maxPerHour;
  }

  private async buildContext(userId?: string | null, relatedOrderId?: string | null): Promise<TemplateContext> {
    const user = userId
      ? await this.userRepo.findOne({ select: { id: true, firstName: true }, where: { id: userId } })
      : null;
    return {
      ...this.baseContext,
      recipientName: user?.firstName ?? null,
      orderUrl: relatedOrderId ? `${this.baseContext.frontendUrl}/account/orders/${relatedOrderId}` : null,
    };
  }

  private auditFields(params: Omit<SendEmailParams, 'template'> & { template: EmailTemplate }) {
    return {
      userId: params.userId ?? null,
      recipientEmail: params.recipientEmail,
      template: params.template,
      payloadSnapshot: params.data ? redact(params.data) : null,
      relatedOrderId: params.relatedOrderId ?? null,
    };
  }

  /** Registro de un intento que termina sin llegar al Servicio de Correo (2a, 2b, 1a). */
  private async log(params: SendEmailParams & { status: EmailStatus; lastError?: string }): Promise<SendEmailResult> {
    await this.emailLogRepo.save(
      this.emailLogRepo.create({
        ...this.auditFields(params),
        status: params.status,
        lastError: params.lastError ?? null,
      }),
    );
    return { status: params.status };
  }
}

function redact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, REDACTED_KEYS.has(k) ? '[redactado]' : v]));
}

function truncate(message: string): string {
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
