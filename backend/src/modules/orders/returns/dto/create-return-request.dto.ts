import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReturnRequestType } from '../entities/return-request.entity.js';

export class ReturnRequestItemDto {
  @IsUUID()
  orderItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * CU-15 (paso 4). Llega como multipart/form-data (las fotos viajan como
 * archivos `photos`), así que `items` es un JSON string: el @Transform lo
 * parsea y además instancia cada ítem, porque @Type no se aplica sobre un
 * valor que ya reemplazó un @Transform (mismo caso que CreateProductDto).
 */
export class CreateReturnRequestDto {
  @IsEnum(ReturnRequestType)
  type: ReturnRequestType;

  // CU-15 (flujo 5a): sin motivo no se crea la solicitud.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Indicá el motivo del cambio o la devolución' })
  @MaxLength(1000)
  reason: string;

  @Transform(({ value }) => {
    let parsed: unknown = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return value;
      }
    }
    return Array.isArray(parsed) ? plainToInstance(ReturnRequestItemDto, parsed) : parsed;
  })
  @IsArray()
  // CU-15 (flujo 5a): sin ítems seleccionados.
  @ArrayNotEmpty({ message: 'Elegí al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  items: ReturnRequestItemDto[];
}
