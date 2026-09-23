import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { fromCents, toCents } from '../../common/money.js';
import { CartService } from '../cart/cart.service.js';
import { PAYMENT_GATEWAY } from '../payments/gateway/payment-gateway.interface.js';
import type { PaymentGateway } from '../payments/gateway/payment-gateway.interface.js';
import { StockReservationService } from '../products/stock/stock-reservation.service.js';
import { AddressesService } from '../users/addresses.service.js';
import type { Address } from '../users/entities/address.entity.js';
import { UsersService } from '../users/users.service.js';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, type ShippingAddressSnapshot } from './entities/order.entity.js';
import { ShippingMethod } from './entities/shipping-method.entity.js';
import { OrderCancellationCause, OrderStatus } from './order-status.js';
import { OrdersService } from './orders.service.js';

/** CU-03 (flujo 13a): motivo por el que la revalidación final no deja crear el pedido. */
export type CheckoutProblem =
  | { type: 'unavailable'; productName: string }
  | { type: 'price_changed'; productName: string; from: string; to: string }
  | { type: 'insufficient_stock'; productName: string }
  | { type: 'total_changed'; expected: string; actual: string };

/** CU-03 (flujo 13a): 409 con el detalle, para que el frontend vuelva al resumen o al carrito. */
export class CheckoutStaleException extends HttpException {
  constructor(public readonly problems: CheckoutProblem[]) {
    super(
      { code: 'CHECKOUT_STALE', message: 'El carrito cambió desde que lo revisaste: revisalo y confirmá de nuevo', problems },
      HttpStatus.CONFLICT,
    );
  }
}

/** CU-03 (flujo 2a). */
export class EmptyCartException extends BadRequestException {
  constructor() {
    super({ code: 'EMPTY_CART', message: 'Tu carrito está vacío' });
  }
}

