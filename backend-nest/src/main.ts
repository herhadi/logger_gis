import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import pgSessionFactory from 'connect-pg-simple';
import { AppModule } from './app.module';
import { databasePool } from './database/database.module';

export async function createNestApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const PgSession = pgSessionFactory(session);
  app.use(session({
    store: new PgSession({ pool: databasePool, tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'development-only-secret',
    resave: false,
    saveUninitialized: false,
    name: 'session_cookie',
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
  }));
  app.enableCors({ credentials: true });
  return app;
}

async function bootstrap() {
  const app = await createNestApp();
  await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0');
}

if (require.main === module) bootstrap();
