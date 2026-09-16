import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** CU-12 Gestionar direcciones (alta). Solo `notes` es opcional. */
export class CreateAddressDto {
  @IsNotEmpty()
  alias: string;

  @IsNotEmpty()
  street: string;

  @IsNotEmpty()
  number: string;

  @IsOptional()
  @IsString()
  floorApt?: string;

  @IsNotEmpty()
  city: string;

  @IsNotEmpty()
  province: string;

  @Matches(/^\d{4,8}$/, { message: 'Código postal inválido' })
  postalCode: string;

  @Matches(/^\+?\d{6,15}$/, { message: 'Teléfono inválido' })
  phone: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
