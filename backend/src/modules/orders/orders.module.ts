import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../providers/storage/storage.module.js';
import { CartModule } from '../cart/cart.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentGatewayModule } from '../payments/gateway/payment-gateway.module.js';
import { PaymentLedgerModule } from '../payments/ledger/payment-ledger.module.js';
import { ProductsModule } from '../products/products.module.js';
import { UsersModule } from '../users/users.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderStatusHistory } from './entities/order-status-history.entity.js';
import { Order } from './entities/order.entity.js';
import { ShippingMethod } from './entities/shipping-method.entity.js';
import { OrderCancellationService } from './order-cancellation.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ReturnRequestItem } from './returns/entities/return-request-item.entity.js';
import { ReturnRequestPhoto } from './returns/entities/return-request-photo.entity.js';
import { ReturnRequest } from './returns/entities/return-request.entity.js';
import { ReturnsController } from './returns/returns.controller.js';
import { ReturnsService } from './returns/returns.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      ShippingMethod,
      ReturnRequest,
      ReturnRequestItem,
      ReturnRequestPhoto,
    ]),
    CartModule,
    ProductsModule,
    UsersModule,
    NotificationsModule,
    StorageModule,
    // Sólo la pasarela y el libro de pagos, no PaymentsModule: ver
    // payment-gateway.module.ts (payments ya depende de orders).
    PaymentGatewayModule,
    PaymentLedgerModule,
    // Mismo motivo que en el resto de los módulos: habilita JwtAuthGuard.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CheckoutController, OrdersController, ReturnsController],
  providers: [OrdersService, CheckoutService, CustomerOrdersService, OrderCancellationService, ReturnsService],
  // `payments` aplica el resultado de cada pago sobre el pedido (CU-05) y
  // devuelve el detalle del pedido al volver de la pasarela.
  exports: [OrdersService, CustomerOrdersService],
})
export class OrdersModule {}
