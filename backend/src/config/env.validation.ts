import Joi from 'joi';

/**
 * Esquema de validación de variables de entorno, aplicado por
 * ConfigModule al arrancar la app. Si falta o es inválida alguna
 * variable requerida, la app no levanta (falla rápido en vez de
 * fallar más tarde con un error de conexión críptico).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  // Secrets separados para access y refresh: si se compromete uno no sirve
  // para forjar el otro, y permite rotarlos de forma independiente.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  // CU-06/CU-10: el access token vive poco (~15 min) y no tiene lista de
  // revocación — se lo deja expirar solo.
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  // No fijado por ninguna ficha; sesión persistente típica de e-commerce.
  // La expiración real de cada sesión igual se guarda en RefreshToken.expiresAt.
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  // CU-07: token de verificación de correo, de un solo uso.
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: Joi.number().default(24),
  // CU-08: token de restablecimiento de contraseña, de un solo uso.
  PASSWORD_RESET_TOKEN_TTL_HOURS: Joi.number().default(1),

  // CU-06 (flujo 5a): bloqueo por intentos fallidos, por cuenta y por IP.
  LOGIN_ACCOUNT_MAX_ATTEMPTS: Joi.number().default(5),
  LOGIN_ACCOUNT_LOCKOUT_WINDOW_MIN: Joi.number().default(15),
  LOGIN_ACCOUNT_LOCKOUT_DURATION_MIN: Joi.number().default(15),
  LOGIN_IP_MAX_ATTEMPTS: Joi.number().default(20),
  LOGIN_IP_LOCKOUT_WINDOW_MIN: Joi.number().default(15),
  LOGIN_IP_LOCKOUT_DURATION_MIN: Joi.number().default(15),

  // CU-20 (flujo 1a) / CU-07 (R3a) / CU-08 (S2a): límite de envíos por
  // cuenta y plantilla dentro de la ventana.
  EMAIL_RATE_LIMIT_MAX_PER_HOUR: Joi.number().default(3),
});
