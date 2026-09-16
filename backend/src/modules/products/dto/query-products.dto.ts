import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export type ProductSort = 'relevancia' | 'precio_asc' | 'precio_desc' | 'nuevos' | 'nombre_asc' | 'mas_vendidos';

/** CU-04 Filtrar productos. `limit` no es configurable: siempre 24 (scroll infinito). */
export class QueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStockOnly?: boolean;

  @IsOptional()
  @IsIn(['relevancia', 'precio_asc', 'precio_desc', 'nuevos', 'nombre_asc', 'mas_vendidos'])
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
