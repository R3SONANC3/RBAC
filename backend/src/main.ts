import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // PrismaExceptionFilter is registered as an APP_FILTER provider in AppModule
  // so it also applies when e2e tests bootstrap the app directly (bypassing this file).
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
