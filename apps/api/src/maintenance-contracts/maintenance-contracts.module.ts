import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MaintenanceContractsService } from './maintenance-contracts.service.js';
import { MaintenanceContractsController } from './maintenance-contracts.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [MaintenanceContractsService],
  controllers: [MaintenanceContractsController],
  exports: [MaintenanceContractsService],
})
export class MaintenanceContractsModule {}
