import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { EmailLog, EmailStatus, EmailTemplate } from './entities/email-log.entity.js';
import { MAIL_PROVIDER } from './mail-provider.interface.js';
import type { MailProvider } from './mail-provider.interface.js';

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

/**
 * Implementación de CU-20 (Enviar notificación por correo): valida
 * destinatario y plantilla, aplica el límite de frecuencia, delega en el
 * MailProvider configurado y deja auditoría en EmailLog. Es un CU
 * "include" sin actor humano — nunca revierte al CU solicitante por una
 * falla propia (el solicitante sigue su flujo con el resultado informado).
 */
@Injectable()
export class NotificationsService {
  private readonly maxPerHour: number;

  constructor(
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    @Inject(MAIL_PROVIDER)
    private readonly mailProvider: MailProvider,
    configService: ConfigService,
  ) {
    this.maxPerHour = configService.get<number>('EMAIL_RATE_LIMIT_MAX_PER_HOUR')!;
  }

  /**
   * @usecase CU-20 Enviar notificación por correo
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const { userId, recipientEmail, template, data, relatedOrderId } = params;
    const base = { userId, recipientEmail, template, data, relatedOrderId };

    // CU-20 (flujo 2a): destinatario sin dirección de correo válida.
    if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
      return this.log({ ...base, status: EmailStatus.FALLIDO });
    }

    // CU-20 (flujo 2b): la plantilla solicitada no existe.
    if (!Object.values(EmailTemplate).includes(template)) {
      return this.log({ ...base, status: EmailStatus.FALLIDO });
    }

    // CU-20 (flujo 1a): la cuenta ya alcanzó el máximo de esa plantilla en
    // la ventana de una hora — no envía, informa al CU solicitante.
    if (userId && RATE_LIMITED_TEMPLATES.has(template) && (await this.hasReachedRateLimit(userId, template))) {
      return this.log({ ...base, status: EmailStatus.OMITIDO_POR_RATE_LIMIT });
    }

    const { subject, body } = this.composeMessage(template, data);

    try {
      await this.mailProvider.send(recipientEmail, subject, body);
      return this.log({ ...base, status: EmailStatus.ENVIADO });
    } catch {
      // CU-20 (flujo 4a): el Servicio de Correo no responde o rechaza el
      // mensaje. Se registra el fallo; el CU solicitante continúa igual.
      return this.log({ ...base, status: EmailStatus.FALLIDO });
    }
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

  /**
   * Compone asunto y cuerpo del mensaje. El catálogo completo de las 9
   * plantillas (contenido real) se termina de pulir en la Fase 7; acá
   * alcanza con un cuerpo genérico que deja trazabilidad de qué se envió.
   */
  private composeMessage(
    template: EmailTemplate,
    data?: Record<string, unknown>,
  ): { subject: string; body: string } {
    const subjects: Partial<Record<EmailTemplate, string>> = {
      [EmailTemplate.VERIFICACION]: 'Confirmá tu cuenta',
      [EmailTemplate.RESET_PASSWORD]: 'Restablecé tu contraseña',
      [EmailTemplate.PASSWORD_CHANGED]: 'Tu contraseña fue cambiada',
      [EmailTemplate.RESULTADO_PAGO]: 'Novedades sobre el pago de tu pedido',
    };
    return {
      subject: subjects[template] ?? `Notificación: ${template}`,
      body: JSON.stringify(data ?? {}),
    };
  }

  private async log(params: {
    userId?: string | null;
    recipientEmail: string;
    template: EmailTemplate;
    data?: Record<string, unknown>;
    relatedOrderId?: string | null;
    status: EmailStatus;
  }): Promise<SendEmailResult> {
    await this.emailLogRepo.save(
      this.emailLogRepo.create({
        userId: params.userId ?? null,
        recipientEmail: params.recipientEmail,
        template: params.template,
        payloadSnapshot: params.data ?? null,
        relatedOrderId: params.relatedOrderId ?? null,
        status: params.status,
      }),
    );
    return { status: params.status };
  }
}
