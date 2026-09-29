import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { EmailLog, EmailTemplate } from '../src/modules/notifications/entities/email-log.entity.js';
import { OrderStatus } from '../src/modules/orders/order-status.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { Refund, RefundOrigin, RefundStatus } from '../src/modules/payments/entities/refund.entity.js';
import { Product } from '../src/modules/products/entities/product.entity.js';
import { ProductVariant } from '../src/modules/products/entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from '../src/modules/products/entities/stock-movement.entity.js';

/**
 * Flujo de negocio punta a punta de la Fase 5, sobre pedidos ya creados
 * por el checkout: "Mis pedidos" (CU-13), reintento de pago (CU-13 7b),
 * cancelación con reingreso de stock y reembolso registrado (CU-14 →
 * CU-21) y solicitud de posventa con fotos (CU-15).
 *
 * Corre contra la base local con PAYMENT_GATEWAY=fake.
 */
describe('Mis pedidos, cancelación y posventa (e2e)', () => {
  let app: INestApplication<App>;
  let emailLogRepo: Repository<EmailLog>;
  let variantRepo: Repository<ProductVariant>;
  let productRepo: Repository<Product>;
  let refundRepo: Repository<Refund>;
  let movementRepo: Repository<StockMovement>;
  let ordersService: OrdersService;
  let dataSource: DataSource;

  const password = 'Password1';
  let token: string;
  let otherToken: string;
  let addressId: string;
  let shippingMethodId: string;
  let product: Product;
  let variant: ProductVariant;

  const server = () => app.getHttpServer();
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const stockOf = async () => {
    const v = await variantRepo.findOneByOrFail({ id: variant.id });
    return { total: v.stockTotal, reserved: v.stockReserved };
  };

  const registerAndLogin = async (email: string) => {
    await request(server())
      .post('/auth/register')
      .send({ firstName: 'Ana', lastName: 'Pedidos', email, password, passwordConfirmation: password, acceptTerms: true })
      .expect(201);
    const log = await emailLogRepo.findOneOrFail({
      where: { recipientEmail: email, template: EmailTemplate.VERIFICACION },
      order: { createdAt: 'DESC' },
    });
    await request(server())
      .post(`/auth/verify-email?token=${(log.payloadSnapshot as { token: string }).token}`)
      .expect(200);
    return (await request(server()).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  };

  const checkout = async (quantity: number) => {
    await request(server()).post('/cart/items').set(auth()).send({ variantId: variant.id, quantity }).expect(201);
    await request(server()).post('/checkout/revalidate').set(auth()).expect(201);
    const quote = await request(server()).post('/checkout/quote').set(auth()).send({ addressId, shippingMethodId }).expect(201);
    const res = await request(server())
      .post('/checkout')
      .set(auth())
      .send({ addressId, shippingMethodId, expectedTotal: quote.body.total })
      .expect(201);
    return { orderId: res.body.orderId as string, preferenceId: preferenceOf(res.body.redirectUrl) };
  };

  const preferenceOf = (redirectUrl: string) => new URL(redirectUrl).searchParams.get('preferenceId')!;

  const pay = (preferenceId: string, outcome: 'approved' | 'rejected' | 'pending') =>
    request(server()).post(`/payments/fake/preferences/${preferenceId}/pay`).send({ outcome });

  const detail = async (orderId: string) => (await request(server()).get(`/orders/${orderId}`).set(auth()).expect(200)).body;

  /** Lo que hace el Administrador en CU-19 (Fase 6), directo sobre el servicio. */
  const advanceTo = async (orderId: string, statuses: OrderStatus[]) => {
    for (const status of statuses) {
      await dataSource.transaction(async (manager) => {
        const order = (await ordersService.lockWithItems(manager, orderId))!;
        await ordersService.changeStatus(manager, order, status, { reason: 'e2e' });
      });
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    emailLogRepo = moduleFixture.get(getRepositoryToken(EmailLog));
    variantRepo = moduleFixture.get(getRepositoryToken(ProductVariant));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    refundRepo = moduleFixture.get(getRepositoryToken(Refund));
    movementRepo = moduleFixture.get(getRepositoryToken(StockMovement));
    ordersService = moduleFixture.get(OrdersService);
    dataSource = moduleFixture.get(getDataSourceToken());

    product = await productRepo.save(
      productRepo.create({ name: `Producto e2e pedidos ${Date.now()}`, description: 'e2e', price: '1000.00', isPublished: true }),
    );
    variant = await variantRepo.save(
      variantRepo.create({ productId: product.id, sku: `E2E-PED-${Date.now()}`, attributes: {}, stockTotal: 10 }),
    );

    token = await registerAndLogin(`e2e-pedidos-${Date.now()}@example.com`);
    otherToken = await registerAndLogin(`e2e-pedidos-otro-${Date.now()}@example.com`);

    addressId = (
      await request(server())
        .post('/users/me/addresses')
        .set(auth())
        .send({ alias: 'Casa', street: 'Calle', number: '1', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', phone: '351555' })
        .expect(201)
    ).body.id;
    shippingMethodId = (
      await request(server()).get(`/checkout/shipping-methods?addressId=${addressId}`).set(auth()).expect(200)
    ).body[0].id;
  });

  afterAll(async () => {
    await productRepo.update(product.id, { isPublished: false });
    await app.close();
  });

  it('CU-13: lista los pedidos propios con número y filtros, y nunca expone uno ajeno', async () => {
    const { orderId } = await checkout(1);

    const list = await request(server()).get('/orders').set(auth()).expect(200);
    const listed = list.body.items.find((o: { id: string }) => o.id === orderId);
    expect(listed).toEqual(
      expect.objectContaining({ itemCount: 1, status: OrderStatus.PENDIENTE_PAGO, paymentStatus: 'pendiente' }),
    );
    expect(listed.orderNumber).toEqual(expect.any(Number));

    // Flujo 3a: filtro por número y por estado.
    const byNumber = await request(server()).get(`/orders?number=${listed.orderNumber}`).set(auth()).expect(200);
    expect(byNumber.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
    const byStatus = await request(server()).get('/orders?status=entregado').set(auth()).expect(200);
    expect(byStatus.body.items.some((o: { id: string }) => o.id === orderId)).toBe(false);

    // Flujo 5a: otro cliente no ve el pedido, ni lo puede cancelar.
    await request(server()).get(`/orders/${orderId}`).set(auth(otherToken)).expect(404);
    await request(server())
      .post(`/orders/${orderId}/cancel`)
      .set(auth(otherToken))
      .send({ expectedStatus: OrderStatus.PENDIENTE_PAGO })
      .expect(404);
    const otherList = await request(server()).get('/orders').set(auth(otherToken)).expect(200);
    expect(otherList.body.total).toBe(0);

    // Se cancela para no dejar stock reservado para los tests siguientes.
    await request(server()).post(`/orders/${orderId}/cancel`).set(auth()).send({ expectedStatus: OrderStatus.PENDIENTE_PAGO }).expect(200);
  });

  it('CU-13 7b: tras un rechazo, reintentar re-reserva el stock y la preferencia vieja deja de aceptar pagos', async () => {
    const before = await stockOf();
    const { orderId, preferenceId } = await checkout(2);
    await pay(preferenceId, 'rejected').expect(201);
    expect((await detail(orderId)).status).toBe(OrderStatus.PAGO_RECHAZADO);
    expect(await stockOf()).toEqual(before);
    expect((await detail(orderId)).actions.retryPayment.allowed).toBe(true);

    const retry = await request(server()).post(`/orders/${orderId}/retry-payment`).set(auth()).expect(200);
    expect(await stockOf()).toEqual({ total: before.total, reserved: before.reserved + 2 });
    expect((await detail(orderId)).status).toBe(OrderStatus.PENDIENTE_PAGO);

    await pay(preferenceId, 'approved').expect(409);
    await pay(preferenceOf(retry.body.redirectUrl), 'approved').expect(201);
    const paid = await detail(orderId);
    expect(paid.status).toBe(OrderStatus.PAGADO);
    expect(paid.payment).toEqual(expect.objectContaining({ status: 'aprobado', method: 'fake_card' }));
    expect(await stockOf()).toEqual({ total: before.total - 2, reserved: before.reserved });

    // Un pedido pagado ya no admite reintento.
    await request(server()).post(`/orders/${orderId}/retry-payment`).set(auth()).expect(409);
  });

  it('CU-14: cancelar un pedido pagado reingresa el stock, registra el reembolso y avisa por correo', async () => {
    const before = await stockOf();
    const { orderId, preferenceId } = await checkout(3);
    await pay(preferenceId, 'approved').expect(201);
    expect(await stockOf()).toEqual({ total: before.total - 3, reserved: before.reserved });

    // Flujo 5a: el Cliente confirmó mirando un estado viejo.
    const stale = await request(server())
      .post(`/orders/${orderId}/cancel`)
      .set(auth())
      .send({ expectedStatus: OrderStatus.PENDIENTE_PAGO })
      .expect(409);
    expect(stale.body).toEqual(expect.objectContaining({ code: 'ORDER_STATUS_CHANGED', currentStatus: OrderStatus.PAGADO }));

    const res = await request(server())
      .post(`/orders/${orderId}/cancel`)
      .set(auth())
      .send({ expectedStatus: OrderStatus.PAGADO, reason: 'Me arrepentí' })
      .expect(200);
    expect(res.body.refundRequested).toBe(true);
    expect(res.body.order.status).toBe(OrderStatus.CANCELADO);
    expect(res.body.order.actions.cancel.allowed).toBe(false);
    expect(res.body.order.refunds).toEqual([expect.objectContaining({ amount: expect.any(String), status: RefundStatus.EN_TRAMITE })]);

    expect(await stockOf()).toEqual(before);
    const movement = await movementRepo.findOneByOrFail({ variantId: variant.id, type: StockMovementType.CANCELACION });
    expect(movement.quantity).toBe(3);
    const refund = await refundRepo.findOneByOrFail({ orderId });
    // CU-21 (pasos 4-6): el reembolso ya se pidió a la pasarela y espera su confirmación.
    expect(refund).toEqual(
      expect.objectContaining({ originCu: RefundOrigin.CU_14, status: RefundStatus.EN_TRAMITE, externalRefundId: expect.any(String) }),
    );
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.CANCELACION })).toBe(1);

    // Flujo 2a: ya cancelado, no se cancela de nuevo.
    await request(server()).post(`/orders/${orderId}/cancel`).set(auth()).send({ expectedStatus: OrderStatus.CANCELADO }).expect(409);
  });

  it('CU-14 7b: cancelar un pedido impago libera la reserva, no reembolsa y vence la preferencia', async () => {
    const before = await stockOf();
    const { orderId, preferenceId } = await checkout(1);
    expect((await stockOf()).reserved).toBe(before.reserved + 1);

    const res = await request(server())
      .post(`/orders/${orderId}/cancel`)
      .set(auth())
      .send({ expectedStatus: OrderStatus.PENDIENTE_PAGO })
      .expect(200);
    expect(res.body.refundRequested).toBe(false);
    expect(await stockOf()).toEqual(before);
    expect(await refundRepo.countBy({ orderId })).toBe(0);
    await pay(preferenceId, 'approved').expect(409);
  });

  it('CU-15: sobre un pedido entregado crea la solicitud con fotos y sólo admite otra por las unidades que quedan', async () => {
    const { orderId, preferenceId } = await checkout(2);
    await pay(preferenceId, 'approved').expect(201);

    // 2a: todavía no entregado.
    const early = await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'devolucion')
      .field('reason', 'No me gustó')
      .field('items', JSON.stringify([{ orderItemId: (await detail(orderId)).items[0].id, quantity: 1 }]))
      .expect(409);
    expect(early.body.code).toBe('ORDER_NOT_DELIVERED');

    await advanceTo(orderId, [OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO, OrderStatus.ENTREGADO]);
    const delivered = await detail(orderId);
    expect(delivered.actions.requestReturn.allowed).toBe(true);
    const itemId = delivered.items[0].id;

    // 5a: cantidad mayor a la comprada.
    await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'devolucion')
      .field('reason', 'No me gustó')
      .field('items', JSON.stringify([{ orderItemId: itemId, quantity: 3 }]))
      .expect(400);

    const created = await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'cambio')
      .field('reason', 'Me queda chico')
      .field('items', JSON.stringify([{ orderItemId: itemId, quantity: 1 }]))
      .attach('photos', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'evidencia.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({ status: 'solicitada', type: 'cambio', requestNumber: expect.any(Number) }),
    );
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.COMPROBANTE_POSVENTA })).toBe(1);

    // 6a: la unidad pedida sigue en una solicitud abierta; sólo queda 1 elegible.
    const tooMany = await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'devolucion')
      .field('reason', 'Otra vez')
      .field('items', JSON.stringify([{ orderItemId: itemId, quantity: 2 }]))
      .expect(409);
    expect(tooMany.body).toEqual(
      expect.objectContaining({ code: 'RETURN_ALREADY_REQUESTED', requestNumbers: [created.body.requestNumber], eligibleUnits: 1 }),
    );

    // La unidad que queda sí se puede pedir en otra solicitud.
    const second = await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'devolucion')
      .field('reason', 'La otra tampoco')
      .field('items', JSON.stringify([{ orderItemId: itemId, quantity: 1 }]))
      .expect(201);

    // 3a: ya no quedan unidades elegibles.
    const none = await request(server())
      .post(`/orders/${orderId}/returns`)
      .set(auth())
      .field('type', 'devolucion')
      .field('reason', 'Otra vez')
      .field('items', JSON.stringify([{ orderItemId: itemId, quantity: 1 }]))
      .expect(409);
    expect(none.body.code).toBe('NO_ELIGIBLE_ITEMS');

    const after = await detail(orderId);
    expect(after.returnRequests).toEqual([
      expect.objectContaining({ requestNumber: created.body.requestNumber, photos: [expect.stringContaining('/uploads/returns/')] }),
      expect.objectContaining({ requestNumber: second.body.requestNumber, photos: [] }),
    ]);
    expect(after.items[0].eligibleReturnQuantity).toBe(0);
    expect(after.actions.requestReturn).toEqual(expect.objectContaining({ allowed: false, code: 'NO_ELIGIBLE_ITEMS' }));
    // Entregado: ya no se puede cancelar (2a).
    expect(after.actions.cancel.allowed).toBe(false);
  });
});
