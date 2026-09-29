import { EmailTemplate } from '../entities/email-log.entity.js';
import { TEMPLATES, type TemplateContext } from './index.js';
import { escapeHtml } from './layout.js';

const ctx: TemplateContext = {
  frontendUrl: 'http://front.test',
  verificationTtlHours: 24,
  resetTtlHours: 1,
  reservationTtlHours: 24,
  recipientName: 'Ana',
  orderUrl: 'http://front.test/account/orders/o-1',
};

const render = (template: EmailTemplate, data: Record<string, unknown>, context = ctx) => TEMPLATES[template]!(data, context);

describe('Plantillas de correo', () => {
  describe('CU-20 Enviar notificación por correo', () => {
    it('el catálogo cubre todas las plantillas del enum', () => {
      for (const template of Object.values(EmailTemplate)) {
        expect(TEMPLATES[template], template).toBeTypeOf('function');
      }
    });

    it('todas componen asunto, HTML y texto plano aun con datos faltantes', () => {
      for (const template of Object.values(EmailTemplate)) {
        const message = render(template, {});
        expect(message.subject, template).not.toBe('');
        expect(message.html, template).toContain('<!doctype html>');
        expect(message.text, template).toContain('Hola Ana,');
        expect(message.text, template).toContain('El equipo de la tienda');
      }
    });

    it('escapa en el HTML los datos que vienen del usuario', () => {
      const message = render(EmailTemplate.RESULTADO_POSVENTA, {
        event: 'rechazada',
        requestNumber: 7,
        reason: '<script>alert(1)</script>',
      });
      expect(message.html).not.toContain('<script>');
      expect(message.html).toContain(escapeHtml('<script>alert(1)</script>'));
      expect(message.text).toContain('Motivo: <script>alert(1)</script>');
    });

    it('sin nombre del destinatario saluda en forma genérica', () => {
      expect(render(EmailTemplate.PASSWORD_CHANGED, {}, { ...ctx, recipientName: null }).text).toMatch(/^Hola,/);
    });
  });

  describe('CU-07 / CU-08 links de un solo uso', () => {
    it('verificación: link al frontend con el token codificado y el vencimiento', () => {
      const message = render(EmailTemplate.VERIFICACION, { token: 'a b+c' });
      expect(message.text).toContain('http://front.test/verify-email?token=a%20b%2Bc');
      expect(message.text).toContain('vence en 24 horas');
    });

    it('restablecimiento: link a /reset-password y vencimiento de 1 hora', () => {
      const message = render(EmailTemplate.RESET_PASSWORD, { token: 'xyz' });
      expect(message.subject).toBe('Restablecé tu contraseña');
      expect(message.text).toContain('http://front.test/reset-password?token=xyz');
      expect(message.text).toContain('vence en 1 hora');
    });
  });

  describe('CU-05 Procesar confirmación de pago', () => {
    it('confirmación de pedido: detalle de ítems, envío, total y dirección', () => {
      const message = render(EmailTemplate.CONFIRMACION_PEDIDO, {
        orderNumber: 42,
        items: [{ name: 'Remera', variant: 'M / Negro', quantity: 2, subtotal: '600.00' }],
        shippingMethod: 'Correo a domicilio',
        shippingCost: '100.00',
        shippingAddress: { street: 'Mitre', number: '123', floorApt: '2B', city: 'Rosario', province: 'Santa Fe', postalCode: '2000' },
        total: '700.00',
      });
      expect(message.subject).toBe('¡Confirmamos tu pedido #42!');
      expect(message.text).toContain('Remera · M / Negro · 2');
      expect(message.text).toContain('Correo a domicilio');
      expect(message.text).toContain('Mitre 123 2B, Rosario, Santa Fe (2000)');
      expect(message.html).toContain('<table');
      expect(message.text).toContain('Ver pedido: http://front.test/account/orders/o-1');
    });

    it('confirmación con retiro: dónde retirarlo, dirección de referencia y aviso de "listo para retirar"', () => {
      const message = render(EmailTemplate.CONFIRMACION_PEDIDO, {
        orderNumber: 43,
        items: [],
        shippingMethod: 'Retiro en sucursal del correo',
        shippingType: 'retiro',
        shippingDescription: 'Retirás en la sucursal más cercana a la dirección, en 3 a 5 días hábiles',
        shippingCost: '2500.00',
        shippingAddress: { street: 'Mitre', number: '123', floorApt: null, city: 'Rosario', province: 'Santa Fe', postalCode: '2000' },
        total: '2500.00',
      });
      expect(message.text).toContain('Lo retirás en: Retiro en sucursal del correo.');
      expect(message.text).toContain('Retirás en la sucursal más cercana a la dirección, en 3 a 5 días hábiles');
      expect(message.text).toContain('Dirección de referencia: Mitre 123, Rosario, Santa Fe (2000)');
      expect(message.text).toContain('Te vamos a avisar cuando esté listo para retirar.');
      expect(message.text).not.toContain('Lo enviamos a');
      expect(message.text).not.toContain('despachemos');
    });

    it('confirmación sin tipo de envío (pedidos anteriores): se trata como entrega a domicilio', () => {
      const message = render(EmailTemplate.CONFIRMACION_PEDIDO, {
        orderNumber: 44,
        shippingMethod: 'Envío estándar',
        shippingAddress: { street: 'Mitre', number: '1', floorApt: null, city: 'Rosario', province: 'Santa Fe', postalCode: '2000' },
      });
      expect(message.text).toContain('Lo enviamos a: Mitre 1');
      expect(message.text).toContain('Te vamos a avisar cuando lo despachemos.');
    });

    it('resultado de pago: distingue rechazado de pendiente', () => {
      expect(render(EmailTemplate.RESULTADO_PAGO, { orderNumber: 5, resultado: 'rechazado' }).subject).toBe(
        'No pudimos procesar el pago de tu pedido #5',
      );
      expect(render(EmailTemplate.RESULTADO_PAGO, { orderNumber: 5, resultado: 'pendiente' }).subject).toBe(
        'Tu pago del pedido #5 está pendiente de acreditación',
      );
    });
  });

  describe('CU-19 / CU-14 pedidos', () => {
    it('cambio de estado: usa el texto del estado e incluye el seguimiento', () => {
      const message = render(EmailTemplate.CAMBIO_ESTADO_PEDIDO, {
        orderNumber: 9,
        status: 'despachado',
        tracking: { carrier: 'Andreani', number: 'AB123' },
      });
      expect(message.subject).toBe('Tu pedido #9 está despachado');
      expect(message.text).toContain('Lo lleva Andreani, número de seguimiento AB123.');
    });

    it('cancelación: menciona el reembolso sólo si se pidió', () => {
      expect(render(EmailTemplate.CANCELACION, { orderNumber: 3, total: '10', refundRequested: true }).text).toContain(
        'reembolso',
      );
      expect(render(EmailTemplate.CANCELACION, { orderNumber: 3, total: '10', refundRequested: false }).text).not.toContain(
        'reembolso',
      );
    });
  });

  describe('CU-15 / CU-21 / CU-22 posventa y reembolsos', () => {
    it('comprobante de posventa: tipo, número e instrucciones', () => {
      const message = render(EmailTemplate.COMPROBANTE_POSVENTA, {
        orderNumber: 3,
        requestNumber: 11,
        type: 'devolucion',
        instructions: 'Embalá el producto.',
      });
      expect(message.subject).toBe('Recibimos tu solicitud de devolución #11');
      expect(message.text).toContain('Cómo seguir: Embalá el producto.');
    });

    it('resultado de posventa: un asunto por evento', () => {
      const subject = (event: string) => render(EmailTemplate.RESULTADO_POSVENTA, { event, requestNumber: 4 }).subject;
      expect(subject('aprobada')).toBe('Aprobamos tu solicitud #4');
      expect(subject('rechazada')).toBe('Tu solicitud #4 fue rechazada');
      expect(subject('resuelta')).toBe('Resolvimos tu solicitud #4');
      expect(subject('reposicion_despachada')).toBe('Despachamos el producto de reemplazo de tu solicitud #4');
    });

    it('resultado de reembolso: acreditado o con problemas', () => {
      expect(render(EmailTemplate.RESULTADO_REEMBOLSO, { orderNumber: 8, amount: '50', resultado: 'reembolsado' }).subject).toBe(
        'Tu reembolso del pedido #8 fue acreditado',
      );
      expect(render(EmailTemplate.RESULTADO_REEMBOLSO, { orderNumber: 8, amount: '50', resultado: 'rechazado' }).subject).toBe(
        'Hubo un problema con el reembolso del pedido #8',
      );
    });
  });
});
