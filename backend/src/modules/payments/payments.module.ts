import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaymentAuditLog } from './entities/payment-audit-log.entity.js';
import { Payment } from './entities/payment.entity.js';
import { FakePaymentController } from './fake-payment.controller.js';
import { PaymentGatewayModule } from './gateway/payment-gateway.module.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentAuditLog]),
    PaymentGatewayModule,
    OrdersModule,
    UsersModule,
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [PaymentsWebhookController, PaymentsController, FakePaymentController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
