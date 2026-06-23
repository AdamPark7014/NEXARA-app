import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MaintenanceService } from './maintenance.service.js';
import { AssetsController } from './assets.controller.js';
import { WorkOrdersController } from './work-orders.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [MaintenanceService],
  controllers: [AssetsController, WorkOrdersController],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
