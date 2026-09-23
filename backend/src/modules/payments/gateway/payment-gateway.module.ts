import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentGateway } from './fake-payment.gateway.js';
import { MercadoPagoGateway } from './mercadopago.gateway.js';
import { PAYMENT_GATEWAY } from './payment-gateway.interface.js';

/**
 * Módulo chico y sin dependencias de dominio a propósito: `orders` necesita
 * la pasarela para crear la preferencia (CU-03) y `payments` para
 * reconciliar pagos (CU-05), y `payments` a su vez depende de `orders`
 * para actualizar el pedido. Si la pasarela viviera en PaymentsModule,
 * orders ⇄ payments sería un import circular.
 *
 * `FakePaymentGateway` se registra siempre (el controller de la pasarela
 * simulada lo inyecta por clase), pero sólo es el `PAYMENT_GATEWAY` activo
 * con PAYMENT_GATEWAY=fake.
 */
@Module({
  providers: [
    FakePaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, FakePaymentGateway],
      useFactory: (config: ConfigService, fake: FakePaymentGateway) =>
        config.get<string>('PAYMENT_GATEWAY') === 'mercadopago' ? new MercadoPagoGateway(config) : fake,
    },
  ],
  exports: [PAYMENT_GATEWAY, FakePaymentGateway],
})
export class PaymentGatewayModule {}
