import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado general del sistema' })
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness check (base de datos)' })
  readiness() {
    return this.health.check([
      () => this.db.isHealthy('database'),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check (proceso activo)' })
  liveness() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
