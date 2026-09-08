import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

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
