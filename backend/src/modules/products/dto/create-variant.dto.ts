import { IsInt, IsNotEmpty, IsObject, IsOptional, IsUUID, Min } from 'class-validator';

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

/**
 * Variante dentro de la edición (CU-16 flujo 3a). Con `id` es una variante
 * existente (se actualiza en su lugar); sin `id`, una nueva. El orden de la
 * lista es el orden en que la ve el Cliente, y las existentes que no vengan
 * se dan de baja lógica. En una existente, `stockTotal` es el stock total
 * deseado: si cambia, queda un movimiento "ajuste" en el historial (CU-18).
 */
export class UpdateVariantDto extends CreateVariantDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;
}
