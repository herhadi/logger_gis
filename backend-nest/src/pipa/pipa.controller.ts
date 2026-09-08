import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PipaService } from './pipa.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller('api/pipa')
export class PipaController {
  constructor(private readonly pipaService: PipaService) {}

  @Get()
  findAll(@Query('bbox') bbox?: string, @Query('zoom') zoom?: string) {
    return this.pipaService.findAll(bbox, zoom);
  }

  @Get('option')
  options() { return this.pipaService.options(); }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  findOne(@Param('id') id: string) { return this.pipaService.findOne(id); }

  @Post('create')
  @UseGuards(SessionAuthGuard)
  create(@Body() body: Record<string, unknown>) { return this.pipaService.create(body); }

  @Put('update/:id')
  @UseGuards(SessionAuthGuard)
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.pipaService.update(id, body); }

  @Delete('delete/:id')
  @UseGuards(SessionAuthGuard)
  remove(@Param('id') id: string) { return this.pipaService.remove(id); }
}
