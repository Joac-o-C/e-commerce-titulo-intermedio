import { Matches } from 'class-validator';
import { CheckoutQuoteDto } from './checkout-quote.dto.js';

/**
 * CU-03 (paso 12): confirmación del pedido. `expectedTotal` es el total que
 * el Cliente vio en el resumen: el servidor nunca lo usa para cobrar
 * (siempre recalcula contra el catálogo), sólo para detectar que algo
 * cambió desde que lo vio y no confirmar a sus espaldas (flujo 13a).
 */
export class ConfirmCheckoutDto extends CheckoutQuoteDto {
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'expectedTotal debe ser un importe con hasta 2 decimales' })
  expectedTotal: string;
}
