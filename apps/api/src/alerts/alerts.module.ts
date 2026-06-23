import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, NotificationsModule],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
