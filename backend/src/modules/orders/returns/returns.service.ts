import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { STORAGE_SERVICE, type StorageService } from '../../../providers/storage/storage.interface.js';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../../users/users.service.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { returnWindow } from '../order-policies.js';
import { CreateReturnRequestDto } from './dto/create-return-request.dto.js';
import { eligibleUnits } from './return-eligibility.js';
import { ReturnRequestItem } from './entities/return-request-item.entity.js';
import { ReturnRequestPhoto } from './entities/return-request-photo.entity.js';
import { ReturnRequest, ReturnRequestStatus } from './entities/return-request.entity.js';

/** CU-15 (paso 4): máximo de fotos de evidencia por solicitud. */
export const MAX_RETURN_PHOTOS = 3;

/** CU-15 (paso 7). El envío de la devolución lo paga siempre la tienda (consolidación de CU). */
export const RETURN_INSTRUCTIONS =
  'Embalá el o los productos con todos sus accesorios y, si podés, en su caja original. ' +
  'En las próximas 48 horas hábiles te enviamos por correo la etiqueta de envío para despacharlo desde cualquier sucursal del correo. ' +
  'El costo del envío lo cubre la tienda. Cuando recibamos el producto revisamos la solicitud y te avisamos el resultado.';

/**
 * CU-15 Solicitar cambio o devolución: sólo el alta por el Cliente. La
 * resolución es CU-22 (Fase 6).
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * CU-15 (pasos 2-9). Las fotos se suben antes de la transacción (no se
   * retiene un lock mientras se escribe a disco o a un servicio externo) y
   * se borran si la solicitud finalmente no se crea.
   *
   * @usecase CU-15 Solicitar cambio o devolución
   * @usecase-includes CU-20
   */
  async create(userId: string, orderId: string, dto: CreateReturnRequestDto, photos: Express.Multer.File[] = []) {
    // CU-15 (flujo 5a): el mismo ítem dos veces en la misma solicitud.
    const ids = dto.items.map((i) => i.orderItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Cada producto puede aparecer una sola vez en la solicitud');
    }
    if (photos.length > MAX_RETURN_PHOTOS) {
      throw new BadRequestException(`Podés adjuntar hasta ${MAX_RETURN_PHOTOS} fotos`);
    }

    // Validaciones previas sin lock: evitan subir fotos para una solicitud
    // que de entrada no procede. Se repiten dentro de la transacción.
    await this.validate(this.dataSource.manager, userId, orderId, dto, false);

    const uploaded: string[] = [];
    let result: { request: ReturnRequest; order: Order };
    try {
      for (const photo of photos) {
        uploaded.push((await this.storage.upload(photo, 'returns')).url);
      }

      result = await this.dataSource.transaction(async (manager) => {
        const { order } = await this.validate(manager, userId, orderId, dto, true);

        // CU-15 (paso 6).
        const request = await manager.save(
          manager.create(ReturnRequest, {
            orderId,
            status: ReturnRequestStatus.SOLICITADA,
            type: dto.type,
            reason: dto.reason,
            approvedAt: null,
            receivedAt: null,
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
            internalNote: null,
            refundId: null,
          }),
        );
        request.items = await manager.save(
          dto.items.map((item) =>
            manager.create(ReturnRequestItem, {
              returnRequestId: request.id,
              orderItemId: item.orderItemId,
              quantityRequested: item.quantity,
              quantityApproved: null,
              quantityReceived: null,
              condition: null,
              refundApproved: null,
            }),
          ),
        );
        request.photos = await manager.save(
          uploaded.map((url) => manager.create(ReturnRequestPhoto, { returnRequestId: request.id, url })),
        );
        return { request, order };
      });
    } catch (err) {
      await Promise.all(uploaded.map((url) => this.storage.remove(url)));
      throw err;
    }

    // Ya commiteada: de acá en adelante nada puede borrar las fotos ni
    // devolver error. CU-15 (paso 8, flujo 8a): el aviso nunca revierte la
    // solicitud; si falla, queda para reintentarlo.
    const { request, order } = result;
    await this.notify(userId, order, request).catch((err: unknown) => {
      this.logger.error(`Solicitud #${request.requestNumber}: no se pudo enviar el comprobante`, err as Error);
    });

    // CU-15 (pasos 7 y 9).
    return {
      id: request.id,
      requestNumber: request.requestNumber,
      status: request.status,
      type: request.type,
      instructions: RETURN_INSTRUCTIONS,
    };
  }

  /**
   * CU-15 (pasos 2 y 5, flujos 2a/2b/3a/5a). Con `lock` toma el pedido
   * con lock de fila: serializa dos solicitudes simultáneas del mismo
   * pedido, así la segunda ve los ítems de la primera como ya pedidos.
   */
  private async validate(
    manager: EntityManager,
    userId: string,
    orderId: string,
    dto: CreateReturnRequestDto,
    lock: boolean,
  ): Promise<{ order: Order }> {
    const order = await manager.findOne(Order, {
      where: { id: orderId, userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!order) throw new NotFoundException('El pedido no existe');

    // CU-15 (paso 2, flujos 2a/2b).
    const window = returnWindow(order, new Date());
    if (!window.allowed) throw new ConflictException({ code: window.code, message: window.message });

    const orderItems = await manager.find(OrderItem, { where: { orderId } });
    const previous = await manager.find(ReturnRequest, { where: { orderId }, relations: { items: true } });
    const eligible = new Map(orderItems.map((i) => [i.id, eligibleUnits(i.id, i.quantity, previous)]));

    // CU-15 (flujo 3a): ningún ítem tiene unidades para pedir.
    if ([...eligible.values()].every((units) => units === 0)) {
      throw new ConflictException({
        code: 'NO_ELIGIBLE_ITEMS',
        message: 'Todos los productos de este pedido ya tienen una solicitud de cambio o devolución',
      });
    }

    for (const requested of dto.items) {
      const item = orderItems.find((i) => i.id === requested.orderItemId);
      if (!item) throw new BadRequestException('Uno de los productos no pertenece a este pedido');
      // CU-15 (flujo 5a): cantidad mayor a la comprada.
      if (requested.quantity > item.quantity) {
        throw new BadRequestException(
          `Pediste ${requested.quantity} unidades de "${item.productNameSnapshot}", pero compraste ${item.quantity}`,
        );
      }
      // CU-15 (precondición 4, flujo 6a): unidades ya pedidas o aprobadas,
      // incluso por otra solicitud creada en paralelo (el lock del pedido
      // la serializa con ésta).
      const units = eligible.get(item.id)!;
      if (requested.quantity > units) {
        const open = previous
          .filter((r) => r.status !== ReturnRequestStatus.RECHAZADA && r.items.some((ri) => ri.orderItemId === item.id))
          .map((r) => r.requestNumber);
        throw new ConflictException({
          code: 'RETURN_ALREADY_REQUESTED',
          message: `De "${item.productNameSnapshot}" podés pedir ${units} unidad(es): el resto ya está en la solicitud #${open.join(', #')}`,
          requestNumbers: open,
          eligibleUnits: units,
        });
      }
    }
    return { order };
  }

  private async notify(userId: string, order: Order, request: ReturnRequest): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;
    await this.notificationsService.send({
      userId,
      recipientEmail: user.email,
      template: EmailTemplate.COMPROBANTE_POSVENTA,
      relatedOrderId: order.id,
      data: {
        orderNumber: order.orderNumber,
        requestNumber: request.requestNumber,
        type: request.type,
        instructions: RETURN_INSTRUCTIONS,
      },
    });
  }
}
