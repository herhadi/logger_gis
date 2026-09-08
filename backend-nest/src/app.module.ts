import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { MarkerModule } from './marker/marker.module';

@Module({
  imports: [DatabaseModule, MarkerModule],
  controllers: [HealthController]
})
export class AppModule {}
