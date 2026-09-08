import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MarkerService } from './marker.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller('api/marker')
export class MarkerController {
  constructor(private readonly markerService: MarkerService) {}

  @Get()
  findAll(@Query('bbox') bbox?: string) {
    return this.markerService.findAll(bbox);
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
