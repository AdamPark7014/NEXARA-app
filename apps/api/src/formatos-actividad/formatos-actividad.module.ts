import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ActivityEvidenceModule } from '../activities/evidence/activity-evidence.module.js';
import { ActivityToolsModule } from '../activities/tools/activity-tools.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { FormatosActividadController } from './formatos-actividad.controller.js';
import { FormatosActividadService } from './formatos-actividad.service.js';

@Module({
  imports: [PrismaModule, UsersModule, NotificationsModule, ActivitiesModule, ActivityEvidenceModule, ActivityToolsModule],
  controllers: [FormatosActividadController],
  providers: [FormatosActividadService],
})
export class FormatosActividadModule {}
