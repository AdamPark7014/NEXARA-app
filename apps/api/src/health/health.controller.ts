import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { InfraHealthIndicator } from './infra.health';

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private infra: InfraHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado general del sistema' })
  check() {
    // Heap threshold alineado con NODE_OPTIONS --max-old-space-size (prod ~2048).
    // 300 MB era demasiado bajo: Integra push + Prisma + PDF empujan V8 >300 y
    // Traefik/monitores marcaban 503 aunque el proceso estuviera sano.
    const heapLimitMb = Number(process.env.HEALTH_HEAP_LIMIT_MB || 1536);
    const heapBytes = Math.max(256, heapLimitMb) * 1024 * 1024;
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', heapBytes),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
      () => this.infra.checkRedis('redis'),
      async () => {
        try {
          return await this.infra.checkGo2rtc('go2rtc');
        } catch (e) {
          // go2rtc down no tumba el health general: se reporta en details
          return (e as any)?.causes || { go2rtc: { status: 'down' } };
        }
      },
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
