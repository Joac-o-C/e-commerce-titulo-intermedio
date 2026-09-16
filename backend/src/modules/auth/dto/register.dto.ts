import { IsEmail, IsIn, IsNotEmpty, Matches } from 'class-validator';
import { IsEqualTo } from '../../../common/validators/is-equal-to.decorator.js';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from './password-policy.js';

/** CU-01 Registrar usuario. */
export class RegisterDto {
  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  // CU-01 (flujo 5a): debe coincidir con password.
  @IsEqualTo('password', { message: 'Las contraseñas no coinciden' })
  passwordConfirmation: string;

  @IsIn([true], { message: 'Debés aceptar los términos y condiciones' })
  acceptTerms: boolean;
}
