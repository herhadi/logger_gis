import { Module } from '@nestjs/common';
import { MarkerController } from './marker.controller';
import { MarkerService } from './marker.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Module({
  controllers: [MarkerController],
  providers: [MarkerService, SessionAuthGuard]
})
export class MarkerModule {}
