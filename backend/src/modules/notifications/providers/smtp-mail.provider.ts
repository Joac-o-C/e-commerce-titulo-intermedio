import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { MailPermanentError } from '../mail-provider.interface.js';
import type { MailMessage, MailProvider } from '../mail-provider.interface.js';

/**
 * Servicio de Correo por SMTP (`MAIL_PROVIDER=smtp`). En desarrollo apunta a
 * Mailpit (docker-compose); el mismo provider sirve para Mailtrap/SendGrid
 * cambiando sólo host, puerto y credenciales en el .env.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST')!,
      port: config.get<number>('SMTP_PORT')!,
      secure: config.get<boolean>('SMTP_SECURE')!,
      auth: user ? { user, pass } : undefined,
    });
    this.from = config.get<string>('MAIL_FROM')!;
  }

  async send({ to, subject, html, text }: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    } catch (err) {
      throw classifySmtpError(err);
    }
  }
}

/**
 * CU-20 (flujo 5a): una respuesta SMTP 5xx es un rechazo permanente (rebote,
 * no se reintenta); 4xx, timeouts y errores de conexión son transitorios
 * (flujo 4a) y se devuelven tal cual.
 */
export function classifySmtpError(err: unknown): Error {
  const responseCode = (err as { responseCode?: number } | null)?.responseCode;
  const message = err instanceof Error ? err.message : String(err);
  if (typeof responseCode === 'number' && responseCode >= 500) {
    return new MailPermanentError(message);
  }
  return err instanceof Error ? err : new Error(message);
}
