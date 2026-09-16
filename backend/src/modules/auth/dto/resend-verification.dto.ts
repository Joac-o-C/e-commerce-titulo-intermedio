import { IsEmail } from 'class-validator';

/** CU-07 Verificar correo (sub-flujo Reenviar). */
export class ResendVerificationDto {
  @IsEmail()
  email: string;
}
