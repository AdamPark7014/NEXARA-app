import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';

function isPrivateIp(ip: string): boolean {
  const n = (ip || '').replace(/^::ffff:/, '');
  return (
    n === '127.0.0.1' ||
    n === '::1' ||
    n.startsWith('10.') ||
    n.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(n)
  );
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  private assertPrometheusAccess(req: Request) {
    const token = (process.env['METRICS_SCRAPE_TOKEN'] || '').trim();
    if (token) {
      const auth = req.headers['authorization'];
      const bearer =
        typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')
          ? auth.slice(7).trim()
          : '';
      const headerToken =
        typeof req.headers['x-metrics-token'] === 'string'
          ? req.headers['x-metrics-token'].trim()
          : '';
      if (bearer === token || headerToken === token) {
        return;
      }
      throw new UnauthorizedException('Invalid metrics token');
    }
    // Sin token: solo scrapers en red privada (no internet vía Traefik).
    if (!isPrivateIp(req.ip || '')) {
      throw new ForbiddenException('Metrics scrape not allowed from public network');
    }
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  prometheus(@Req() req: Request, @Res() res: Response) {
    this.assertPrometheusAccess(req);
    res.send(this.metrics.toPrometheus());
  }

  @Get('json')
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  json() {
    return this.metrics.snapshot();
  }
}
