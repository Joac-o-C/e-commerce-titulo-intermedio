import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { STORAGE_SERVICE } from '../../../providers/storage/storage.interface.js';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../../users/users.service.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { OrderStatus } from '../order-status.js';
import { ReturnRequestItem } from './entities/return-request-item.entity.js';
import { ReturnRequest, ReturnRequestStatus, ReturnRequestType } from './entities/return-request.entity.js';
import { ReturnsService } from './returns.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('ReturnsService', () => {
  let service: ReturnsService;
  let order: Partial<Order> | null;
  let orderItems: Partial<OrderItem>[];
  let previousRequests: Partial<ReturnRequestItem>[];
  let manager: Record<string, ReturnType<typeof vi.fn>>;
  let storage: { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };

  const photo = { originalname: 'foto.jpg' } as Express.Multer.File;
  const dto = (items = [{ orderItemId: 'item-1', quantity: 1 }]) => ({
    type: ReturnRequestType.DEVOLUCION,
    reason: 'Llegó con una mancha',
    items,
  });

  beforeEach(async () => {
    order = { id: 'order-1', orderNumber: 7, userId: 'user-1', status: OrderStatus.ENTREGADO, deliveredAt: new Date(Date.now() - 2 * DAY) };
    orderItems = [
      { id: 'item-1', quantity: 2, productNameSnapshot: 'Remera' },
      { id: 'item-2', quantity: 1, productNameSnapshot: 'Buzo' },
    ];
    previousRequests = [];
    manager = {
      findOne: vi.fn(() => Promise.resolve(order)),
      find: vi.fn((entity) => Promise.resolve(entity === OrderItem ? orderItems : previousRequests)),
      create: vi.fn((_entity, data) => data),
      save: vi.fn((data) =>
        Promise.resolve(Array.isArray(data) ? data : { id: 'request-1', requestNumber: 12, ...data }),
      ),
    };
    storage = {
      upload: vi.fn().mockResolvedValue({ url: 'http://x/uploads/returns/foto.jpg' }),
      remove: vi.fn(),
    };
    notifications = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReturnsService,
        {
          provide: getDataSourceToken(),
          useValue: {
            manager,
            transaction: (cb: (m: unknown) => unknown) => cb(manager),
            getRepository: () => ({ find: vi.fn().mockResolvedValue([{ returnRequest: { requestNumber: 11 } }]) }),
          },
        },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: NotificationsService, useValue: notifications },
        { provide: UsersService, useValue: { findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'c@example.com' }) } },
      ],
    }).compile();

    service = moduleRef.get(ReturnsService);
  });

  describe('CU-15 Solicitar cambio o devolución', () => {
    it('crea la solicitud "solicitada" con ítems y fotos, devuelve número e instrucciones y envía el comprobante', async () => {
      const result = await service.create('user-1', 'order-1', dto(), [photo]);

      expect(result).toEqual(
        expect.objectContaining({
          requestNumber: 12,
          status: ReturnRequestStatus.SOLICITADA,
          instructions: expect.stringContaining('lo cubre la tienda'),
        }),
      );
      expect(manager.create).toHaveBeenCalledWith(ReturnRequest, expect.objectContaining({ type: ReturnRequestType.DEVOLUCION }));
      expect(manager.create).toHaveBeenCalledWith(
        ReturnRequestItem,
        expect.objectContaining({ orderItemId: 'item-1', quantityRequested: 1 }),
      );
      expect(storage.upload).toHaveBeenCalledWith(photo, 'returns');
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: EmailTemplate.COMPROBANTE_POSVENTA }),
      );
    });

    it('2a: un pedido que no está entregado no admite la solicitud', async () => {
      order = { ...order, status: OrderStatus.DESPACHADO, deliveredAt: null };

      const error = await service.create('user-1', 'order-1', dto()).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ORDER_NOT_DELIVERED' }));
    });

    it('2b: vencida la ventana de 10 días, no se crea la solicitud', async () => {
      order = { ...order, deliveredAt: new Date(Date.now() - 11 * DAY) };

      const error = await service.create('user-1', 'order-1', dto()).catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'RETURN_WINDOW_EXPIRED' }));
    });

    it('pedido ajeno o inexistente → 404', async () => {
      order = null;

      await expect(service.create('user-1', 'order-1', dto())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('3a: si todos los ítems ya tienen solicitud, lo informa', async () => {
      previousRequests = [
        { orderItemId: 'item-1', returnRequest: { requestNumber: 3 } as ReturnRequest },
        { orderItemId: 'item-2', returnRequest: { requestNumber: 3 } as ReturnRequest },
      ];

      const error = await service.create('user-1', 'order-1', dto()).catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'NO_ELIGIBLE_ITEMS' }));
    });

    it('5a: rechaza una cantidad mayor a la comprada', async () => {
      await expect(service.create('user-1', 'order-1', dto([{ orderItemId: 'item-1', quantity: 3 }]))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('5a: rechaza un ítem repetido o que no es del pedido', async () => {
      await expect(
        service.create('user-1', 'order-1', dto([{ orderItemId: 'item-1', quantity: 1 }, { orderItemId: 'item-1', quantity: 1 }])),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('user-1', 'order-1', dto([{ orderItemId: 'ajeno', quantity: 1 }]))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('6a: un ítem con una solicitud previa muestra la existente y no duplica', async () => {
      previousRequests = [{ orderItemId: 'item-1', returnRequest: { requestNumber: 3 } as ReturnRequest }];

      const error = await service.create('user-1', 'order-1', dto()).catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'RETURN_ALREADY_REQUESTED', requestNumbers: [3] }));
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('6a: si otra solicitud en paralelo gana la UNIQUE, borra las fotos subidas y muestra la existente', async () => {
      manager.save.mockImplementationOnce(() => {
        throw new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' }));
      });

      const error = await service.create('user-1', 'order-1', dto(), [photo]).catch((e) => e);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'RETURN_ALREADY_REQUESTED', requestNumbers: [11] }));
      expect(storage.remove).toHaveBeenCalledWith('http://x/uploads/returns/foto.jpg');
      expect(notifications.send).not.toHaveBeenCalled();
    });
  
    it('8a: si falla el aviso después del commit, la solicitud queda creada y conserva sus fotos', async () => {
      notifications.send.mockRejectedValue(new Error('EmailLog caído'));

      const result = await service.create('user-1', 'order-1', dto(), [photo]);

      expect(result.requestNumber).toBe(12);
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });
});
