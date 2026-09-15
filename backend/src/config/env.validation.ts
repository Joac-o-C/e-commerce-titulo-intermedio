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
});
