import { IsInt, IsUUID, Min } from 'class-validator';

/** CU-02 Agregar producto al carrito. */
export class AddItemDto {
  @IsUUID()
  variantId: string;

  // CU-02 (flujo 2a): cantidad inválida (0, negativa, no entera) se rechaza acá.
  @IsInt()
  @Min(1)
  quantity: number;
}
