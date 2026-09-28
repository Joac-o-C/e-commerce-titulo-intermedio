import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../entities/payment.entity.js';
import { Refund } from '../entities/refund.entity.js';
import { PaymentLedgerService } from './payment-ledger.service.js';

/** Ver `PaymentLedgerService`: mismo motivo que `PaymentGatewayModule` para ser un módulo aparte. */
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Refund])],
  providers: [PaymentLedgerService],
  exports: [PaymentLedgerService],
})
export class PaymentLedgerModule {}
