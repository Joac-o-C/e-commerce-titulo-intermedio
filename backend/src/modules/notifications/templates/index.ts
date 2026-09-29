import { EmailTemplate } from '../entities/email-log.entity.js';
import { passwordChanged, resetPassword, verificacion } from './auth.templates.js';
import type { TemplateFn } from './layout.js';
import { cambioEstadoPedido, cancelacion, confirmacionPedido, resultadoPago } from './orders.templates.js';
import { comprobantePosventa, resultadoPosventa, resultadoReembolso } from './posventa.templates.js';

export type { ComposedMessage, TemplateContext, TemplateData } from './layout.js';

/** Catálogo de CU-20: una plantilla ausente acá es el flujo 2b. */
export const TEMPLATES: Readonly<Partial<Record<EmailTemplate, TemplateFn>>> = {
  [EmailTemplate.VERIFICACION]: verificacion,
  [EmailTemplate.RESET_PASSWORD]: resetPassword,
  [EmailTemplate.PASSWORD_CHANGED]: passwordChanged,
  [EmailTemplate.RESULTADO_PAGO]: resultadoPago,
  [EmailTemplate.CONFIRMACION_PEDIDO]: confirmacionPedido,
  [EmailTemplate.CAMBIO_ESTADO_PEDIDO]: cambioEstadoPedido,
  [EmailTemplate.CANCELACION]: cancelacion,
  [EmailTemplate.COMPROBANTE_POSVENTA]: comprobantePosventa,
  [EmailTemplate.RESULTADO_POSVENTA]: resultadoPosventa,
  [EmailTemplate.RESULTADO_REEMBOLSO]: resultadoReembolso,
};
