import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** CU-06 Iniciar sesión. */
export class LoginDto {
  // CU-06 (flujo 4a): formato inválido se rechaza acá, antes de tocar el service.
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
