import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '../order-status.js';

/** CU-13 (paso 2, flujo 3a): página de 10 pedidos, con filtros opcionales. */
export class QueryMyOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /**
   * Instante ISO desde el que se incluyen pedidos (inclusive). El frontend
   * manda el comienzo del día elegido en la zona horaria del Cliente: el
   * servidor no adivina zonas.
   */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** Instante ISO hasta el que se incluyen pedidos (inclusive); el fin del día elegido. */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  // Tope de la columna int4: un número mayor no existe y haría fallar la consulta.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  number?: number;
}
