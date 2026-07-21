import { Module } from '@nestjs/common';
import { ViaticosService } from './viaticos.service.js';
import { ViaticosController } from './viaticos.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    UsersModule,
    NotificationsModule,
    WorkflowModule,
    AccountingModule,
    AuditModule,
  ],
  controllers: [ViaticosController],
  providers: [ViaticosService],
  exports: [ViaticosService],
})
export class ViaticosModule {}

