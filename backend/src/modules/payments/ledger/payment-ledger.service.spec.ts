import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity.js';
import { Refund, RefundOrigin, RefundStatus } from '../entities/refund.entity.js';
import { PaymentLedgerService } from './payment-ledger.service.js';

describe('PaymentLedgerService', () => {
  let service: PaymentLedgerService;
  let manager: { find: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let approved: Partial<Payment>[];
  let refunds: Partial<Refund>[];

  const request = (amount: string) => ({ orderId: 'order-1', amount, originCu: RefundOrigin.CU_14, reason: 'Cancelación' });

  beforeEach(async () => {
    approved = [{ id: 'payment-1', status: PaymentStatus.APROBADO, amount: '700.00' }];
    refunds = [];
    manager = {
      find: vi.fn((entity) => Promise.resolve(entity === Payment ? approved : refunds)),
      create: vi.fn((_entity, data) => data),
      save: vi.fn((data) => Promise.resolve({ id: 'refund-1', ...data })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentLedgerService,
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(Refund), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PaymentLedgerService);
  });

  describe('CU-21 Procesar reembolso', () => {
    it('3: registra el reembolso "en trámite" contra el pago acreditado, todavía sin pedirlo a la pasarela', async () => {
      const refund = await service.requestRefund(manager as never, request('700.00'));

      expect(refund).toEqual(
        expect.objectContaining({
          paymentId: 'payment-1',
          amount: '700.00',
          status: RefundStatus.EN_TRAMITE,
          externalRefundId: null,
          originCu: RefundOrigin.CU_14,
        }),
      );
    });

    it('2a: sin pago acreditado no genera reembolso', async () => {
      approved = [];

      await expect(service.requestRefund(manager as never, request('700.00'))).resolves.toBeNull();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('2b: rechaza un importe que supera el saldo reembolsable (acreditado menos lo ya reembolsado)', async () => {
      refunds = [{ paymentId: 'payment-1', amount: '500.00', status: RefundStatus.REEMBOLSADO }];

      await expect(service.requestRefund(manager as never, request('300.00'))).resolves.toBeNull();
      await expect(service.requestRefund(manager as never, request('200.00'))).resolves.not.toBeNull();
    });

    it('2b: rechaza un importe no positivo', async () => {
      await expect(service.requestRefund(manager as never, request('0.00'))).resolves.toBeNull();
    });
  });
});
