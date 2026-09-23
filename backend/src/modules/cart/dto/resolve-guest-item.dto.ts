import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * CU-02/CU-11 para el carrito de invitado: el frontend nunca decide stock
 * ni precio por su cuenta, así que valida cada cambio local contra este
 * endpoint público antes de aplicarlo en el store de Zustand.
 * `alreadyInCart` es lo que el store local ya tenga de esa variante
 * (excluyendo la operación en curso), para que la validación considere el
 * total resultante igual que en el carrito de un Cliente.
 */
export class ResolveGuestItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  alreadyInCart: number;
}
