import { customerCancellation, paymentRetry, returnWindow } from './order-policies.js';
import { OrderStatus } from './order-status.js';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-09-28T12:00:00Z');
const order = (overrides: Partial<Parameters<typeof customerCancellation>[0]> = {}) => ({
  status: OrderStatus.PENDIENTE_PAGO,
  paidAt: null,
  deliveredAt: null,
  reservationExpiresAt: new Date(now.getTime() + HOUR),
  ...overrides,
});

describe('order-policies', () => {
  describe('CU-14 Cancelar pedido', () => {
    it.each([
      OrderStatus.PENDIENTE_PAGO,
      OrderStatus.PAGO_PENDIENTE_ACREDITACION,
      OrderStatus.PAGO_RECHAZADO,
    ])('permite cancelar un pedido impago en "%s"', (status) => {
      expect(customerCancellation(order({ status }), now)).toEqual({ allowed: true });
    });

    it('permite cancelar un pedido pagado dentro de las 24 h, con el plazo como deadline', () => {
      const paidAt = new Date(now.getTime() - 23 * HOUR);
      expect(customerCancellation(order({ status: OrderStatus.EN_PREPARACION, paidAt }), now)).toEqual({
        allowed: true,
        deadline: new Date(paidAt.getTime() + 24 * HOUR),
      });
    });

    it('2c: rechaza la cancelación si pasaron más de 24 h desde la acreditación', () => {
      const result = customerCancellation(order({ status: OrderStatus.PAGADO, paidAt: new Date(now.getTime() - 25 * HOUR) }), now);
      expect(result).toEqual(expect.objectContaining({ allowed: false, code: 'CANCEL_WINDOW_EXPIRED' }));
    });

    it.each([OrderStatus.DESPACHADO, OrderStatus.ENTREGADO, OrderStatus.CANCELADO, OrderStatus.DEVUELTO])(
      '2a: no admite cancelar un pedido "%s"',
      (status) => {
        expect(customerCancellation(order({ status }), now)).toEqual(
          expect.objectContaining({ allowed: false, code: 'ORDER_NOT_CANCELLABLE' }),
        );
      },
    );
  });

  describe('CU-13 Ver mis pedidos', () => {
    it('7b: ofrece reintentar el pago en "pendiente de pago" y "pago rechazado"', () => {
      expect(paymentRetry(order({ status: OrderStatus.PAGO_RECHAZADO }), now).allowed).toBe(true);
      expect(paymentRetry(order({ status: OrderStatus.PENDIENTE_PAGO }), now).allowed).toBe(true);
    });

    it('7b: no ofrece reintentar con la reserva vencida ni con el pago pendiente de acreditación', () => {
      expect(paymentRetry(order({ reservationExpiresAt: new Date(now.getTime() - 1) }), now)).toEqual(
        expect.objectContaining({ code: 'ORDER_EXPIRED' }),
      );
      expect(paymentRetry(order({ status: OrderStatus.PAGO_PENDIENTE_ACREDITACION }), now).allowed).toBe(false);
    });
  });

  describe('CU-15 Solicitar cambio o devolución', () => {
    const delivered = (daysAgo: number) =>
      order({ status: OrderStatus.ENTREGADO, deliveredAt: new Date(now.getTime() - daysAgo * 24 * HOUR) });

    it('permite la solicitud dentro de los 10 días de la entrega', () => {
      expect(returnWindow(delivered(9), now).allowed).toBe(true);
    });

    it('2b: el plazo vence a los 10 días corridos de la entrega', () => {
      expect(returnWindow(delivered(10), now)).toEqual(expect.objectContaining({ code: 'RETURN_WINDOW_EXPIRED' }));
    });

    it('2a: un pedido no entregado no admite posventa', () => {
      expect(returnWindow(order({ status: OrderStatus.DESPACHADO }), now)).toEqual(
        expect.objectContaining({ code: 'ORDER_NOT_DELIVERED' }),
      );
    });
  });
});
