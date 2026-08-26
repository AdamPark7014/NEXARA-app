import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TicketAlertsService } from './ticket-alerts.service.js';
import { ActivityLifecycleService } from './activity-lifecycle.service.js';
import { ActivityTeamService } from './activity-team.service.js';
import { ActivityTeamController, ActivityReassignController } from './activity-team.controller.js';
import { ActivityIssuesService } from './activity-issues.service.js';
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
  ],
  // El orden importa: los controladores con rutas literales van primero para
  // que `activities/reportes/...` no caiga en `activities/:id`.
  controllers: [
    ActivityIssuesReportController,
    ActivityIncidentsController,
    ActivityRecommendationsController,
    ActivityTeamController,
    ActivityReassignController,
    ActivitiesController,
  ],
  providers: [
    ActivityTeamService,
    ActivityIssuesService,
    ActivitiesService,
    TicketAlertsService,
    ActivityLifecycleService,
  ],
  exports: [ActivitiesService, ActivityLifecycleService],
})
export class ActivitiesModule {}
