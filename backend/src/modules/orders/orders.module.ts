import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartModule } from '../cart/cart.module.js';
import { PaymentGatewayModule } from '../payments/gateway/payment-gateway.module.js';
import { ProductsModule } from '../products/products.module.js';
import { UsersModule } from '../users/users.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderStatusHistory } from './entities/order-status-history.entity.js';
import { Order } from './entities/order.entity.js';
import { ShippingMethod } from './entities/shipping-method.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, ShippingMethod]),
    CartModule,
    ProductsModule,
    UsersModule,
    // Sólo la pasarela, no PaymentsModule: ver payment-gateway.module.ts.
    PaymentGatewayModule,
    // Mismo motivo que en el resto de los módulos: habilita JwtAuthGuard.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CheckoutController, OrdersController],
  providers: [OrdersService, CheckoutService],
  // `payments` aplica el resultado de cada pago sobre el pedido (CU-05).
  exports: [OrdersService],
})
export class OrdersModule {}
