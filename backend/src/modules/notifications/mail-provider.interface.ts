export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Rechazo permanente del Servicio de Correo (p. ej. SMTP 550, casilla
 * inexistente): CU-20 (flujo 5a) lo registra como rebote y no reintenta.
 * Cualquier otro error se considera transitorio (flujo 4a).
 */
export class MailPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailPermanentError';
  }
}

/**
 * Puerto de bajo nivel hacia el Servicio de Correo externo. NotificationsService
 * depende solo de esta interfaz, nunca de un proveedor concreto — permite
 * mockearlo en tests y elegir el proveedor por env (`MAIL_PROVIDER`) sin
 * tocar la lógica de negocio de CU-20.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
