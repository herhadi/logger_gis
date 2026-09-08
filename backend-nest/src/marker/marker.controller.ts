import { Controller, Get, Query } from '@nestjs/common';
import { MarkerService } from './marker.service';

@Controller('api/marker')
export class MarkerController {
  constructor(private readonly markerService: MarkerService) {}

  @Get()
  findAll(@Query('bbox') bbox?: string) {
    return this.markerService.findAll(bbox);
  }
}
