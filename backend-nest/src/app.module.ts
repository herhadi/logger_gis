import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { MarkerModule } from './marker/marker.module';
import { AuthModule } from './auth/auth.module';
import { PolygonModule } from './polygon/polygon.module';

@Module({
  imports: [DatabaseModule, MarkerModule, AuthModule, PolygonModule],
  controllers: [HealthController]
})
export class AppModule {}
