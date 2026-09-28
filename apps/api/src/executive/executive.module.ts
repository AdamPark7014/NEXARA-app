import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ModulePolicyModule } from '../common/tenant/module-policy.module.js';
import { ExecutiveService } from './executive.service.js';
import { ExecutiveController } from './executive.controller.js';
import { CeoBriefService } from './ceo-brief.service.js';
import { CeoBriefCronService } from './ceo-brief.cron.js';

@Module({
  imports: [PrismaModule, AuthModule, WorkflowModule, NotificationsModule, ModulePolicyModule],
  providers: [ExecutiveService, CeoBriefService, CeoBriefCronService],
  controllers: [ExecutiveController],
})
export class ExecutiveModule {}
