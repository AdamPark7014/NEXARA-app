import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationHierarchyService } from './notification-hierarchy.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, DevicesModule],
  providers: [NotificationsService, NotificationHierarchyService],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationHierarchyService], // Export so other modules can use it
})
export class NotificationsModule {}
