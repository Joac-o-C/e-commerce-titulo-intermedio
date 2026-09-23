import { IsUUID } from 'class-validator';

/** CU-03 (pasos 9-10): resumen del pedido con la dirección y el envío elegidos. */
export class CheckoutQuoteDto {
  @IsUUID()
  addressId: string;

  @IsUUID()
  shippingMethodId: string;
}
