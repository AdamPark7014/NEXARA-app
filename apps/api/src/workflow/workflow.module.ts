import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';
import { AutoApprovalService } from './auto-approval.service.js';
import { WorkflowSeedService } from './workflow-seed.service.js';
import { WorkflowTimeoutCronService } from './workflow-timeout.cron.js';
import { ApprovalThresholdService } from './approval-thresholds.service.js';
import { ActivitiesModule } from '../activities/activities.module.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, ActivitiesModule],
  providers: [
    WorkflowService,
    AutoApprovalService,
    WorkflowSeedService,
    WorkflowTimeoutCronService,
    ApprovalThresholdService,
  ],
  controllers: [WorkflowController],
  exports: [WorkflowService, AutoApprovalService, WorkflowSeedService, ApprovalThresholdService],
})
export class WorkflowModule {}
