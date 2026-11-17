import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { SupervisionController } from './supervision.controller.js';
import { SupervisionService } from './supervision.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule, ActivitiesModule],
  controllers: [SupervisionController],
  providers: [SupervisionService],
  exports: [SupervisionService],
})
export class SupervisionModule {}