import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PulsoController } from './pulso.controller.js';
import { VigilanteTareasService } from './vigilante-tareas.service.js';

/**
 * Pulso: vigilancia de las tareas programadas. Lo importa `HealthModule` (no `app.module.ts`, que es archivo caliente).
 * `MetricsService` viene del `ObservabilityModule`, que es global.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PulsoController],
  providers: [VigilanteTareasService],
  exports: [VigilanteTareasService],
})
export class PulsoModule {}
