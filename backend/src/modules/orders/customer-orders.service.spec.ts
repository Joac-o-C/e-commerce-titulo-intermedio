import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentStatus } from '../payments/entities/payment.entity.js';
import { PaymentLedgerService } from '../payments/ledger/payment-ledger.service.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderStatusHistory } from './entities/order-status-history.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderStatus } from './order-status.js';
import { ReturnRequest } from './returns/entities/return-request.entity.js';

const HOUR = 60 * 60 * 1000;

describe('CustomerOrdersService', () => {
  let service: CustomerOrdersService;
  let orderRepo: { findOne: ReturnType<typeof vi.fn> };
  let returnRequestRepo: { find: ReturnType<typeof vi.fn> };
  let ledger: { findByOrder: ReturnType<typeof vi.fn> };

  const order = (overrides: Partial<Order> = {}) => ({
    id: 'order-1',
    orderNumber: 7,
    userId: 'user-1',
    status: OrderStatus.PAGADO,
    paidAt: new Date(Date.now() - HOUR),
    deliveredAt: null,
    reservationExpiresAt: new Date(Date.now() + HOUR),
    trackingCarrier: 'Andreani',
    trackingNumber: 'AR123',
    dispatchedAt: null,
    items: [{ id: 'item-1', productNameSnapshot: 'Remera', quantity: 2 }],
    ...overrides,
  });

  beforeEach(async () => {
    orderRepo = { findOne: vi.fn() };
    returnRequestRepo = { find: vi.fn().mockResolvedValue([]) };
    ledger = {
      findByOrder: vi.fn().mockResolvedValue({
        payments: [
          { status: PaymentStatus.RECHAZADO, method: 'visa', installments: 1 },
          { status: PaymentStatus.APROBADO, method: 'master', installments: 3 },
        ],
        refunds: [],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerOrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(OrderStatusHistory), useValue: { find: vi.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ReturnRequest), useValue: returnRequestRepo },
        { provide: PaymentLedgerService, useValue: ledger },
      ],
    }).compile();
    service = moduleRef.get(CustomerOrdersService);
  });

  describe('CU-13 Ver mis pedidos', () => {
    it('5: busca el pedido acotado al Cliente autenticado', async () => {
      orderRepo.findOne.mockResolvedValue(order());

      await service.getDetail('user-1', 'order-1');

      expect(orderRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order-1', userId: 'user-1' } }));
    });

    it('5a: un pedido inexistente o ajeno responde "no disponible"', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.getDetail('user-1', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('6: muestra el medio del pago acreditado', async () => {
      orderRepo.findOne.mockResolvedValue(order());

      const detail = await service.getDetail('user-1', 'order-1');

      expect(detail.payment).toEqual(expect.objectContaining({ status: 'aprobado', method: 'master', installments: 3 }));
    });

    it('6: el seguimiento sólo aparece desde "despachado"', async () => {
      orderRepo.findOne.mockResolvedValue(order());
      expect((await service.getDetail('user-1', 'order-1')).tracking).toBeNull();

      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.DESPACHADO }));
      expect((await service.getDetail('user-1', 'order-1')).tracking).toEqual(
        expect.objectContaining({ carrier: 'Andreani', number: 'AR123' }),
      );
    });

    it('7: un pedido pagado hace 1 h ofrece cancelar, no reintentar ni pedir posventa', async () => {
      orderRepo.findOne.mockResolvedValue(order());

      const { actions } = await service.getDetail('user-1', 'order-1');

      expect(actions.cancel.allowed).toBe(true);
      expect(actions.retryPayment.allowed).toBe(false);
      expect(actions.requestReturn.allowed).toBe(false);
    });

    it('7a: un pedido entregado cuyos ítems ya tienen solicitud no ofrece posventa', async () => {
      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.ENTREGADO, deliveredAt: new Date() }));
      returnRequestRepo.find.mockResolvedValue([
        { items: [{ orderItemId: 'item-1', quantityRequested: 1 }], photos: [], requestNumber: 3 },
      ]);

      const detail = await service.getDetail('user-1', 'order-1');

      expect(detail.actions.requestReturn).toEqual(expect.objectContaining({ allowed: false, code: 'NO_ELIGIBLE_ITEMS' }));
      expect(detail.items[0].hasReturnRequest).toBe(true);
    });

    it('6a: mientras espera el pago, marca el estado de pago como posiblemente desactualizado', async () => {
      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.PENDIENTE_PAGO, paidAt: null }));

      const detail = await service.getDetail('user-1', 'order-1');

      expect(detail.payment).toEqual(expect.objectContaining({ status: 'pendiente', mayBeOutdated: true }));
      expect(detail.actions.retryPayment.allowed).toBe(true);
    });
  });
});
