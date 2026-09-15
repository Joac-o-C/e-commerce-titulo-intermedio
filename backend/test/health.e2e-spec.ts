import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

/**
 * Smoke test end-to-end de la Fase 0: la app levanta contra una base real
 * y el endpoint de salud confirma la conexión a PostgreSQL. Requiere que
 * `docker compose up -d` esté corriendo (ver README de infraestructura).
 */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health responde ok con la base de datos arriba', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'ok') {
          throw new Error(`status inesperado: ${JSON.stringify(res.body)}`);
        }
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
