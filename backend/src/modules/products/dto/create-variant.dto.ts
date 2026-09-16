import { IsInt, IsNotEmpty, IsObject, IsOptional, Min } from 'class-validator';

/** Variante anidada dentro del alta/edición de producto (CU-16). */
export class CreateVariantDto {
  @IsNotEmpty()
  sku: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @IsInt()
  @Min(0)
  stockTotal: number;
}
