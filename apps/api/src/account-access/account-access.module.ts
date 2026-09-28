import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { AccountAccessController } from './account-access.controller.js';
import { AccountAccessService } from './account-access.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, UsersModule],
  controllers: [AccountAccessController],
  providers: [AccountAccessService, RbacGuard],
})
export class AccountAccessModule {}
