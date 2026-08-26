import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceClientsModule } from '../service-clients/service-clients.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ServiceSheetsController } from './service-sheets.controller.js';
import { ServiceSheetsService } from './service-sheets.service.js';

@Module({
  imports: [PrismaModule, AuthModule, ServiceClientsModule, ActivitiesModule],
  controllers: [ServiceSheetsController],
  providers: [ServiceSheetsService],
  exports: [ServiceSheetsService],
})
export class ServiceSheetsModule {}
