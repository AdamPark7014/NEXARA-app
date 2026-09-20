import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OvertimeApprovalsService } from './overtime-approvals.service.js';
import { OvertimeApprovalsController } from './overtime-approvals.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OvertimeApprovalsController],
  providers: [OvertimeApprovalsService],
  exports: [OvertimeApprovalsService],
})
export class OvertimeModule {}
