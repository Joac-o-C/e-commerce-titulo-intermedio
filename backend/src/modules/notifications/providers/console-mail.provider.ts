import { Injectable, Logger } from '@nestjs/common';
import { MailProvider } from '../mail-provider.interface.js';

/**
 * Placeholder del Servicio de Correo mientras no hay un proveedor real
 * conectado: solo loguea el mensaje. Se reemplaza en la Fase 7 (Mailtrap/
 * SendGrid) sin tocar NotificationsService, que solo conoce MailProvider.
 */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[mail:consola] to=${to} subject="${subject}"\n${body}`);
  }
}
