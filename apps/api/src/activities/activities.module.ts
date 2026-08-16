import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TicketAlertsService } from './ticket-alerts.service.js';
import { ActivityTeamService } from './activity-team.service.js';
import { ActivityTeamController, ActivityReassignController } from './activity-team.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [ActivityTeamController, ActivityReassignController, ActivitiesController],
  providers: [ActivityTeamService, ActivitiesService, TicketAlertsService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
