import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { QualityService } from './quality.service.js';
import { InspectionsController } from './inspections.controller.js';
import { NcrController } from './ncr.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [QualityService],
  controllers: [InspectionsController, NcrController],
  exports: [QualityService],
})
export class QualityModule {}
