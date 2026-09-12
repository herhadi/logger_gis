import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { MarkerService } from './marker.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller('api/marker')
export class MarkerController {
  constructor(private readonly markerService: MarkerService) {}

  @Get()
  findAll(@Query('bbox') bbox?: string) {
    return this.markerService.findAll(bbox);
  }

  @Get('tiles/:z/:x/:y.pbf')
  async tile(@Param('z') z: string, @Param('x') x: string, @Param('y') y: string, @Res() response: Response) {
    const tile = await this.markerService.tile(z, x, y);
    response.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
    response.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
    return response.send(tile);
  }

  @Get(':tipe/:id')
  @UseGuards(SessionAuthGuard)
  findOne(@Param('tipe') tipe: string, @Param('id') id: string) {
    return this.markerService.findOne(tipe, id);
  }

  @Post('create')
  @UseGuards(SessionAuthGuard)
  create(@Body() body: Record<string, unknown>) {
    return this.markerService.create(body);
  }

  @Put('update/:tipe/:id')
  @UseGuards(SessionAuthGuard)
  update(@Param('tipe') tipe: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.markerService.update(tipe, id, body);
  }

  @Delete('delete/:tipe/:id')
  @UseGuards(SessionAuthGuard)
  remove(@Param('tipe') tipe: string, @Param('id') id: string) {
    return this.markerService.remove(tipe, id);
  }
}
