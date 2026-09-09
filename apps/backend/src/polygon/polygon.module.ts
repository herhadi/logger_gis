import { Module } from '@nestjs/common';
import { PolygonController } from './polygon.controller';
import { PolygonService } from './polygon.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Module({ controllers: [PolygonController], providers: [PolygonService, SessionAuthGuard] })
export class PolygonModule {}
