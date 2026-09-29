import type { MailMessage, MailProvider } from '../../src/modules/notifications/mail-provider.interface.js';

/**
 * Servicio de Correo en memoria para los e2e: reemplaza a MAIL_PROVIDER y
 * guarda cada mensaje entregado. Como la auditoría ya no guarda el token en
 * claro (CU-20), los tests lo sacan del link del correo, igual que el Cliente.
 */
export class CapturedMail implements MailProvider {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  /** Espera la entrega en segundo plano y devuelve el token del último link `path?token=` enviado a `to`. */
  async tokenFor(to: string, path: '/verify-email' | '/reset-password', timeoutMs = 2000): Promise<string> {
    const pattern = new RegExp(`${path}\\?token=([^\\s"&]+)`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.messages
        .filter((m) => m.to === to)
        .map((m) => pattern.exec(m.text))
        .findLast(Boolean);
      if (match) return decodeURIComponent(match[1]);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No llegó ningún correo a ${to} con un link ${path}`);
  }
}
