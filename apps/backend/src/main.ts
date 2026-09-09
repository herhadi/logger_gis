import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import pgSessionFactory from 'connect-pg-simple';
import { AppModule } from './app.module';
import { databasePool } from './database/database.module';

export async function createNestApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const PgSession = pgSessionFactory(session);
  app.use(session({
    store: new PgSession({ pool: databasePool, tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'development-only-secret',
    resave: false,
    saveUninitialized: false,
    name: 'session_cookie',
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' }
  }));
  app.enableCors({ credentials: true });
  app.getHttpAdapter().get('/', (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ service: 'gis-watermeter-backend', framework: 'nestjs', status: 'ok' }));
  return app;
}

async function bootstrap() {
  const app = await createNestApp();
  await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0');
}

if (require.main === module) bootstrap();
