import { IsUUID } from 'class-validator';

/** CU-03 (paso 7): métodos de envío para la dirección elegida. */
export class ShippingMethodsQueryDto {
  @IsUUID()
  addressId: string;
}
