import { compose, formatDate, formatMoney, orderButton, p, str, type TemplateFn } from './layout.js';

const typeLabel = (data: Record<string, unknown>) => (data.type === 'cambio' ? 'cambio' : 'devolución');

/** CU-15: comprobante de la solicitud de cambio o devolución. */
export const comprobantePosventa: TemplateFn = (data, ctx) => {
  const req = str(data, 'requestNumber');
  return compose(`Recibimos tu solicitud de ${typeLabel(data)} #${req}`, ctx, [
    p(`Registramos tu solicitud #${req} sobre el pedido #${str(data, 'orderNumber')}.`),
    p(`Cómo seguir: ${str(data, 'instructions')}`),
    ...orderButton(ctx),
  ]);
};

/** CU-22: aprobación, rechazo, resolución y reposición despachada. */
export const resultadoPosventa: TemplateFn = (data, ctx) => {
  const req = str(data, 'requestNumber');
  switch (data.event) {
    case 'aprobada':
      return compose(`Aprobamos tu solicitud #${req}`, ctx, [
        p(`Aprobamos tu solicitud de ${typeLabel(data)} #${req} del pedido #${str(data, 'orderNumber')}.`),
        ...(data.partialRejectionReason
          ? [p(`La aprobamos en forma parcial: ${str(data, 'partialRejectionReason')}`)]
          : []),
        p(`Cómo seguir: ${str(data, 'instructions')}`),
        ...(data.receptionDeadline
          ? [p(`Tenemos que recibir el producto antes del ${formatDate(data.receptionDeadline, false)}.`)]
          : []),
        ...orderButton(ctx),
      ]);
    case 'rechazada':
      return compose(`Tu solicitud #${req} fue rechazada`, ctx, [
        p(`Revisamos tu solicitud de ${typeLabel(data)} #${req} y no pudimos aprobarla.`),
        p(`Motivo: ${str(data, 'reason')}`),
        ...orderButton(ctx),
      ]);
    case 'resuelta':
      return compose(`Resolvimos tu solicitud #${req}`, ctx, [
        p(`Recibimos el producto y resolvimos tu solicitud de ${typeLabel(data)} #${req}.`),
        ...(data.resolutionNote ? [p(str(data, 'resolutionNote'))] : []),
        ...orderButton(ctx),
      ]);
    case 'reposicion_despachada': {
      const tracking = data.tracking as { carrier: string | null; number: string | null } | null | undefined;
      const parts = [
        tracking?.carrier ? `Lo lleva ${tracking.carrier}` : '',
        tracking?.number ? `número de seguimiento ${tracking.number}` : '',
      ].filter(Boolean);
      return compose(`Despachamos el producto de reemplazo de tu solicitud #${req}`, ctx, [
        p(`Ya despachamos el producto de reemplazo de tu solicitud de cambio #${req}.`),
        ...(parts.length ? [p(`${parts.join(', ')}.`)] : []),
        ...orderButton(ctx),
      ]);
    }
    default:
      return compose(`Novedades sobre tu solicitud #${req}`, ctx, [
        p(`Hay novedades sobre tu solicitud #${req}.`),
        ...orderButton(ctx),
      ]);
  }
};

/** CU-21: resultado del reembolso. */
export const resultadoReembolso: TemplateFn = (data, ctx) => {
  const n = str(data, 'orderNumber');
  const amount = formatMoney(data.amount);
  return data.resultado === 'reembolsado'
    ? compose(`Tu reembolso del pedido #${n} fue acreditado`, ctx, [
        p(
          `Devolvimos ${amount} al medio de pago original. ` +
            'Según tu banco puede tardar unos días en verse reflejado.',
        ),
        ...orderButton(ctx),
      ])
    : compose(`Hubo un problema con el reembolso del pedido #${n}`, ctx, [
        p(
          `La pasarela no pudo procesar la devolución de ${amount}. ` +
            'Nuestro equipo lo está revisando y te va a contactar.',
        ),
        ...orderButton(ctx),
      ]);
};
