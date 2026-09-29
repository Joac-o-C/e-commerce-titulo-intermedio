import { ORDER_STATUS_LABELS, type OrderStatus } from '../../orders/order-status.js';
import { compose, formatMoney, orderButton, p, str, table, type TemplateFn } from './layout.js';

interface ConfirmationItem {
  name: string;
  variant: string;
  quantity: number;
  subtotal: string;
}

interface ShippingAddress {
  street: string;
  number: string;
  floorApt: string | null;
  city: string;
  province: string;
  postalCode: string;
}

/** CU-05 (paso 9): pago rechazado o pendiente de acreditación. El aprobado va por `confirmacionPedido`. */
export const resultadoPago: TemplateFn = (data, ctx) => {
  const n = str(data, 'orderNumber');
  switch (data.resultado) {
    case 'rechazado':
      return compose(`No pudimos procesar el pago de tu pedido #${n}`, ctx, [
        p(
          'El pago fue rechazado. Podés reintentarlo desde el detalle de tu pedido; ' +
            `la reserva de los productos se mantiene hasta ${ctx.reservationTtlHours} h desde la compra.`,
        ),
        ...orderButton(ctx),
      ]);
    case 'pendiente':
      return compose(`Tu pago del pedido #${n} está pendiente de acreditación`, ctx, [
        p('Te avisamos apenas se acredite. No hace falta que hagas nada.'),
        ...orderButton(ctx),
      ]);
    default:
      return compose(`Recibimos el pago de tu pedido #${n}`, ctx, [p('El pago fue acreditado.'), ...orderButton(ctx)]);
  }
};

/** CU-05 (paso 9): pago aprobado, con el detalle del pedido. */
export const confirmacionPedido: TemplateFn = (data, ctx) => {
  const items = (data.items as ConfirmationItem[] | undefined) ?? [];
  const address = data.shippingAddress as ShippingAddress | undefined;
  const addressLine = address
    ? `${address.street} ${address.number}${address.floorApt ? ` ${address.floorApt}` : ''}, ` +
      `${address.city}, ${address.province} (${address.postalCode})`
    : '';
  // Retiro (local o sucursal): la dirección es sólo de referencia; los pedidos
  // sin `shippingType` (anteriores a la Fase 7) se tratan como entrega a domicilio.
  const pickup = data.shippingType === 'retiro';
  const deliveryBlocks = pickup
    ? [
        p(`Lo retirás en: ${str(data, 'shippingMethod')}.`),
        ...(data.shippingDescription ? [p(str(data, 'shippingDescription'))] : []),
        ...(addressLine ? [p(`Dirección de referencia: ${addressLine}`)] : []),
        p('Te vamos a avisar cuando esté listo para retirar.'),
      ]
    : [
        ...(addressLine ? [p(`Lo enviamos a: ${addressLine}`)] : []),
        p('Te vamos a avisar cuando lo despachemos.'),
      ];
  return compose(`¡Confirmamos tu pedido #${str(data, 'orderNumber')}!`, ctx, [
    p('Recibimos el pago. Este es el detalle:'),
    table(
      ['Producto', 'Variante', 'Cantidad', 'Subtotal'],
      items.map((i) => [i.name, i.variant || '—', String(i.quantity), formatMoney(i.subtotal)]),
    ),
    p(`Envío: ${str(data, 'shippingMethod')} (${formatMoney(data.shippingCost)})`),
    p(`Total: ${formatMoney(data.total)}`),
    ...deliveryBlocks,
    ...orderButton(ctx),
  ]);
};

/** CU-19: cambio de estado del pedido hecho por el Administrador. */
export const cambioEstadoPedido: TemplateFn = (data, ctx) => {
  const label = ORDER_STATUS_LABELS[data.status as OrderStatus] ?? str(data, 'status');
  const tracking = data.tracking as { carrier: string | null; number: string | null } | null | undefined;
  const trackingParts = [
    tracking?.carrier ? `Lo lleva ${tracking.carrier}` : '',
    tracking?.number ? `número de seguimiento ${tracking.number}` : '',
  ].filter(Boolean);
  return compose(`Tu pedido #${str(data, 'orderNumber')} está ${label.toLowerCase()}`, ctx, [
    p(`El estado de tu pedido pasó a «${label}».`),
    ...(trackingParts.length ? [p(`${trackingParts.join(', ')}.`)] : []),
    ...orderButton(ctx),
  ]);
};

/** CU-14 / CU-19: pedido cancelado. */
export const cancelacion: TemplateFn = (data, ctx) => {
  const n = str(data, 'orderNumber');
  return compose(`Tu pedido #${n} fue cancelado`, ctx, [
    p(`Cancelamos tu pedido #${n} por ${formatMoney(data.total)}.`),
    ...(data.refundRequested
      ? [p('Ya iniciamos el reembolso del pago; te avisamos por correo cuando se acredite.')]
      : []),
    ...orderButton(ctx),
  ]);
};
