import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CrmActivitiesService } from './crm-activities.service.js';
import { CrmActivitiesController } from './crm-activities.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [CrmActivitiesService],
  controllers: [CrmActivitiesController],
  exports: [CrmActivitiesService],
})
export class CrmActivitiesModule {}
