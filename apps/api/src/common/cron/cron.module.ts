import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { MaintenanceContractsModule } from '../../maintenance-contracts/maintenance-contracts.module.js';
import { VehiclesModule } from '../../vehicles/vehicles.module.js';
import { VehiclesService } from '../../vehicles/vehicles.service.js';
import { CronService } from './cron.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule, MaintenanceContractsModule, VehiclesModule],
  providers: [CronService],
})
export class CronModule {}
