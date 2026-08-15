import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceClientsModule } from '../service-clients/service-clients.module.js';
import { ServiceSheetsController } from './service-sheets.controller.js';
import { ServiceSheetsService } from './service-sheets.service.js';
import { ActivityLifecycleService } from '../activities/activity-lifecycle.service.js';

@Module({
  imports: [PrismaModule, AuthModule, ServiceClientsModule],
  controllers: [ServiceSheetsController],
  providers: [ServiceSheetsService, ActivityLifecycleService],
  exports: [ServiceSheetsService],
})
export class ServiceSheetsModule {}
