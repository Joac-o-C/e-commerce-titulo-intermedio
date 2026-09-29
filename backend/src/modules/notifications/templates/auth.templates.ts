import { button, compose, formatDate, p, str, type TemplateFn } from './layout.js';

/** CU-01 / CU-07: link de verificación de correo. */
export const verificacion: TemplateFn = (data, ctx) =>
  compose('Confirmá tu cuenta', ctx, [
    p('Gracias por registrarte. Para activar tu cuenta hacé clic en el botón:'),
    button('Confirmar mi cuenta', `${ctx.frontendUrl}/verify-email?token=${encodeURIComponent(str(data, 'token'))}`),
    p(`El enlace vence en ${ctx.verificationTtlHours} horas. Si no creaste una cuenta, ignorá este correo.`),
  ]);

/** CU-08: link de restablecimiento de contraseña. */
export const resetPassword: TemplateFn = (data, ctx) =>
  compose('Restablecé tu contraseña', ctx, [
    p('Recibimos un pedido para restablecer tu contraseña.'),
    button('Elegir nueva contraseña', `${ctx.frontendUrl}/reset-password?token=${encodeURIComponent(str(data, 'token'))}`),
    p(
      `El enlace vence en ${ctx.resetTtlHours === 1 ? '1 hora' : `${ctx.resetTtlHours} horas`} y sirve una sola vez. ` +
        'Si no lo pediste, ignorá este correo: tu contraseña actual sigue funcionando.',
    ),
  ]);

/** CU-08 (paso 10): aviso de cambio de contraseña. */
export const passwordChanged: TemplateFn = (data, ctx) =>
  compose('Tu contraseña fue cambiada', ctx, [
    p(
      `La contraseña de tu cuenta se cambió el ${formatDate(data.changedAt)}. ` +
        'Por seguridad cerramos todas tus sesiones abiertas.',
    ),
    p('Si no fuiste vos, restablecela ahora y escribinos.'),
    button('¿Olvidaste tu contraseña?', `${ctx.frontendUrl}/forgot-password`),
  ]);
