import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './typeorm.config.js';

/**
 * Encapsula la conexión a PostgreSQL vía TypeORM. Se importa una sola vez
 * desde AppModule; el resto de los módulos de dominio sólo usan
 * TypeOrmModule.forFeature([...]) para registrar sus propias entidades.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
  ],
})
export class DatabaseModule {}
