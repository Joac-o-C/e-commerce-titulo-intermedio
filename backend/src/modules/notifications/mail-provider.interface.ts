export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/**
 * Puerto de bajo nivel hacia el Servicio de Correo externo. NotificationsService
 * depende solo de esta interfaz, nunca de un proveedor concreto — permite
 * mockearlo en tests y reemplazar ConsoleMailProvider por un proveedor real
 * (Mailtrap/SendGrid) en la Fase 7 sin tocar la lógica de negocio de CU-20.
 */
export interface MailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}
