import { MailPermanentError } from '../mail-provider.interface.js';
import { classifySmtpError } from './smtp-mail.provider.js';

const smtpError = (responseCode?: number) => Object.assign(new Error(`SMTP ${responseCode ?? 'sin código'}`), { responseCode });

describe('SmtpMailProvider', () => {
  describe('CU-20 Enviar notificación por correo', () => {
    it('5a: una respuesta 5xx (casilla inexistente) es un rebote', () => {
      expect(classifySmtpError(smtpError(550))).toBeInstanceOf(MailPermanentError);
      expect(classifySmtpError(smtpError(554))).toBeInstanceOf(MailPermanentError);
    });

    it('4a: una respuesta 4xx es transitoria y se reintenta', () => {
      const err = classifySmtpError(smtpError(421));
      expect(err).not.toBeInstanceOf(MailPermanentError);
      expect(err.message).toBe('SMTP 421');
    });

    it('4a: un error de conexión o timeout (sin código SMTP) es transitorio', () => {
      expect(classifySmtpError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }))).not.toBeInstanceOf(
        MailPermanentError,
      );
      expect(classifySmtpError('algo raro')).toBeInstanceOf(Error);
    });
  });
});
