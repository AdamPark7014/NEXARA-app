import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiModule } from '../ai/ai.module.js';
import { TiemposActividadService } from './tiempos-actividad.service.js';
import { TicketAlertsService } from './ticket-alerts.service.js';
import { ActivityTimeAlertsService } from './activity-time-alerts.service.js';
import { ActivityOverdueAlertsService } from './activity-overdue-alerts.service.js';
import { RecordatoriosJornadaService } from './recordatorios-jornada.service.js';
import { ActivityNonComplianceService } from './activity-non-compliance.service.js';
import { ActivityLifecycleService } from './activity-lifecycle.service.js';
import { ActivityTeamService } from './activity-team.service.js';
import { ActivityTeamController, ActivityReassignController } from './activity-team.controller.js';
import { ActivityIssuesService } from './activity-issues.service.js';
import { ActivityAttachmentsController } from './attachments/activity-attachments.controller.js';
import { ActivityAttachmentsService } from './attachments/activity-attachments.service.js';
import {
  ActivityIssuesReportController,
  ActivityIncidentsController,
  ActivityRecommendationsController,
} from './activity-issues.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    AiModule,
  ],
  // El orden importa: los controladores con rutas literales van primero para
  // que `activities/reportes/...` no caiga en `activities/:id`.
  controllers: [
    ActivityIssuesReportController,
    ActivityIncidentsController,
    ActivityRecommendationsController,
    ActivityTeamController,
    ActivityReassignController,
    ActivityAttachmentsController,
    ActivitiesController,
  ],
  providers: [
    ActivityTeamService,
    ActivityAttachmentsService,
    ActivityIssuesService,
    ActivitiesService,
    TicketAlertsService,
    ActivityTimeAlertsService,
    ActivityOverdueAlertsService,
    RecordatoriosJornadaService,
    ActivityNonComplianceService,
    ActivityLifecycleService,
    TiemposActividadService,
  ],
  exports: [ActivitiesService, ActivityLifecycleService, ActivityTeamService, TiemposActividadService],
})
export class ActivitiesModule {}
