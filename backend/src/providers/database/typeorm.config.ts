import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Arma las opciones de conexión de TypeORM a partir del ConfigService.
 * Se usa tanto desde el DatabaseModule (runtime de la app) como podría
 * reusarse desde data-source.ts si en algún momento conviene compartir
 * lógica; hoy data-source.ts lee las variables directamente porque el
 * CLI de TypeORM corre fuera del contexto de Nest (no hay ConfigService).
 */
export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DATABASE_HOST'),
    port: config.get<number>('DATABASE_PORT'),
    username: config.get<string>('DATABASE_USER'),
    password: config.get<string>('DATABASE_PASSWORD'),
    database: config.get<string>('DATABASE_NAME'),
    // Autoload de entidades registradas vía TypeOrmModule.forFeature en cada
    // módulo de dominio (auth, users, products, etc.), sin listarlas acá.
    autoLoadEntities: true,
    // Nunca sincronizar el schema automáticamente: el modelo se versiona
    // con migraciones (ver providers/database/data-source.ts).
    synchronize: false,
    migrationsRun: false,
  };
}
