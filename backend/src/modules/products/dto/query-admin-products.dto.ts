import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Listado del panel admin (CU-16, paso 2): tabla paginada clásica, incluye no publicados/inactivos. */
export class QueryAdminProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