/** CU-03 (flujo 17a). */
export class PaymentGatewayFailedException extends HttpException {
  constructor() {
    super(
      {
        code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        message: 'No pudimos iniciar el pago con MercadoPago. Tu pedido se canceló y el carrito sigue disponible: intentá de nuevo en unos minutos.',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

const REQUIRED_ADDRESS_FIELDS = ['street', 'number', 'city', 'province', 'postalCode', 'phone'] as const;

/**
 * CU-03 Realizar checkout: revalidación del carrito, dirección y envío,
 * resumen, y confirmación (crear pedido + reservar stock + asociar carrito
 * + preferencia de pago). La confirmación del pago en sí es CU-05.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly reservationTtlHours: number;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ShippingMethod)
    private readonly shippingMethodRepo: Repository<ShippingMethod>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly cartService: CartService,
    private readonly addressesService: AddressesService,
    private readonly usersService: UsersService,
    private readonly stockReservation: StockReservationService,
    private readonly ordersService: OrdersService,
    config: ConfigService,
  ) {
    this.reservationTtlHours = config.get<number>('ORDER_RESERVATION_TTL_HOURS')!;
  }

  /**
   * CU-03 (pasos 2-3): revalida el carrito contra el catálogo y lo ajusta
   * (flujos 3a/3b). Un carrito vacío (2a) no es un error acá: el frontend
   * lo informa y lleva al catálogo.
   *
   * @usecase CU-03 Realizar checkout
   */
  revalidate(userId: string) {
    return this.cartService.revalidateForCheckout(userId);
  }

  /**
   * CU-03 (pasos 6-7): valida la dirección y devuelve los métodos de envío
   * disponibles para ella, con su costo.
   *
   * @usecase CU-03 Realizar checkout
   */
  async listShippingMethods(userId: string, addressId: string): Promise<ShippingMethod[]> {
    await this.requireValidAddress(userId, addressId);
    const methods = await this.shippingMethodRepo.find({ where: { isActive: true }, order: { cost: 'ASC' } });
    if (methods.length === 0) {
      // CU-03 (flujo 7a): no hay métodos de envío para la dirección.
      throw new UnprocessableEntityException({
        code: 'NO_SHIPPING_METHODS',
        message: 'No hay métodos de envío disponibles para esa dirección: elegí otra',
      });
    }
    return methods;
  }

  /**
   * CU-03 (pasos 9-10): resumen del pedido — ítems, subtotal, envío y
   * total — con los precios del carrito ya revalidado.
   *
   * @usecase CU-03 Realizar checkout
   */
  async quote(userId: string, addressId: string, shippingMethodId: string) {
    await this.requireValidAddress(userId, addressId);
    const method = await this.requireShippingMethod(shippingMethodId);
    const cart = await this.cartService.getCart(userId);
    if (cart.items.length === 0) throw new EmptyCartException();

    const subtotalCents = cart.items.reduce((sum, item) => sum + toCents(item.subtotal), 0);
    const shippingCents = toCents(method.cost);
    return {
      items: cart.items,
      shippingMethod: { id: method.id, name: method.name, cost: method.cost },
      subtotal: fromCents(subtotalCents),
      shippingCost: fromCents(shippingCents),
      total: fromCents(subtotalCents + shippingCents),
    };
  }

  /**
   * CU-03 (pasos 12-18): revalidación final, alta del pedido con snapshot,
   * reserva de stock y asociación del carrito — todo en una transacción —
   * y después la preferencia de pago. Devuelve la URL de la pasarela.
   *
   * @usecase CU-03 Realizar checkout
   */
  async confirm(userId: string, dto: ConfirmCheckoutDto): Promise<{ orderId: string; redirectUrl: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('El usuario no existe');
    const address = await this.requireValidAddress(userId, dto.addressId);
    const method = await this.requireShippingMethod(dto.shippingMethodId);

    const order = await this.dataSource.transaction(async (manager) => {
      const locked = await this.cartService.lockActiveCartForCheckout(manager, userId);
      // CU-03 (flujo 2a): también cubre el doble "confirmar": la segunda
      // request espera el lock del carrito y lo encuentra ya asociado.
      if (!locked || locked.items.length === 0) throw new EmptyCartException();
      const { cart, items } = locked;

      // CU-03 (paso 13): revalidación final contra el catálogo.
      const problems: CheckoutProblem[] = [];
      for (const item of items) {
        if (!item.product.isActive || !item.product.isPublished) {
          problems.push({ type: 'unavailable', productName: item.product.name });
        } else if (item.product.price !== item.unitPriceSnapshot) {
          problems.push({
            type: 'price_changed',
            productName: item.product.name,
            from: item.unitPriceSnapshot,
            to: item.product.price,
          });
        }
      }
      // CU-03 (flujo 13a).
      if (problems.length > 0) throw new CheckoutStaleException(problems);

      // El servidor nunca confía en importes del cliente: recalcula todo
      // con los precios del catálogo y sólo compara contra lo que vio.
      const subtotalCents = items.reduce((sum, item) => sum + toCents(item.product.price) * item.quantity, 0);
      const shippingCents = toCents(method.cost);
      const totalCents = subtotalCents + shippingCents;
      if (toCents(dto.expectedTotal) !== totalCents) {
        // CU-03 (flujo 13a): p. ej. cambió el costo del envío.
        throw new CheckoutStaleException([
          { type: 'total_changed', expected: dto.expectedTotal, actual: fromCents(totalCents) },
        ]);
      }

      // CU-03 (paso 14): pedido "pendiente de pago" con snapshot completo.
      const created = await manager.save(
        manager.create(Order, {
          userId,
          cartId: cart.id,
          status: OrderStatus.PENDIENTE_PAGO,
          subtotal: fromCents(subtotalCents),
          shippingCost: fromCents(shippingCents),
          total: fromCents(totalCents),
          shippingMethodSnapshot: { id: method.id, name: method.name, cost: method.cost },
          shippingAddressSnapshot: this.snapshotAddress(address),
          stockReservationActive: true,
          reservationExpiresAt: new Date(Date.now() + this.reservationTtlHours * 60 * 60 * 1000),
          cancellationCause: null,
          paymentPreferenceId: null,
          internalNotes: null,
          trackingCarrier: null,
          trackingNumber: null,
          dispatchedAt: null,
        }),
      );
      created.items = await manager.save(
        items.map((item) =>
          manager.create(OrderItem, {
            orderId: created.id,
            productId: item.productId,
            variantId: item.variantId,
            productNameSnapshot: item.product.name,
            variantAttributesSnapshot: item.variant.attributes,
            quantity: item.quantity,
            unitPriceSnapshot: item.product.price,
            subtotal: fromCents(toCents(item.product.price) * item.quantity),
          }),
        ),
      );
      await this.ordersService.recordHistory(manager, created.id, null, OrderStatus.PENDIENTE_PAGO, {
        actorId: userId,
        reason: 'Checkout confirmado',
      });

      // CU-03 (paso 15): reserva de stock. Si otro pedido se llevó las
      // unidades desde la revalidación, se hace rollback de todo (13a).
      const reservation = await this.stockReservation.reserve(
        manager,
        items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      );
      if (!reservation.ok) {
        const item = items.find((i) => i.variantId === reservation.variantId);
        throw new CheckoutStaleException([{ type: 'insufficient_stock', productName: item?.product.name ?? '' }]);
      }

      // CU-03 (paso 16): carrito asociado al pedido, ya no editable.
      await this.cartService.markAssociatedToOrder(manager, cart.id);
      return created;
    });

    // CU-03 (paso 17): preferencia de pago. Fuera de la transacción: no se
    // retiene un lock de fila mientras se espera una llamada HTTP externa.
    try {
      const preference = await this.gateway.createPreference({
        orderId: order.id,
        payerEmail: user.email,
        expiresAt: order.reservationExpiresAt,
        items: [
          ...order.items.map((item) => ({
            id: item.variantId,
            title: this.itemTitle(item),
            quantity: item.quantity,
            unitPrice: Number(item.unitPriceSnapshot),
          })),
          ...(toCents(order.shippingCost) > 0
            ? [{ id: `envio-${method.id}`, title: `Envío: ${method.name}`, quantity: 1, unitPrice: Number(order.shippingCost) }]
            : []),
        ],
      });
      await this.orderRepo.update(order.id, { paymentPreferenceId: preference.preferenceId });
      // CU-03 (paso 18): redirección a la pasarela.
      return { orderId: order.id, redirectUrl: preference.redirectUrl };
    } catch (err) {
      // CU-03 (flujo 17a): la pasarela no responde o rechaza la preferencia.
      this.logger.error(`No se pudo crear la preferencia de pago del pedido ${order.id}`, err as Error);
      await this.compensateFailedPreference(order.id, order.cartId!, userId);
      throw new PaymentGatewayFailedException();
    }
  }

  /**
   * CU-03 (flujo 17a): cancela el pedido recién creado, libera el stock y
   * devuelve el carrito a "activo" para que el Cliente pueda reintentar.
   */
  private async compensateFailedPreference(orderId: string, cartId: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.ordersService.lockWithItems(manager, orderId);
      if (!order || order.status !== OrderStatus.PENDIENTE_PAGO) return;
      await this.ordersService.releaseReservation(manager, order);
      await this.ordersService.changeStatus(manager, order, OrderStatus.CANCELADO, {
        reason: 'La pasarela de pago no pudo crear la preferencia',
        cancellationCause: OrderCancellationCause.PASARELA,
      });
      const restored = await this.cartService.restoreAfterFailedCheckout(manager, cartId, userId);
      if (!restored) {
        this.logger.warn(`Pedido ${orderId}: el cliente ya tenía un carrito nuevo con ítems; no se restauró el anterior`);
      }
    });
  }

  /** CU-03 (paso 6, flujo 6a): la dirección tiene que ser del Cliente, estar vigente y completa. */
  private async requireValidAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.addressesService.findOwnedActive(userId, addressId);
    if (!address) throw new NotFoundException('La dirección no existe');
    const missing = REQUIRED_ADDRESS_FIELDS.filter((field) => !address[field]?.trim());
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ADDRESS',
        message: 'La dirección está incompleta: completala antes de continuar',
        missingFields: missing,
      });
    }
    return address;
  }

  private async requireShippingMethod(shippingMethodId: string): Promise<ShippingMethod> {
    const method = await this.shippingMethodRepo.findOne({ where: { id: shippingMethodId, isActive: true } });
    if (!method) throw new NotFoundException('El método de envío no existe o ya no está disponible');
    return method;
  }

  private snapshotAddress(address: Address): ShippingAddressSnapshot {
    return {
      alias: address.alias,
      street: address.street,
      number: address.number,
      floorApt: address.floorApt ?? null,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      phone: address.phone,
      notes: address.notes ?? null,
    };
  }

  private itemTitle(item: OrderItem): string {
    const attributes = Object.values(item.variantAttributesSnapshot ?? {});
    return attributes.length > 0 ? `${item.productNameSnapshot} (${attributes.join(' / ')})` : item.productNameSnapshot;
  }
}
