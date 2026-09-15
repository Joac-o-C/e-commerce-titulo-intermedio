import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource usado exclusivamente por el CLI de TypeORM
 * (`npm run migration:generate|run|revert`), fuera del ciclo de vida de
 * Nest: por eso lee las variables de entorno directamente con dotenv en
 * vez de depender del ConfigService (que sólo existe dentro de la app).
 *
 * Las entidades y migraciones se listan por patrón glob relativo a este
 * archivo; TypeORM las resuelve igual corriendo compilado (dist) o vía
 * ts-node (src), según qué invoque el script.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT
    ? parseInt(process.env.DATABASE_PORT, 10)
    : 5432,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  synchronize: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
