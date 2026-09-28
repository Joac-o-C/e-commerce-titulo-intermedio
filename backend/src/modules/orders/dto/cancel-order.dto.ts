import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../order-status.js';

/** CU-14 (pasos 3-4). */
export class CancelOrderDto {
  /** Estado que el Cliente vio al confirmar (flujo 5a). */
  @IsEnum(OrderStatus)
  expectedStatus: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
