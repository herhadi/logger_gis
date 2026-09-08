import { Module } from '@nestjs/common';
import { PolygonController } from './polygon.controller';
import { PolygonService } from './polygon.service';

@Module({ controllers: [PolygonController], providers: [PolygonService] })
export class PolygonModule {}
