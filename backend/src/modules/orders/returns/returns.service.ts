import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { STORAGE_SERVICE, type StorageService } from '../../../providers/storage/storage.interface.js';
import { EmailTemplate } from '../../notifications/entities/email-log.entity.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../../users/users.service.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { returnWindow } from '../order-policies.js';
import { CreateReturnRequestDto } from './dto/create-return-request.dto.js';
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

/** CU-15 (flujo 6a): el ítem ya tiene una solicitud, se muestra la existente. */
class ReturnAlreadyRequestedException extends ConflictException {
  constructor(requestNumbers: number[]) {
    super({
      code: 'RETURN_ALREADY_REQUESTED',
      message: `Ya existe una solicitud para ese producto (solicitud #${requestNumbers.join(', #')})`,
      requestNumbers,
    });
  }
}

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
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
          }),
        );
        request.items = await manager.save(
          dto.items.map((item) =>
            manager.create(ReturnRequestItem, {
              returnRequestId: request.id,
              orderItemId: item.orderItemId,
              quantityRequested: item.quantity,
              quantityApproved: null,
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
      if (this.isUniqueViolation(err)) {
        // CU-15 (flujo 6a): otra solicitud sobre el mismo ítem se creó en
        // paralelo y ganó la UNIQUE de `return_request_items`.
        throw new ReturnAlreadyRequestedException(await this.existingRequestNumbers(ids));
      }
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
    const alreadyRequested = await manager.find(ReturnRequestItem, {
      where: { orderItemId: In(orderItems.map((i) => i.id)) },
      relations: { returnRequest: true },
    });

    // CU-15 (flujo 3a): ningún ítem elegible.
    if (alreadyRequested.length >= orderItems.length) {
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
      // CU-15 (precondición 4, flujo 6a).
      const previous = alreadyRequested.find((r) => r.orderItemId === item.id);
      if (previous) throw new ReturnAlreadyRequestedException([previous.returnRequest.requestNumber]);
    }
    return { order };
  }

  private async existingRequestNumbers(orderItemIds: string[]): Promise<number[]> {
    const rows = await this.dataSource.getRepository(ReturnRequestItem).find({
      where: { orderItemId: In(orderItemIds) },
      relations: { returnRequest: true },
    });
    return [...new Set(rows.map((r) => r.returnRequest.requestNumber))];
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

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err.driverError as { code?: string } | undefined)?.code === '23505';
  }
}
