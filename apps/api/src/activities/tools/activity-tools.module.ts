import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { ActivityToolsService } from './activity-tools.service.js';
import { ActivityToolsController } from './activity-tools.controller.js';

/**
 * Checklist de herramientas de la OT. Vive aparte de `ActivitiesModule` para poder
 * inyectarlo en `MeModule` (el candado de «iniciar») sin arrastrar el módulo completo
 * de actividades y sin crear una dependencia circular.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ActivityToolsController],
  providers: [ActivityToolsService],
  exports: [ActivityToolsService],
})
export class ActivityToolsModule {}
