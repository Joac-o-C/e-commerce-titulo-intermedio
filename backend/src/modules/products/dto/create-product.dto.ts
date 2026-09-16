import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateVariantDto } from './create-variant.dto.js';

/**
 * Parsea un campo que puede llegar como JSON string (multipart/form-data,
 * ver AdminProductsController) o ya como array/objeto (JSON body normal).
 */
function parseIfJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** multipart/form-data sólo manda strings: "true"/"false" hay que castearlos. */
function parseBoolean(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * CU-16 ABM de productos (alta). Las imágenes viajan aparte, como archivos
 * multipart (`images`), no en este DTO. Si `variants` viene vacío, el
 * service crea una variante implícita única (CU-09, flujo 3a).
 */
export class CreateProductDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @Type(() => Number)
  @IsPositive()
  price: number;

  @IsOptional()
  @IsString()
  brand?: string;

  @Transform(({ value }) => parseIfJsonString(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  categoryIds: string[];

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lowStockThreshold?: number;

  // El @Transform hace doble trabajo: parsea el JSON string (multipart) y
  // construye instancias reales de CreateVariantDto — @Type por sí solo no
  // alcanza cuando @Transform ya reemplazó el valor, así que la instanciación
  // se hace acá mismo para que ValidateNested pueda validar cada variante.
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseIfJsonString(value);
    return Array.isArray(parsed) ? plainToInstance(CreateVariantDto, parsed) : parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
