import { IsInt, IsOptional, Min } from 'class-validator';

/** CU-18 (flujo 3a): `null`/omitido vuelve a regir el valor global por defecto (5). */
export class SetLowStockThresholdDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number | null;
}
