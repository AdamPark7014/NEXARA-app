import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule as RealtimeNotificationsModule } from '../notifications.module.js';
import { NotificationsModule as DomainNotificationsModule } from '../notifications/notifications.module.js';
import { TicketAlertsService } from './ticket-alerts.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    DomainNotificationsModule,
    RealtimeNotificationsModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, TicketAlertsService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
