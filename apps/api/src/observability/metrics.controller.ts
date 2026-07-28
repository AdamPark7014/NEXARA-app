import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  prometheus(@Res() res: Response) {
    res.send(this.metrics.toPrometheus());
  }

  @Get('json')
  json() {
    return this.metrics.snapshot();
  }
}
