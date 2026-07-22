import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { MaintenanceContractsModule } from '../../maintenance-contracts/maintenance-contracts.module.js';
import { VehiclesModule } from '../../vehicles/vehicles.module.js';
import { WebhooksModule } from '../../webhooks/webhooks.module.js';
import { CronService } from './cron.service.js';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MaintenanceContractsModule,
    VehiclesModule,
    WebhooksModule,
  ],
  providers: [CronService],
})
export class CronModule {}
