import { OmitType, PartialType } from '@nestjs/mapped-types';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { CreateProductDto, parseIfJsonString } from './create-product.dto.js';
import { UpdateVariantDto } from './create-variant.dto.js';

/**
 * CU-16 (flujo 3a): mismos campos que el alta, todos opcionales, más
 * `version` (obligatorio) para la concurrencia optimista — el cliente debe
 * enviar la versión que tenía cargada al abrir el formulario de edición.
 * Las variantes pueden traer `id` (ver UpdateVariantDto).
 */
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['variants'] as const)) {
  @Type(() => Number)
  @IsInt()
  version: number;

  // Mismo doble trabajo del @Transform que en CreateProductDto (multipart).
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseIfJsonString(value);
    return Array.isArray(parsed) ? plainToInstance(UpdateVariantDto, parsed) : parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
