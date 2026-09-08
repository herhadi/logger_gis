import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PolygonService } from './polygon.service';

@Controller()
export class PolygonController {
  constructor(private readonly polygonService: PolygonService) {}
  @Get('api/polygon') findAll(@Query('bbox') bbox?: string, @Query('zoom') zoom?: string) { return this.polygonService.findAll(bbox, zoom); }
  @Post('api/selection/stats') selectionStats(@Body() body: any) { return this.polygonService.selectionStats(body); }
}
