import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { OrderStatus } from '../../order-status.js';
import { TrackingDto } from './tracking.dto.js';

/** CU-19 (pasos 5-7). */
export class ChangeOrderStatusDto {
  /** Estado que vio el Administrador (flujo 8a). */
  @IsEnum(OrderStatus)
  expectedStatus: OrderStatus;

  @IsEnum(OrderStatus)
  to: OrderStatus;

  /** Nota del historial (paso 8). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Paso 6: sólo al pasar a "despachado"; todo opcional (flujo 7b). */
  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingDto)
  tracking?: TrackingDto;
}
