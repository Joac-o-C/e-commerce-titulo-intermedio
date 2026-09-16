import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { IsEqualTo } from '../../../common/validators/is-equal-to.decorator.js';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from './password-policy.js';

/** CU-08 Recuperar contraseña (restablecimiento con el enlace). */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  // CU-08 (flujo 6a): debe coincidir con password.
  @IsEqualTo('password', { message: 'Las contraseñas no coinciden' })
  passwordConfirmation: string;
}
