import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
