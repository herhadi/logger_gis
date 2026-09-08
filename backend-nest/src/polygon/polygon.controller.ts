import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PolygonService } from './polygon.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller()
export class PolygonController {
  constructor(private readonly polygonService: PolygonService) {}
  @Get('api/polygon') findAll(@Query('bbox') bbox?: string, @Query('zoom') zoom?: string) { return this.polygonService.findAll(bbox, zoom); }
  @Post('api/selection/stats') selectionStats(@Body() body: any) { return this.polygonService.selectionStats(body); }

  @Get('api/polygon/:id')
  @UseGuards(SessionAuthGuard)
  findOne(@Param('id') id: string) { return this.polygonService.findOne(id); }

  @Post('api/polygon/create')
  @UseGuards(SessionAuthGuard)
  create(@Body() body: any) { return this.polygonService.create(body); }

  @Put('api/polygon/update/:id')
  @UseGuards(SessionAuthGuard)
  update(@Param('id') id: string, @Body() body: any) { return this.polygonService.update(id, body); }

  @Delete('api/polygon/delete/:id')
  @UseGuards(SessionAuthGuard)
  remove(@Param('id') id: string) { return this.polygonService.remove(id); }
}
