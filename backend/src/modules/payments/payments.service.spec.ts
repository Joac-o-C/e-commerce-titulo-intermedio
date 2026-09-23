import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { EmailTemplate } from '../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { UsersService } from '../users/users.service.js';
import { PaymentAuditEvent, PaymentAuditLog } from './entities/payment-audit-log.entity.js';
import { Payment, PaymentStatus } from './entities/payment.entity.js';
import {
  type GatewayPayment,
  PAYMENT_GATEWAY,
  PaymentGatewayUnavailableError,
  PaymentNotFoundError,
} from './gateway/payment-gateway.interface.js';
import { signWebhook } from './gateway/webhook-signature.js';
import { PaymentsService } from './payments.service.js';

const SECRET = 'secreto-de-test';
const ORDER_ID = '0b6a4b1e-3c55-4c4e-9f7e-2a7d0d1f6a11';

const gatewayPayment = (overrides: Partial<GatewayPayment> = {}): GatewayPayment => ({
  id: '123',
  status: 'approved',
  statusDetail: 'accredited',
  amount: 700,
  currency: 'ARS',
  installments: 1,
  method: 'visa',
  orderId: ORDER_ID,
  raw: {},
  ...overrides,
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let gateway: { getPayment: ReturnType<typeof vi.fn>; findPaymentsByOrder: ReturnType<typeof vi.fn> };
  let manager: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let auditRepo: { save: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let ordersService: Record<string, ReturnType<typeof vi.fn>>;
  let notifications: { send: ReturnType<typeof vi.fn> };
  const lockedOrder = { id: ORDER_ID, userId: 'user-1', total: '700.00', status: 'pagado', items: [] };

  const auditedEvents = () => auditRepo.create.mock.calls.map(([data]) => data.eventType);

  beforeEach(async () => {
    gateway = { getPayment: vi.fn().mockResolvedValue(gatewayPayment()), findPaymentsByOrder: vi.fn() };
    manager = {
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      create: vi.fn(() => new Payment()),
    };
    auditRepo = { save: vi.fn(), create: vi.fn((data) => data) };
    ordersService = {
      findById: vi.fn().mockResolvedValue({ id: ORDER_ID }),
      lockWithItems: vi.fn().mockResolvedValue({ ...lockedOrder }),
      applyPaymentOutcome: vi.fn().mockResolvedValue({ changed: true }),
      appendInternalNote: vi.fn(),
    };
    notifications = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: getDataSourceToken(), useValue: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
        { provide: getRepositoryToken(PaymentAuditLog), useValue: auditRepo },
        { provide: OrdersService, useValue: ordersService },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ email: 'c@example.com' }) } },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => ({ PAYMENT_WEBHOOK_SECRET: SECRET, PAYMENT_CURRENCY: 'ARS' })[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
    service.retryDelaysMs = [0, 0];
  });

  const signedNotification = (dataId = '123', secret = SECRET) => ({
    headers: signWebhook(dataId, secret),
    query: { 'data.id': dataId, type: 'payment' },
    body: { type: 'payment', data: { id: dataId } },
  });

  describe('CU-05 Procesar confirmación de pago', () => {
    it('procesa un pago aprobado: lo registra, actualiza el pedido, notifica y audita', async () => {
      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('processed');
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ externalPaymentId: '123', status: PaymentStatus.APROBADO, amount: '700.00' }),
      );
      expect(ordersService.applyPaymentOutcome).toHaveBeenCalledWith(manager, expect.anything(), 'aprobado', '123');
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: EmailTemplate.RESULTADO_PAGO, relatedOrderId: ORDER_ID }),
      );
      expect(auditedEvents()).toEqual([PaymentAuditEvent.PAGO_PROCESADO]);
    });

    it('nunca confía en el webhook: el estado sale de la consulta a la pasarela', async () => {
      gateway.getPayment.mockResolvedValue(gatewayPayment({ status: 'rejected' }));

      await service.handleNotification(signedNotification());

      expect(ordersService.applyPaymentOutcome).toHaveBeenCalledWith(manager, expect.anything(), 'rechazado', '123');
    });

    it('3a: descarta y audita una notificación con firma inválida', async () => {
      const result = await service.handleNotification(signedNotification('123', 'otro-secreto'));

      expect(result).toBe('invalid');
      expect(gateway.getPayment).not.toHaveBeenCalled();
      expect(auditedEvents()).toEqual([PaymentAuditEvent.NOTIFICACION_INVALIDA]);
    });

    it('3a: descarta una notificación sin data.id', async () => {
      const result = await service.handleNotification({ headers: {}, query: { type: 'payment' }, body: {} });

      expect(result).toBe('invalid');
    });

    it('3a: descarta un pago que no existe en la pasarela, sin reintentar', async () => {
      gateway.getPayment.mockRejectedValue(new PaymentNotFoundError('123'));

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('invalid');
      expect(gateway.getPayment).toHaveBeenCalledTimes(1);
    });

    it('ignora tópicos que no son pagos (merchant_order)', async () => {
      const result = await service.handleNotification({ headers: {}, query: { topic: 'merchant_order', id: '9' }, body: {} });

      expect(result).toBe('ignored');
      expect(auditRepo.save).not.toHaveBeenCalled();
    });

    it('4a: registra la inconsistencia si no existe el pedido de la referencia externa', async () => {
      ordersService.findById.mockResolvedValue(null);

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('order_not_found');
      expect(auditedEvents()).toEqual([PaymentAuditEvent.PEDIDO_INEXISTENTE]);
      expect(ordersService.applyPaymentOutcome).not.toHaveBeenCalled();
    });

    it('5a: reintenta 3 veces y, si la pasarela no responde, no toca el pedido', async () => {
      gateway.getPayment.mockRejectedValue(new PaymentGatewayUnavailableError('timeout'));

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('gateway_unavailable');
      expect(gateway.getPayment).toHaveBeenCalledTimes(3);
      expect(ordersService.lockWithItems).not.toHaveBeenCalled();
      expect(auditedEvents()).toEqual([PaymentAuditEvent.PASARELA_NO_DISPONIBLE]);
    });

    it('5a: se recupera si la pasarela responde en un reintento', async () => {
      gateway.getPayment
        .mockRejectedValueOnce(new PaymentGatewayUnavailableError('timeout'))
        .mockResolvedValueOnce(gatewayPayment());

      expect(await service.handleNotification(signedNotification())).toBe('processed');
    });

    it('6a: una notificación repetida no vuelve a aplicar cambios ni reenvía correos', async () => {
      manager.findOne.mockResolvedValue({ externalPaymentId: '123', status: PaymentStatus.APROBADO });

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('duplicate');
      expect(ordersService.applyPaymentOutcome).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
      expect(auditedEvents()).toEqual([PaymentAuditEvent.NOTIFICACION_DUPLICADA]);
    });

    it('6a: un "pendiente" que llega después de un estado final se descarta (fuera de orden)', async () => {
      manager.findOne.mockResolvedValue({ externalPaymentId: '123', status: PaymentStatus.APROBADO });
      gateway.getPayment.mockResolvedValue(gatewayPayment({ status: 'in_process' }));

      expect(await service.handleNotification(signedNotification())).toBe('duplicate');
      expect(ordersService.applyPaymentOutcome).not.toHaveBeenCalled();
    });

    it('un pago ya final informado con otro estado final no se pisa: queda como discrepancia', async () => {
      const existing = { externalPaymentId: '123', status: PaymentStatus.APROBADO };
      manager.findOne.mockResolvedValue(existing);
      gateway.getPayment.mockResolvedValue(gatewayPayment({ status: 'cancelled' }));

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('discrepancy');
      expect(manager.save).not.toHaveBeenCalled();
      expect(existing.status).toBe(PaymentStatus.APROBADO);
      expect(ordersService.applyPaymentOutcome).not.toHaveBeenCalled();
    });

    it('paso 11: la reconciliación pedida por la página de retorno no reintenta contra la pasarela', async () => {
      gateway.findPaymentsByOrder.mockResolvedValue([gatewayPayment()]);
      gateway.getPayment.mockRejectedValue(new PaymentGatewayUnavailableError('timeout'));

      await service.reconcileOrder(ORDER_ID, 'retorno_cliente');

      expect(gateway.getPayment).toHaveBeenCalledTimes(1);
    });

    it('7b-1: un rechazo sobre un pedido ya pagado queda como discrepancia, sin notificar', async () => {
      gateway.getPayment.mockResolvedValue(gatewayPayment({ status: 'rejected' }));
      ordersService.applyPaymentOutcome.mockResolvedValue({ changed: false, discrepancy: 'ya pagado' });

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('discrepancy');
      expect(ordersService.appendInternalNote).toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
      expect(auditedEvents()).toEqual([PaymentAuditEvent.DISCREPANCIA]);
    });

    it('no acredita un pago aprobado por un importe distinto al total del pedido', async () => {
      gateway.getPayment.mockResolvedValue(gatewayPayment({ amount: 1 }));

      const result = await service.handleNotification(signedNotification());

      expect(result).toBe('discrepancy');
      expect(ordersService.applyPaymentOutcome).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('no notifica si el pago no cambió el estado del pedido', async () => {
      ordersService.applyPaymentOutcome.mockResolvedValue({ changed: false });

      expect(await service.handleNotification(signedNotification())).toBe('processed');
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('reconciliación periódica: procesa los pagos que la pasarela informa para cada pedido pendiente', async () => {
      ordersService.findAwaitingPaymentIds = vi.fn().mockResolvedValue([ORDER_ID]);
      gateway.findPaymentsByOrder.mockResolvedValue([gatewayPayment()]);

      await service.reconcileAwaitingOrders();

      expect(gateway.findPaymentsByOrder).toHaveBeenCalledWith(ORDER_ID);
      expect(ordersService.applyPaymentOutcome).toHaveBeenCalled();
    });
  });
});
