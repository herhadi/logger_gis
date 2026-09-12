import 'reflect-metadata';
import path from 'node:path';
import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import pgSessionFactory from 'connect-pg-simple';
import { AppModule } from './app.module';
import { databasePool } from './database/database.module';

// Konfigurasi Nest dipisahkan dari project Express lama.
// Pada hasil build, __dirname berada di dist/backend sehingga path ini
// tetap menunjuk ke apps/backend/.env di root repository.
dotenv.config({ path: path.resolve(__dirname, '../../apps/backend/.env') });

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
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  app.enableCors({
    credentials: true,
    origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin tidak diizinkan oleh CORS'));
      }
    }
  });
  app.getHttpAdapter().get('/', (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ service: 'gis-watermeter-backend', framework: 'nestjs', status: 'ok' }));
  return app;
}

async function bootstrap() {
  const app = await createNestApp();
  await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0');
}

if (require.main === module) bootstrap();
