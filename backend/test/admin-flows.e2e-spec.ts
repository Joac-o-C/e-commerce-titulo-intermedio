import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { EmailLog, EmailTemplate } from '../src/modules/notifications/entities/email-log.entity.js';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider.interface.js';
import { CapturedMail } from './support/captured-mail.js';
import { OrderStatus } from '../src/modules/orders/order-status.js';
import { Refund, RefundOrigin, RefundStatus } from '../src/modules/payments/entities/refund.entity.js';
import { Product } from '../src/modules/products/entities/product.entity.js';
import { ProductVariant } from '../src/modules/products/entities/product-variant.entity.js';
import { StockMovement, StockMovementType } from '../src/modules/products/entities/stock-movement.entity.js';
import { User, UserRole } from '../src/modules/users/entities/user.entity.js';

/**
 * Flujos de negocio punta a punta de la Fase 6, todos por HTTP como los
 * haría el Administrador desde el panel: gestión del pedido (CU-19),
 * cancelación con reembolso y su resultado en la pasarela (CU-19 5a →
 * CU-21) y resolución de posventa, devolución y cambio (CU-22).
 *
 * Corre contra la base local con PAYMENT_GATEWAY=fake.
 */
describe('Administración de pedidos, reembolsos y posventa (e2e)', () => {
  let app: INestApplication<App>;
  let emailLogRepo: Repository<EmailLog>;
  const mail = new CapturedMail();
  let variantRepo: Repository<ProductVariant>;
  let productRepo: Repository<Product>;
  let refundRepo: Repository<Refund>;
  let movementRepo: Repository<StockMovement>;
  let userRepo: Repository<User>;

  const password = 'Password1';
  let customerToken: string;
  let adminToken: string;
  let addressId: string;
  let shippingMethodId: string;
  let product: Product;
  let variantM: ProductVariant;
  let variantL: ProductVariant;

  const server = () => app.getHttpServer();
  const customer = () => ({ Authorization: `Bearer ${customerToken}` });
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const stockTotal = async (variant: ProductVariant) => (await variantRepo.findOneByOrFail({ id: variant.id })).stockTotal;

  const register = async (email: string) => {
    await request(server())
      .post('/auth/register')
      .send({ firstName: 'Ana', lastName: 'Admin e2e', email, password, passwordConfirmation: password, acceptTerms: true })
      .expect(201);
    const token = await mail.tokenFor(email, '/verify-email');
    await request(server())
      .post(`/auth/verify-email?token=${token}`)
      .expect(200);
  };
  const login = async (email: string) =>
    (await request(server()).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;

  /** Compra pagada del Cliente: devuelve el id del pedido. */
  const paidOrder = async (variant: ProductVariant, quantity: number) => {
    await request(server()).post('/cart/items').set(customer()).send({ variantId: variant.id, quantity }).expect(201);
    await request(server()).post('/checkout/revalidate').set(customer()).expect(201);
    const quote = await request(server()).post('/checkout/quote').set(customer()).send({ addressId, shippingMethodId }).expect(201);
    const res = await request(server())
      .post('/checkout')
      .set(customer())
      .send({ addressId, shippingMethodId, expectedTotal: quote.body.total })
      .expect(201);
    const preferenceId = new URL(res.body.redirectUrl).searchParams.get('preferenceId')!;
    await request(server()).post(`/payments/fake/preferences/${preferenceId}/pay`).send({ outcome: 'approved' }).expect(201);
    return res.body.orderId as string;
  };

  const adminDetail = async (orderId: string) =>
    (await request(server()).get(`/admin/orders/${orderId}`).set(admin()).expect(200)).body;

  const changeStatus = (orderId: string, expectedStatus: OrderStatus, to: OrderStatus, extra: Record<string, unknown> = {}) =>
    request(server()).post(`/admin/orders/${orderId}/status`).set(admin()).send({ expectedStatus, to, ...extra });

  const deliveredOrder = async (variant: ProductVariant, quantity: number) => {
    const orderId = await paidOrder(variant, quantity);
    await changeStatus(orderId, OrderStatus.PAGADO, OrderStatus.EN_PREPARACION).expect(200);
    await changeStatus(orderId, OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO).expect(200);
    await changeStatus(orderId, OrderStatus.DESPACHADO, OrderStatus.ENTREGADO).expect(200);
    return orderId;
  };

  /** CU-15, del lado del Cliente. */
  const requestReturn = async (orderId: string, type: 'devolucion' | 'cambio', items: { orderItemId: string; quantity: number }[]) =>
    (
      await request(server())
        .post(`/orders/${orderId}/returns`)
        .set(customer())
        .field('type', type)
        .field('reason', 'e2e')
        .field('items', JSON.stringify(items))
        .attach('photos', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'evidencia.jpg', contentType: 'image/jpeg' })
        .expect(201)
    ).body.id as string;

  const settleRefund = (refund: Refund, outcome: 'approved' | 'rejected') =>
    request(server()).post(`/payments/fake/refunds/${refund.externalRefundId}/settle`).send({ outcome }).expect(201);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail)
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    emailLogRepo = moduleFixture.get(getRepositoryToken(EmailLog));
    variantRepo = moduleFixture.get(getRepositoryToken(ProductVariant));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    refundRepo = moduleFixture.get(getRepositoryToken(Refund));
    movementRepo = moduleFixture.get(getRepositoryToken(StockMovement));
    userRepo = moduleFixture.get(getRepositoryToken(User));

    const stamp = Date.now();
    product = await productRepo.save(
      productRepo.create({ name: `Producto e2e admin ${stamp}`, description: 'e2e', price: '1000.00', isPublished: true }),
    );
    [variantM, variantL] = await variantRepo.save([
      variantRepo.create({ productId: product.id, sku: `E2E-ADM-M-${stamp}`, attributes: { talle: 'M' }, stockTotal: 20 }),
      variantRepo.create({ productId: product.id, sku: `E2E-ADM-L-${stamp}`, attributes: { talle: 'L' }, stockTotal: 20 }),
    ]);

    const customerEmail = `e2e-admin-cliente-${stamp}@example.com`;
    const adminEmail = `e2e-admin-${stamp}@example.com`;
    await register(customerEmail);
    await register(adminEmail);
    await userRepo.update({ email: adminEmail }, { role: UserRole.ADMINISTRADOR });
    customerToken = await login(customerEmail);
    adminToken = await login(adminEmail);

    addressId = (
      await request(server())
        .post('/users/me/addresses')
        .set(customer())
        .send({ alias: 'Casa', street: 'Calle', number: '1', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', phone: '351555' })
        .expect(201)
    ).body.id;
    shippingMethodId = (
      await request(server()).get(`/checkout/shipping-methods?addressId=${addressId}`).set(customer()).expect(200)
    ).body[0].id;
  });

  afterAll(async () => {
    await productRepo.update(product.id, { isPublished: false });
    await app.close();
  });

  it('CU-19: sólo el Administrador entra al panel de pedidos', async () => {
    await request(server()).get('/admin/orders').set(customer()).expect(403);
    await request(server()).get('/admin/orders').expect(401);
  });

  it('CU-19: lleva un pedido pagado hasta "entregado", con seguimiento, historial, avisos y exportación', async () => {
    const orderId = await paidOrder(variantM, 1);
    const orderNumber = (await adminDetail(orderId)).orderNumber;

    // 7a: transición no permitida.
    const invalid = await changeStatus(orderId, OrderStatus.PAGADO, OrderStatus.DESPACHADO).expect(409);
    expect(invalid.body).toEqual(expect.objectContaining({ code: 'INVALID_TRANSITION', validTransitions: [OrderStatus.EN_PREPARACION] }));

    await changeStatus(orderId, OrderStatus.PAGADO, OrderStatus.EN_PREPARACION, { note: 'Armado' }).expect(200);

    // 8a: el Administrador tenía una versión vieja del pedido.
    const stale = await changeStatus(orderId, OrderStatus.PAGADO, OrderStatus.EN_PREPARACION).expect(409);
    expect(stale.body).toEqual(expect.objectContaining({ code: 'ORDER_STATUS_CHANGED', currentStatus: OrderStatus.EN_PREPARACION }));

    // 6: despacho con seguimiento.
    await changeStatus(orderId, OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO, {
      tracking: { carrier: 'Andreani', number: 'AB123' },
    }).expect(200);
    // 7b: corrección posterior del seguimiento.
    await request(server())
      .patch(`/admin/orders/${orderId}/tracking`)
      .set(admin())
      .send({ carrier: 'Andreani', number: 'AB124', dispatchedAt: '2026-09-02' })
      .expect(200);
    await changeStatus(orderId, OrderStatus.DESPACHADO, OrderStatus.ENTREGADO).expect(200);

    // 5c: nota interna.
    await request(server()).post(`/admin/orders/${orderId}/notes`).set(admin()).send({ text: 'Recibió el portero' }).expect(200);

    const detail = await adminDetail(orderId);
    expect(detail.status).toBe(OrderStatus.ENTREGADO);
    expect(detail.tracking).toEqual(expect.objectContaining({ carrier: 'Andreani', number: 'AB124' }));
    expect(detail.statusHistory.map((h: { to: string }) => h.to)).toEqual(
      expect.arrayContaining([OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO, OrderStatus.ENTREGADO]),
    );
    expect(detail.statusHistory.find((h: { to: string }) => h.to === OrderStatus.EN_PREPARACION)).toEqual(
      expect.objectContaining({ reason: 'Armado', actor: expect.objectContaining({ name: 'Ana Admin e2e' }) }),
    );
    expect(detail.notes).toEqual([expect.objectContaining({ text: 'Recibió el portero' })]);
    expect(detail.actions).toEqual({ transitions: [], canCancel: false, canEditTracking: true });
    // Las notas internas no llegan al Cliente.
    const customerView = (await request(server()).get(`/orders/${orderId}`).set(customer()).expect(200)).body;
    expect(JSON.stringify(customerView)).not.toContain('Recibió el portero');

    // 9: un aviso por cada cambio de estado.
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.CAMBIO_ESTADO_PEDIDO })).toBe(3);

    // 2 / 2a: búsqueda por número y CSV del listado filtrado.
    const list = await request(server()).get(`/admin/orders?number=${orderNumber}`).set(admin()).expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id: orderId, status: OrderStatus.ENTREGADO, itemCount: 1 })]);
    const csv = await request(server()).get(`/admin/orders/export.csv?number=${orderNumber}`).set(admin()).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')).toHaveLength(2);
    expect(csv.text).toContain(`${orderNumber};`);
    expect(csv.text).toContain(';Entregado;Aprobado;1;');
  });

  it('CU-19 5a → CU-21: cancelar un pedido pagado reembolsa el total y la pasarela lo acredita', async () => {
    const orderId = await paidOrder(variantM, 2);
    const before = await stockTotal(variantM);

    const res = await request(server())
      .post(`/admin/orders/${orderId}/cancel`)
      .set(admin())
      .send({ expectedStatus: OrderStatus.PAGADO, reason: 'sospecha_fraude', detail: 'Tarjeta denunciada' })
      .expect(200);
    expect(res.body.refundRequested).toBe(true);

    // La respuesta trae el detalle actualizado, para refrescar la pantalla (paso 10).
    const detail = res.body.order;
    expect(detail).toEqual(expect.objectContaining({ status: OrderStatus.CANCELADO, cancellationCause: 'administrador' }));
    // Antes del despacho el stock vuelve, como en CU-14.
    expect(await stockTotal(variantM)).toBe(before + 2);

    const refund = await refundRepo.findOneByOrFail({ orderId });
    expect(refund).toEqual(
      expect.objectContaining({
        amount: detail.total,
        originCu: RefundOrigin.CU_19,
        status: RefundStatus.EN_TRAMITE,
        externalRefundId: expect.any(String),
      }),
    );

    // CU-21 (pasos 7-11): la pasarela confirma por webhook.
    await settleRefund(refund, 'approved');
    expect(await refundRepo.findOneByOrFail({ id: refund.id })).toEqual(
      expect.objectContaining({ status: RefundStatus.REEMBOLSADO, resolvedAt: expect.any(Date) }),
    );
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.RESULTADO_REEMBOLSO })).toBe(1);
  });

  it('CU-19 5a → CU-21 5a/9a: un pedido despachado se reembolsa sin envío; si la pasarela lo rechaza, el Administrador lo resuelve por fuera', async () => {
    const orderId = await paidOrder(variantM, 1);
    await changeStatus(orderId, OrderStatus.PAGADO, OrderStatus.EN_PREPARACION).expect(200);
    await changeStatus(orderId, OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO).expect(200);
    const before = await stockTotal(variantM);

    await request(server())
      .post(`/admin/orders/${orderId}/cancel`)
      .set(admin())
      .send({ expectedStatus: OrderStatus.DESPACHADO, reason: 'otro' })
      .expect(200);

    // Ya salió del depósito: el stock vuelve por CU-18, no solo.
    expect(await stockTotal(variantM)).toBe(before);
    const detail = await adminDetail(orderId);
    const refund = await refundRepo.findOneByOrFail({ orderId });
    expect(refund.amount).toBe(detail.subtotal);

    await settleRefund(refund, 'rejected');
    expect((await refundRepo.findOneByOrFail({ id: refund.id })).status).toBe(RefundStatus.RECHAZADO);

    // La alerta del panel y el filtro "reembolsos que requieren gestión".
    const summary = await request(server()).get('/admin/summary').set(admin()).expect(200);
    expect(summary.body.refundsNeedingAttention).toBeGreaterThanOrEqual(1);
    const flagged = await request(server())
      .get(`/admin/orders?refunds=requieren_gestion&number=${detail.orderNumber}`)
      .set(admin())
      .expect(200);
    expect(flagged.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);

    await request(server()).post(`/admin/refunds/${refund.id}/resolve`).set(admin()).send({ note: 'Transferencia bancaria' }).expect(204);
    expect(await refundRepo.findOneByOrFail({ id: refund.id })).toEqual(
      expect.objectContaining({ status: RefundStatus.REEMBOLSADO, resolutionNote: 'Transferencia bancaria' }),
    );
    // Ya no requiere gestión: no se puede resolver dos veces.
    await request(server()).post(`/admin/refunds/${refund.id}/resolve`).set(admin()).send({ note: 'otra vez' }).expect(409);
  });

  it('CU-22: una devolución total aprobada y recibida reingresa el stock, reembolsa sólo productos y deja el pedido "devuelto"', async () => {
    const orderId = await deliveredOrder(variantM, 2);
    const itemId = (await adminDetail(orderId)).items[0].id;
    const requestId = await requestReturn(orderId, 'devolucion', [{ orderItemId: itemId, quantity: 2 }]);

    await request(server())
      .post(`/admin/returns/${requestId}/approve`)
      .set(admin())
      .send({ items: [{ orderItemId: itemId, quantityApproved: 2 }] })
      .expect(200);
    // 2a: una vez aprobada no se aprueba ni se rechaza de nuevo.
    const again = await request(server()).post(`/admin/returns/${requestId}/reject`).set(admin()).send({ reason: 'x' }).expect(409);
    expect(again.body.code).toBe('RETURN_STATUS_CHANGED');

    const before = await stockTotal(variantM);
    await request(server())
      .post(`/admin/returns/${requestId}/receive`)
      .set(admin())
      .send({ items: [{ orderItemId: itemId, quantityReceived: 2, condition: 'ok' }] })
      .expect(200);

    expect(await stockTotal(variantM)).toBe(before + 2);
    expect(await movementRepo.countBy({ variantId: variantM.id, type: StockMovementType.DEVOLUCION })).toBeGreaterThanOrEqual(1);

    const detail = await adminDetail(orderId);
    expect(detail.status).toBe(OrderStatus.DEVUELTO);
    const refund = await refundRepo.findOneByOrFail({ orderId, originCu: RefundOrigin.CU_22 });
    expect(refund.amount).toBe(detail.subtotal);
    expect(refund.externalRefundId).toEqual(expect.any(String));

    const resolved = (await request(server()).get(`/admin/returns/${requestId}`).set(admin()).expect(200)).body;
    expect(resolved).toEqual(
      expect.objectContaining({ status: 'resuelta', refundId: refund.id, actions: expect.objectContaining({ canReceive: false }) }),
    );
    // Aprobación y resolución: dos avisos con la plantilla de posventa.
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.RESULTADO_POSVENTA })).toBe(2);
  });

  it('CU-22 10a: un cambio descuenta la variante elegida, queda la reposición pendiente y el Administrador la despacha', async () => {
    const orderId = await deliveredOrder(variantM, 1);
    const itemId = (await adminDetail(orderId)).items[0].id;
    const requestId = await requestReturn(orderId, 'cambio', [{ orderItemId: itemId, quantity: 1 }]);

    await request(server())
      .post(`/admin/returns/${requestId}/approve`)
      .set(admin())
      .send({ items: [{ orderItemId: itemId, quantityApproved: 1 }] })
      .expect(200);

    // La bandeja ofrece las variantes del mismo producto para reponer.
    const approved = (await request(server()).get(`/admin/returns/${requestId}`).set(admin()).expect(200)).body;
    expect(approved.items[0].replacementOptions.map((v: { id: string }) => v.id)).toContain(variantL.id);

    const [mBefore, lBefore] = [await stockTotal(variantM), await stockTotal(variantL)];
    await request(server())
      .post(`/admin/returns/${requestId}/receive`)
      .set(admin())
      .send({ items: [{ orderItemId: itemId, quantityReceived: 1, condition: 'ok', replacementVariantId: variantL.id }] })
      .expect(200);

    expect(await stockTotal(variantM)).toBe(mBefore + 1);
    expect(await stockTotal(variantL)).toBe(lBefore - 1);
    expect((await adminDetail(orderId)).status).toBe(OrderStatus.ENTREGADO);
    expect(await refundRepo.countBy({ orderId })).toBe(0);

    const pending = await request(server()).get('/admin/returns?replacements=pendientes').set(admin()).expect(200);
    expect(pending.body.items.map((r: { id: string }) => r.id)).toContain(requestId);

    await request(server())
      .post(`/admin/returns/${requestId}/replacement/dispatch`)
      .set(admin())
      .send({ carrier: 'OCA', number: 'X1' })
      .expect(200);
    const dispatched = (await request(server()).get(`/admin/returns/${requestId}`).set(admin()).expect(200)).body;
    expect(dispatched.replacements).toEqual([
      expect.objectContaining({ status: 'despachado', tracking: expect.objectContaining({ carrier: 'OCA', number: 'X1' }) }),
    ]);
    // No hay más nada para despachar.
    await request(server()).post(`/admin/returns/${requestId}/replacement/dispatch`).set(admin()).send({}).expect(409);
    // Aprobación, resolución y despacho de la reposición.
    expect(await emailLogRepo.countBy({ relatedOrderId: orderId, template: EmailTemplate.RESULTADO_POSVENTA })).toBe(3);
  });
});
