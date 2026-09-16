/**
 * Política de contraseña compartida por CU-01 (registro) y CU-08 (reset):
 * mínimo 8 caracteres, al menos 1 mayúscula y al menos 1 número. El mismo
 * regex se replica en el schema Zod del frontend para no divergir.
 */
export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número';
