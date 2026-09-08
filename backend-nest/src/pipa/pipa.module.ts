import { Module } from '@nestjs/common';
import { PipaController } from './pipa.controller';
import { PipaService } from './pipa.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Module({
  controllers: [PipaController],
  providers: [PipaService, SessionAuthGuard]
})
export class PipaModule {}
