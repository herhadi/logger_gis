import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ credentials: true });
  await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0');
}

bootstrap();
