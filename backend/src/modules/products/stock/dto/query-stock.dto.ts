import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** CU-18 (paso 2): listado de variantes con filtros para el panel de stock. */
export class QueryStockDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyLowStock?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyOutOfStock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
