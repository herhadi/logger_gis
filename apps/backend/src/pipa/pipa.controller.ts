import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PipaService } from './pipa.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PipaDto } from './pipa.dto';

@Controller('api/pipa')
export class PipaController {
  constructor(private readonly pipaService: PipaService) {}

  @Get()
  findAll(@Query('bbox') bbox?: string, @Query('zoom') zoom?: string) {
    return this.pipaService.findAll(bbox, zoom);
  }

  @Get('tiles/:z/:x/:y.pbf')
  async tile(@Param('z') z: string, @Param('x') x: string, @Param('y') y: string, @Res() response: Response) {
    response.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
    response.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
    return response.send(await this.pipaService.tile(z, x, y));
  }

  @Get('option')
  options() { return this.pipaService.options(); }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  findOne(@Param('id') id: string) { return this.pipaService.findOne(id); }

  @Post('create')
  @UseGuards(SessionAuthGuard)
  create(@Body() body: PipaDto) { return this.pipaService.create(body as unknown as Record<string, unknown>); }

  @Put('update/:id')
  @UseGuards(SessionAuthGuard)
  update(@Param('id') id: string, @Body() body: PipaDto) { return this.pipaService.update(id, body as unknown as Record<string, unknown>); }

  @Delete('delete/:id')
  @UseGuards(SessionAuthGuard)
  remove(@Param('id') id: string) { return this.pipaService.remove(id); }
}
