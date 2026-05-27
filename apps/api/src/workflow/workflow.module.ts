import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';
import { AutoApprovalService } from './auto-approval.service.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [WorkflowService, AutoApprovalService],
  controllers: [WorkflowController],
  exports: [WorkflowService, AutoApprovalService],
})
export class WorkflowModule {}
