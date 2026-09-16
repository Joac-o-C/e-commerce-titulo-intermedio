/**
 * Debe ser idéntica a PASSWORD_POLICY_REGEX del backend
 * (backend/src/modules/auth/dto/password-policy.ts): mínimo 8 caracteres,
 * al menos 1 mayúscula y al menos 1 número. Si diverge, el frontend puede
 * validar como correcto algo que el backend rechaza.
 */
export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número'
