import { PartialType } from '@nestjs/mapped-types';
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductDto } from './create-product.dto.js';

/**
 * CU-16 (flujo 3a): mismos campos que el alta, todos opcionales, más
 * `version` (obligatorio) para la concurrencia optimista — el cliente debe
 * enviar la versión que tenía cargada al abrir el formulario de edición.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @Type(() => Number)
  @IsInt()
  version: number;
}
