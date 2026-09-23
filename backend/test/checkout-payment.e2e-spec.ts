import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { EmailLog, EmailTemplate } from '../src/modules/notifications/entities/email-log.entity.js';
import { Order } from '../src/modules/orders/entities/order.entity.js';
import { OrderStatus } from '../src/modules/orders/order-status.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { PaymentAuditEvent, PaymentAuditLog } from '../src/modules/payments/entities/payment-audit-log.entity.js';
import { signWebhook } from '../src/modules/payments/gateway/webhook-signature.js';
import { Product } from '../src/modules/products/entities/product.entity.js';
import { ProductVariant } from '../src/modules/products/entities/product-variant.entity.js';

/**
 * Flujo de negocio punta a punta de la Fase 4: carrito → checkout (CU-03)
 * → pago en la pasarela simulada → webhook firmado (CU-05) → pedido
 * pagado con el stock descontado. Incluye los caminos de mayor riesgo:
 * idempotencia del webhook, rechazo con liberación de stock, y pago
 * acreditado después de vencida la reserva (CU-03 18a + CU-05 7a-1).
 *
 * Corre contra la base local con PAYMENT_GATEWAY=fake (el default de
 * desarrollo), así que la pasarela es la simulada en memoria.
 */
describe('Checkout y pago (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let emailLogRepo: Repository<EmailLog>;
  let variantRepo: Repository<ProductVariant>;
  let productRepo: Repository<Product>;
  let orderRepo: Repository<Order>;
  let auditRepo: Repository<PaymentAuditLog>;
  let ordersService: OrdersService;

  const email = `e2e-checkout-${Date.now()}@example.com`;
  const password = 'Password1';
  let token: string;
  let addressId: string;
  let shippingMethodId: string;
  let product: Product;
  let variant: ProductVariant;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const stockOf = async () => {
    const v = await variantRepo.findOneByOrFail({ id: variant.id });
    return { total: v.stockTotal, reserved: v.stockReserved };
  };

  /** Carrito con `quantity` unidades → checkout confirmado. Devuelve el pedido y la preferencia simulada. */
  const checkout = async (quantity: number) => {
    await request(app.getHttpServer()).post('/cart/items').set(auth()).send({ variantId: variant.id, quantity }).expect(201);
    await request(app.getHttpServer()).post('/checkout/revalidate').set(auth()).expect(201);
    const quote = await request(app.getHttpServer())
      .post('/checkout/quote')
      .set(auth())
      .send({ addressId, shippingMethodId })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/checkout')
      .set(auth())
      .send({ addressId, shippingMethodId, expectedTotal: quote.body.total })
      .expect(201);
    const preferenceId = new URL(res.body.redirectUrl).searchParams.get('preferenceId')!;
    return { orderId: res.body.orderId as string, preferenceId };
  };

  const pay = (preferenceId: string, outcome: 'approved' | 'rejected' | 'pending') =>
    request(app.getHttpServer()).post(`/payments/fake/preferences/${preferenceId}/pay`).send({ outcome }).expect(201);

  const orderStatus = async (orderId: string) =>
    (await request(app.getHttpServer()).get(`/orders/${orderId}`).set(auth()).expect(200)).body.status;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());

    emailLogRepo = moduleFixture.get(getRepositoryToken(EmailLog));
    variantRepo = moduleFixture.get(getRepositoryToken(ProductVariant));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    orderRepo = moduleFixture.get(getRepositoryToken(Order));
    auditRepo = moduleFixture.get(getRepositoryToken(PaymentAuditLog));
    ordersService = moduleFixture.get(OrdersService);

    // Producto propio del test, para no depender del catálogo local.
    product = await productRepo.save(
      productRepo.create({ name: `Producto e2e ${Date.now()}`, description: 'e2e', price: '1000.00', isPublished: true }),
    );
    variant = await variantRepo.save(
      variantRepo.create({ productId: product.id, sku: `E2E-${Date.now()}`, attributes: {}, stockTotal: 10 }),
    );

    // Cliente verificado con una dirección.
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firstName: 'Ana', lastName: 'Compra', email, password, passwordConfirmation: password, acceptTerms: true })
      .expect(201);
    const log = await emailLogRepo.findOneOrFail({
      where: { recipientEmail: email, template: EmailTemplate.VERIFICACION },
      order: { createdAt: 'DESC' },
    });
    await request(app.getHttpServer())
      .post(`/auth/verify-email?token=${(log.payloadSnapshot as { token: string }).token}`)
      .expect(200);
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200)).body.accessToken;

    addressId = (
      await request(app.getHttpServer())
        .post('/users/me/addresses')
        .set(auth())
        .send({ alias: 'Casa', street: 'Calle', number: '1', city: 'Córdoba', province: 'Córdoba', postalCode: '5000', phone: '351555' })
        .expect(201)
    ).body.id;
    const methods = await request(app.getHttpServer())
      .get(`/checkout/shipping-methods?addressId=${addressId}`)
      .set(auth())
      .expect(200);
    shippingMethodId = methods.body[0].id;
  });

  afterAll(async () => {
    // Se deja el producto despublicado para no ensuciar el catálogo local.
    await productRepo.update(product.id, { isPublished: false });
    await app.close();
  });

  it('CU-03 → CU-05: compra aprobada deja el pedido "pagado" y descuenta el stock en firme', async () => {
    const { orderId, preferenceId } = await checkout(2);
    expect(await orderStatus(orderId)).toBe(OrderStatus.PENDIENTE_PAGO);
    expect(await stockOf()).toEqual({ total: 10, reserved: 2 });

    // El carrito quedó asociado al pedido: el cliente arranca uno nuevo, vacío.
    const cart = await request(app.getHttpServer()).get('/cart').set(auth()).expect(200);
    expect(cart.body.totalItems).toBe(0);

    await pay(preferenceId, 'approved');

    expect(await orderStatus(orderId)).toBe(OrderStatus.PAGADO);
    expect(await stockOf()).toEqual({ total: 8, reserved: 0 });
    const mails = await emailLogRepo.count({ where: { relatedOrderId: orderId, template: EmailTemplate.RESULTADO_PAGO } });
    expect(mails).toBe(1);
  });

  it('CU-05 6a: el mismo webhook repetido por el endpoint real no altera nada', async () => {
    const { orderId, preferenceId } = await checkout(1);
    const { body } = await pay(preferenceId, 'approved');
    const stockBefore = await stockOf();

    await http
      .post(`/payments/webhook/mercadopago?data.id=${body.paymentId}&type=payment`)
      .set(signWebhook(body.paymentId, process.env.PAYMENT_WEBHOOK_SECRET ?? 'fake-webhook-secret-solo-para-desarrollo'))
      .send({ type: 'payment', data: { id: body.paymentId } })
      .expect(200);

    // El endpoint responde 200 y procesa en segundo plano (CU-05 paso 2).
    await vi.waitFor(
      async () => {
        const dup = await auditRepo.count({
          where: { externalPaymentId: body.paymentId, eventType: PaymentAuditEvent.NOTIFICACION_DUPLICADA },
        });
        expect(dup).toBe(1);
      },
      { timeout: 3000 },
    );
    expect(await stockOf()).toEqual(stockBefore);
    expect(await emailLogRepo.count({ where: { relatedOrderId: orderId } })).toBe(1);
  });

  it('CU-05 3a: un webhook con firma inválida se descarta', async () => {
    await http
      .post('/payments/webhook/mercadopago?data.id=999&type=payment')
      .set(signWebhook('999', 'secreto-equivocado'))
      .send({})
      .expect(200);

    await vi.waitFor(
      async () => {
        const invalid = await auditRepo.count({
          where: { externalPaymentId: '999', eventType: PaymentAuditEvent.NOTIFICACION_INVALIDA },
        });
        expect(invalid).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('CU-05 7.b: un pago rechazado libera la reserva', async () => {
    const before = await stockOf();
    const { orderId, preferenceId } = await checkout(3);
    expect((await stockOf()).reserved).toBe(before.reserved + 3);

    await pay(preferenceId, 'rejected');

    expect(await orderStatus(orderId)).toBe(OrderStatus.PAGO_RECHAZADO);
    expect(await stockOf()).toEqual(before);
  });

  it('CU-03 18a + CU-05 7a-1: vence la reserva, y un pago acreditado después igual deja el pedido "pagado"', async () => {
    const before = await stockOf();
    const { orderId, preferenceId } = await checkout(1);

    // Se simula que pasaron las 24 h y corre el proceso de vencimiento.
    await orderRepo.update(orderId, { reservationExpiresAt: new Date(Date.now() - 1000) });
    await ordersService.expireReservations();
    expect(await orderStatus(orderId)).toBe(OrderStatus.CANCELADO);
    expect(await stockOf()).toEqual(before);

    // El pago se acredita tarde: hay stock disponible, así que se descuenta sin faltante.
    await pay(preferenceId, 'approved');
    expect(await orderStatus(orderId)).toBe(OrderStatus.PAGADO);
    expect(await stockOf()).toEqual({ total: before.total - 1, reserved: before.reserved });
  });

  it('CU-03 13a: no se puede confirmar si el total cambió desde el resumen', async () => {
    await request(app.getHttpServer()).post('/cart/items').set(auth()).send({ variantId: variant.id, quantity: 1 }).expect(201);
    const res = await request(app.getHttpServer())
      .post('/checkout')
      .set(auth())
      .send({ addressId, shippingMethodId, expectedTotal: '1.00' })
      .expect(409);

    expect(res.body.code).toBe('CHECKOUT_STALE');
    // El carrito sigue intacto y editable para reintentar.
    const cart = await request(app.getHttpServer()).get('/cart').set(auth()).expect(200);
    expect(cart.body.totalItems).toBe(1);
  });
});
