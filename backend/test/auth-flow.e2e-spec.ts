import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { MAIL_PROVIDER } from '../src/modules/notifications/mail-provider.interface.js';
import { CapturedMail } from './support/captured-mail.js';

/**
 * Flujo de negocio punta a punta de la Fase 1: registro -> verificación de
 * correo -> login -> renovación de sesión -> logout. Cruza CU-01, CU-07,
 * CU-06 y CU-10; por eso es un solo spec de flujo, no uno por CU (ver
 * convención de tests de plan-de-ejecucion.md).
 */
describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new CapturedMail();

  const email = `e2e-${Date.now()}@example.com`;
  const password = 'Password1';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('CU-01 registra la cuenta en estado pendiente de verificación', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Ana',
        lastName: 'Gomez',
        email,
        password,
        passwordConfirmation: password,
        acceptTerms: true,
      })
      .expect(201);
  });

  it('6a: rechaza el login mientras la cuenta está pendiente de verificación', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);
  });

  it('CU-07 verifica la cuenta con el token generado en el registro', async () => {
    const token = await mail.tokenFor(email, '/verify-email');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/auth/verify-email?token=${token}`)
      .expect(200);
  });

  it('CU-06 inicia sesión y setea la cookie httpOnly del refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    const setCookie = res.headers['set-cookie'];
    expect(setCookie?.[0]).toContain('refresh_token=');
    expect(setCookie?.[0]).toContain('HttpOnly');
  });

  it('CU-06 renueva la sesión con la cookie y rota el refresh token', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password }).expect(200);

    const refreshRes = await agent.post('/auth/refresh').expect(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
  });

  it('CU-10 cierra la sesión y el refresh usado deja de servir', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent.post('/auth/login').send({ email, password }).expect(200);

    await agent
      .post('/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    await agent.post('/auth/refresh').expect(401);
  });
});
