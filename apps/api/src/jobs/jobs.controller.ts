import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JobQueueService } from './job-queue.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('jobs')
@UseGuards(RbacGuard)
export class JobsController {
  constructor(private readonly queue: JobQueueService) {}

  @Get('stats')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  stats() {
    return this.queue.getStats();
  }

  /** Por cola: esperando, activos, demorados, fallidos, workers conectados, y la memoria de Redis. Solo lectura. */
  @Get('stats/detalle')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  statsDetalle() {
    return this.queue.getStatsDetallado();
  }

  /** Trabajos perdidos: los que este proceso anotó y los que BullMQ guarda en Redis (sobreviven a un reinicio). */
  @Get('dlq')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async dlq() {
    return { items: await this.queue.getDlq() };
  }

  @Post('enqueue')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  enqueue(@Body() body: { name: string; payload?: Record<string, unknown>; delayMs?: number }) {
    return this.queue.enqueue(body.name, body.payload || {}, { delayMs: body.delayMs });
  }
}
