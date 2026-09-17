import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CelebrationsService } from './celebrations.service.js';
import { CelebrationsController } from './celebrations.controller.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [CelebrationsService],
  controllers: [CelebrationsController],
  exports: [CelebrationsService],
})
export class CelebrationsModule {}
