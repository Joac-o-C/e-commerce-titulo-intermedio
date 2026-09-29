import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../../users/users.service.js';
import { PaymentAuditEvent, PaymentAuditLog } from '../entities/payment-audit-log.entity.js';
import { Refund, RefundOrigin, RefundStatus } from '../entities/refund.entity.js';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayUnavailableError,
  RefundRejectedError,
} from '../gateway/payment-gateway.interface.js';
import { PaymentLedgerService } from '../ledger/payment-ledger.service.js';
import { RefundsService } from './refunds.service.js';

const refund = (overrides: Partial<Refund> = {}): Refund =>
  ({
    id: 'refund-1',
    orderId: 'order-1',
    paymentId: 'payment-1',
    payment: { id: 'payment-1', externalPaymentId: 'mp-1' },
    amount: '700.00',
    status: RefundStatus.EN_TRAMITE,
    originCu: RefundOrigin.CU_14,
    attempt: 1,
    externalRefundId: null,
    ...overrides,
  }) as Refund;

const gatewayRefund = (status: string) => ({ id: 'mp-refund-1', paymentId: 'mp-1', status, amount: 700, raw: {} });

describe('RefundsService', () => {
  let service: RefundsService;
  const manager = { findOne: vi.fn(), save: vi.fn() };
  let gateway: { createRefund: ReturnType<typeof vi.fn>; getRefund: ReturnType<typeof vi.fn> };
  let refundRepo: Record<string, ReturnType<typeof vi.fn>>;
  let auditRepo: { save: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let ledger: { fitsInBalance: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };

  const auditedEvents = () => auditRepo.create.mock.calls.map(([log]) => log.eventType);
  /** Los cambios de estado son UPDATE condicionales: se miran los `changes` que se pidieron. */
  const statusUpdates = () =>
    refundRepo.update.mock.calls.map(([, changes]) => changes.status).filter((s): s is RefundStatus => s !== undefined);

  beforeEach(async () => {
    manager.findOne.mockReset();
    manager.save.mockReset();
    gateway = { createRefund: vi.fn().mockResolvedValue(gatewayRefund('in_process')), getRefund: vi.fn() };
    refundRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      count: vi.fn(),
    };
    auditRepo = { save: vi.fn(), create: vi.fn((log) => log) };
    ledger = { fitsInBalance: vi.fn().mockResolvedValue(true) };
    notifications = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: (cb: (m: unknown) => unknown) => cb(manager),
            getRepository: () => ({
              findOne: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 7, userId: 'user-1' }),
              findOneBy: vi.fn().mockResolvedValue({ id: 'payment-1', externalPaymentId: 'mp-1' }),
            }),
          },
        },
        { provide: getRepositoryToken(Refund), useValue: refundRepo },
        { provide: getRepositoryToken(PaymentAuditLog), useValue: auditRepo },
        { provide: PaymentLedgerService, useValue: ledger },
        { provide: NotificationsService, useValue: notifications },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'c@example.com' }) } },
      ],
    }).compile();

    service = moduleRef.get(RefundsService);
    service.retryDelaysMs = [0, 0];
  });

  describe('CU-21 Procesar reembolso', () => {
    it('4-6: pide el reembolso con clave de idempotencia, guarda el id de la pasarela y lo audita', async () => {
      refundRepo.findOne.mockResolvedValue(refund());

      await service.dispatch('refund-1');

      expect(gateway.createRefund).toHaveBeenCalledWith({ paymentId: 'mp-1', amount: 700, idempotencyKey: 'refund-1-1' });
      expect(refundRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'refund-1', status: RefundStatus.EN_TRAMITE, attempt: 1 }),
        { externalRefundId: 'mp-refund-1', lastError: null },
      );
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_SOLICITADO]);
      // "in_process" no es un resultado final: sigue en trámite y no se avisa.
      expect(statusUpdates()).toEqual([]);
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('9-11: si la pasarela lo aprueba en el acto, queda reembolsado, se audita y se avisa al Cliente', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      gateway.createRefund.mockResolvedValue(gatewayRefund('approved'));

      await service.dispatch('refund-1');

      expect(statusUpdates()).toEqual([RefundStatus.REEMBOLSADO]);
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_SOLICITADO, PaymentAuditEvent.REEMBOLSO_ACREDITADO]);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: EmailTemplate.RESULTADO_REEMBOLSO,
          relatedOrderId: 'order-1',
          data: expect.objectContaining({ orderNumber: 7, amount: '700.00', resultado: 'reembolsado' }),
        }),
      );
    });

    it('no vuelve a pedir un reembolso que ya tiene id de la pasarela o que dejó de estar en trámite', async () => {
      refundRepo.findOne.mockResolvedValueOnce(refund({ externalRefundId: 'mp-refund-1' }));
      await service.dispatch('refund-1');
      refundRepo.findOne.mockResolvedValueOnce(refund({ status: RefundStatus.REEMBOLSADO }));
      await service.dispatch('refund-1');

      expect(gateway.createRefund).not.toHaveBeenCalled();
    });

    it('6: si otro proceso ya guardó el id (mismo reembolso por idempotencia), no lo audita dos veces', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      refundRepo.update.mockResolvedValueOnce({ affected: 0 });

      await service.dispatch('refund-1');

      expect(auditedEvents()).toEqual([]);
    });

    it('4a: si la pasarela no responde reintenta hasta 3 veces con la misma clave y queda pendiente de gestión', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      gateway.createRefund.mockRejectedValue(new PaymentGatewayUnavailableError('timeout'));

      await expect(service.dispatch('refund-1')).resolves.toBeUndefined();

      expect(gateway.createRefund).toHaveBeenCalledTimes(3);
      expect(new Set(gateway.createRefund.mock.calls.map(([input]) => input.idempotencyKey))).toEqual(new Set(['refund-1-1']));
      expect(refundRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: RefundStatus.EN_TRAMITE }),
        { status: RefundStatus.PENDIENTE_DE_GESTION, lastError: 'timeout' },
      );
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_PASARELA_NO_DISPONIBLE]);
      // La alerta es el panel del Administrador (decisión de la Fase 6), no un correo.
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('4a: si la pasarela responde en un reintento, sigue el flujo normal', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      gateway.createRefund
        .mockRejectedValueOnce(new PaymentGatewayUnavailableError('timeout'))
        .mockResolvedValueOnce(gatewayRefund('in_process'));

      await service.dispatch('refund-1');

      expect(gateway.createRefund).toHaveBeenCalledTimes(2);
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_SOLICITADO]);
    });

    it('5a: si la pasarela rechaza la solicitud, queda rechazado (sin reintentos) y se avisa al Cliente', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      gateway.createRefund.mockRejectedValue(new RefundRejectedError('Pago demasiado antiguo'));

      await service.dispatch('refund-1');

      expect(gateway.createRefund).toHaveBeenCalledTimes(1);
      expect(statusUpdates()).toEqual([RefundStatus.RECHAZADO]);
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_RECHAZADO]);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ resultado: 'rechazado' }) }),
      );
    });

    it('8: aplica el estado que consulta a la pasarela, no el del webhook', async () => {
      refundRepo.find.mockResolvedValue([refund({ externalRefundId: 'mp-refund-1' })]);
      gateway.getRefund.mockResolvedValue(gatewayRefund('approved'));

      await service.reconcilePayment('mp-1');

      expect(gateway.getRefund).toHaveBeenCalledWith('mp-1', 'mp-refund-1');
      expect(statusUpdates()).toEqual([RefundStatus.REEMBOLSADO]);
      expect(notifications.send).toHaveBeenCalledTimes(1);
    });

    it('9a: si la pasarela informa que el reembolso falló, queda rechazado y se avisa al Cliente', async () => {
      refundRepo.find.mockResolvedValue([refund({ externalRefundId: 'mp-refund-1' })]);
      gateway.getRefund.mockResolvedValue(gatewayRefund('rejected'));

      await service.reconcilePayment('mp-1');

      expect(refundRepo.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: RefundStatus.RECHAZADO, lastError: expect.stringContaining('rejected') }),
      );
      expect(auditedEvents()).toEqual([PaymentAuditEvent.REEMBOLSO_RECHAZADO]);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ resultado: 'rechazado' }) }),
      );
    });

    it('8b: una notificación ya procesada no vuelve a auditar ni a mandar correo', async () => {
      refundRepo.find.mockResolvedValue([refund({ externalRefundId: 'mp-refund-1' })]);
      gateway.getRefund.mockResolvedValue(gatewayRefund('approved'));
      refundRepo.update.mockResolvedValue({ affected: 0 });

      await service.reconcilePayment('mp-1');

      expect(auditedEvents()).toEqual([]);
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('8: si la pasarela no responde la consulta, no lanza (lo retoma el cron) ni cambia nada', async () => {
      refundRepo.find.mockResolvedValue([refund({ externalRefundId: 'mp-refund-1' })]);
      gateway.getRefund.mockRejectedValue(new PaymentGatewayUnavailableError('timeout'));

      await expect(service.reconcilePayment('mp-1')).resolves.toBeUndefined();
      expect(refundRepo.update).not.toHaveBeenCalled();
    });

    it('10: si falla el correo, el reembolso queda firme igual', async () => {
      refundRepo.findOne.mockResolvedValue(refund());
      gateway.createRefund.mockResolvedValue(gatewayRefund('approved'));
      notifications.send.mockRejectedValue(new Error('EmailLog caído'));

      await expect(service.dispatch('refund-1')).resolves.toBeUndefined();
      expect(statusUpdates()).toEqual([RefundStatus.REEMBOLSADO]);
    });

    it('el cron retoma los reembolsos registrados que nunca se pidieron a la pasarela', async () => {
      refundRepo.find.mockResolvedValue([{ id: 'refund-1' }, { id: 'refund-2' }]);
      refundRepo.findOne.mockImplementation(({ where }) => Promise.resolve(refund({ id: where.id })));

      await service.dispatchPending();

      expect(gateway.createRefund.mock.calls.map(([input]) => input.idempotencyKey)).toEqual(['refund-1-1', 'refund-2-1']);
    });
  });

  describe('CU-19 Ver y gestionar pedidos (admin): gestión de reembolsos', () => {
    it('reintentar uno pendiente de gestión reusa el intento (misma clave de idempotencia) y lo vuelve a pedir', async () => {
      const r = refund({ status: RefundStatus.PENDIENTE_DE_GESTION, lastError: 'timeout' });
      manager.findOne.mockResolvedValue(r);
      refundRepo.findOne.mockResolvedValue(refund());

      await service.retry('refund-1', 'admin-1');

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: RefundStatus.EN_TRAMITE, attempt: 1, lastError: null }),
      );
      expect(ledger.fitsInBalance).not.toHaveBeenCalled();
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PaymentAuditEvent.REEMBOLSO_GESTION_MANUAL,
          payload: expect.objectContaining({ action: 'reintento', adminId: 'admin-1' }),
        }),
      );
      expect(gateway.createRefund).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'refund-1-1' }));
    });

    it('reintentar uno rechazado abre un intento nuevo, sin el id de la pasarela anterior', async () => {
      manager.findOne.mockResolvedValue(refund({ status: RefundStatus.RECHAZADO, externalRefundId: 'mp-refund-viejo' }));

      await service.retry('refund-1', 'admin-1');

      expect(ledger.fitsInBalance).toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: RefundStatus.EN_TRAMITE, attempt: 2, externalRefundId: null }),
      );
    });

    it('2b: no reintenta uno rechazado si ya no entra en el saldo reembolsable del pago', async () => {
      manager.findOne.mockResolvedValue(refund({ status: RefundStatus.RECHAZADO }));
      ledger.fitsInBalance.mockResolvedValue(false);

      const error = await service.retry('refund-1', 'admin-1').catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'REFUND_EXCEEDS_BALANCE' }));
      expect(manager.save).not.toHaveBeenCalled();
      expect(gateway.createRefund).not.toHaveBeenCalled();
    });

    it('no reintenta uno que no requiere gestión', async () => {
      manager.findOne.mockResolvedValue(refund({ status: RefundStatus.EN_TRAMITE }));

      const error = await service.retry('refund-1', 'admin-1').catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'REFUND_NOT_RETRYABLE' }));
    });

    it('reintentar uno inexistente responde 404', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.retry('nope', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolverlo por fuera lo deja reembolsado con la nota, lo audita y avisa al Cliente', async () => {
      refundRepo.findOne.mockResolvedValue(refund({ status: RefundStatus.RECHAZADO, payment: undefined }));

      await service.resolveManually('refund-1', 'admin-1', 'Transferencia bancaria');

      expect(refundRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'refund-1' }),
        expect.objectContaining({
          status: RefundStatus.REEMBOLSADO,
          resolutionNote: 'Transferencia bancaria',
          resolvedByUserId: 'admin-1',
        }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PaymentAuditEvent.REEMBOLSO_GESTION_MANUAL,
          externalPaymentId: 'mp-1',
          payload: expect.objectContaining({ action: 'resuelto_por_fuera', note: 'Transferencia bancaria' }),
        }),
      );
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ resultado: 'reembolsado' }) }),
      );
    });

    it('no lo resuelve por fuera si ya no requiere gestión (otro admin, o la pasarela lo acreditó)', async () => {
      refundRepo.findOne.mockResolvedValue(refund({ status: RefundStatus.REEMBOLSADO }));
      refundRepo.update.mockResolvedValue({ affected: 0 });

      const error = await service.resolveManually('refund-1', 'admin-1', 'nota').catch((e) => e);

      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'REFUND_NOT_RETRYABLE' }));
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('resolver por fuera uno inexistente responde 404', async () => {
      refundRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveManually('nope', 'admin-1', 'nota')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
