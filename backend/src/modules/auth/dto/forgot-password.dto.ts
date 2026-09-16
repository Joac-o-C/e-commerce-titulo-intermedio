import { IsEmail } from 'class-validator';

/** CU-08 Recuperar contraseña (sub-flujo Solicitar). */
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
