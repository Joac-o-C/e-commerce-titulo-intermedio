import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // El refresh token viaja en una cookie httpOnly (ver AuthController).
  app.use(cookieParser());

  // El servidor nunca confía en la forma exacta de lo que envía el
  // cliente: rechaza campos no declarados en el DTO y aplica las
  // validaciones de class-validator antes de llegar al controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // El frontend (Vite, otro puerto) necesita poder llamar a esta API, y
  // enviar/recibir la cookie httpOnly del refresh token (credentials: true).
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
