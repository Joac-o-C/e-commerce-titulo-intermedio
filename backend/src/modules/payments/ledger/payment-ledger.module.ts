import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { UsersModule } from '../../users/users.module.js';
import { PaymentAuditLog } from '../entities/payment-audit-log.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { Refund } from '../entities/refund.entity.js';
import { PaymentGatewayModule } from '../gateway/payment-gateway.module.js';
import { RefundsService } from '../refunds/refunds.service.js';
import { PaymentLedgerService } from './payment-ledger.service.js';

/**
 * Pagos y reembolsos de un pedido (registro, lectura y ejecución de CU-21).
 * Sin dependencias de `orders`, por el mismo motivo que
 * `PaymentGatewayModule`: `payments` ya depende de `orders`, y `orders`
 * necesita registrar y disparar reembolsos (CU-14/19/22).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Refund, PaymentAuditLog]), PaymentGatewayModule, NotificationsModule, UsersModule],
  providers: [PaymentLedgerService, RefundsService],
  exports: [PaymentLedgerService, RefundsService],
})
export class PaymentLedgerModule {}
