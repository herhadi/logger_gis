import { Global, Module } from '@nestjs/common';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Pool dibuat saat module di-import, jadi env Nest harus dimuat lebih dulu.
dotenv.config({ path: path.resolve(__dirname, '../../apps/backend/.env') });

export const DATABASE_POOL = 'DATABASE_POOL';

export const databasePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

@Global()
@Module({
  providers: [{ provide: DATABASE_POOL, useValue: databasePool }],
  exports: [DATABASE_POOL]
})
export class DatabaseModule {}
