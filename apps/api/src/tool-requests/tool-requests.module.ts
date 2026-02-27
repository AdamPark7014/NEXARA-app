import { Module } from '@nestjs/common';
import { ToolRequestsService } from './tool-requests.service.js';
import { ToolRequestsController } from './tool-requests.controller.js';
import { ToolRequestsCronService } from './tool-requests-cron.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ToolRequestsController],
  providers: [ToolRequestsService, ToolRequestsCronService],
  exports: [ToolRequestsService],
})
export class ToolRequestsModule {}
