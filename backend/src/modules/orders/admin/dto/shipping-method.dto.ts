import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Opcional pero no anulable: `@IsOptional()` también saltea la validación
 * con `null`, y un `null` en nombre o costo terminaba en 500 (NOT NULL /
 * `toFixed`) en vez de 400.
 */
const isPresent = (_: object, value: unknown) => value !== undefined;

/** ABM de métodos de envío (alcance extra de la Fase 6). Costo 0 permitido. */
export class CreateShippingMethodDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el nombre' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo debe ser un importe con hasta 2 decimales' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  @Max(99999999.99)
  cost: number;
}

export class UpdateShippingMethodDto {
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el nombre' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ValidateIf(isPresent)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo debe ser un importe con hasta 2 decimales' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  @Max(99999999.99)
  cost?: number;
}

export class SetShippingMethodActiveDto {
  @IsBoolean()
  isActive: boolean;
}
