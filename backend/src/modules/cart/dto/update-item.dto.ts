import { IsInt, Min } from 'class-validator';

/** CU-11 Modificar o quitar ítem del carrito (flujo cambiar cantidad). */
export class UpdateItemDto {
  // CU-11 (flujo 5a): cantidad inválida (0, negativa, no entera). Poner la
  // cantidad en 0 no equivale a quitar el ítem (para eso está DELETE).
  @IsInt()
  @Min(1)
  quantity: number;
}
