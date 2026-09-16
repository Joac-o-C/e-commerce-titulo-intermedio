import { IsNotEmpty, IsString } from 'class-validator';

/** CU-07 Verificar correo (confirmación del enlace). */
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
