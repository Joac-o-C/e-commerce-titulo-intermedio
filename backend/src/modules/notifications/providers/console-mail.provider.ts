import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from '../mail-provider.interface.js';

/**
 * Servicio de Correo de consola (`MAIL_PROVIDER=console`): sólo loguea el
 * mensaje en texto plano. Útil sin Docker o para depurar las plantillas.
 */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async send({ to, subject, text }: MailMessage): Promise<void> {
    this.logger.log(`[mail:consola] to=${to} subject="${subject}"\n${text}`);
  }
}
