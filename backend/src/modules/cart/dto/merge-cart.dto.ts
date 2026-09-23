import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

/** Un ítem del carrito de invitado a resolver contra el catálogo. */
export class MergeCartItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * CU-06 Iniciar sesión (fusión del carrito de invitado). Se usa tanto para
 * el preview (no persiste nada) como para el confirm (aplica lo que el
 * usuario aceptó en el modal de conflictos).
 */
export class MergeCartDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MergeCartItemDto)
  items: MergeCartItemDto[];
}
