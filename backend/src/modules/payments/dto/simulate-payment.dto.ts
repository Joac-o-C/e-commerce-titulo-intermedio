import { IsIn } from 'class-validator';
import type { SimulatedOutcome } from '../gateway/fake-payment.gateway.js';

/** Resultado que el Cliente "elige" en la página de pago simulada. */
export class SimulatePaymentDto {
  @IsIn(['approved', 'rejected', 'pending'])
  outcome: SimulatedOutcome;
}

/** Acreditación (o rechazo) posterior de un pago que quedó pendiente, como un pago en efectivo. */
export class SettlePaymentDto {
  @IsIn(['approved', 'rejected'])
  outcome: Exclude<SimulatedOutcome, 'pending'>;
}
