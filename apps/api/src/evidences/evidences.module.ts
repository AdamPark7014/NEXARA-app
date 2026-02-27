import { Module } from '@nestjs/common';
import { EvidencesService } from './evidences.service.js';
import { EvidencesController } from './evidences.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceSheetsModule } from '../service-sheets/service-sheets.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ServiceSheetsModule, NotificationsModule],
  controllers: [EvidencesController],
  providers: [EvidencesService],
  exports: [EvidencesService],
})
export class EvidencesModule {}
