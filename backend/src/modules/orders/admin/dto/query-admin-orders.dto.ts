import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { CustomerPaymentStatus } from '../../order-policies.js';
import { OrderStatus } from '../../order-status.js';

/** Orden configurable del listado (decisión de la Fase 6: fecha, total y estado). */
export type AdminOrderSort = 'fecha_desc' | 'fecha_asc' | 'total_desc' | 'total_asc' | 'estado';

/** CU-19 (paso 2): búsqueda y filtros sobre todos los pedidos. */
export class QueryAdminOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  number?: number;

  /** Nombre, apellido o email del cliente (búsqueda parcial). */
  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsIn(['pendiente', 'aprobado', 'rechazado', 'sin_pago'])
  paymentStatus?: CustomerPaymentStatus;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  /** Alerta de CU-21 (4a/5a): sólo pedidos con reembolsos que requieren gestión. */
  @IsOptional()
  @IsIn(['requieren_gestion'])
  refunds?: 'requieren_gestion';

  @IsOptional()
  @IsIn(['fecha_desc', 'fecha_asc', 'total_desc', 'total_asc', 'estado'])
  sort?: AdminOrderSort;
}
