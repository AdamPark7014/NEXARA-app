import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { ActivitySessionsService } from './activity-sessions.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [ActivitySessionsService],
  exports: [ActivitySessionsService],
})
export class ActivitySessionsModule {}
