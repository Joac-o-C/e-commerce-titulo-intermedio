import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaymentAuditLog } from './entities/payment-audit-log.entity.js';
import { Payment } from './entities/payment.entity.js';
import { Refund } from './entities/refund.entity.js';
import { AdminRefundsController } from './admin-refunds.controller.js';
import { FakePaymentController } from './fake-payment.controller.js';
import { PaymentGatewayModule } from './gateway/payment-gateway.module.js';
import { PaymentLedgerModule } from './ledger/payment-ledger.module.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentAuditLog, Refund]),
    PaymentGatewayModule,
    PaymentLedgerModule,
    OrdersModule,
    UsersModule,
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [PaymentsWebhookController, PaymentsController, FakePaymentController, AdminRefundsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
