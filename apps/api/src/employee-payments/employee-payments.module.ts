import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeePaymentsController } from './employee-payments.controller.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AccountingModule, AuditModule, AuthModule],
  controllers: [EmployeePaymentsController],
  providers: [EmployeePaymentsService],
})
export class EmployeePaymentsModule {}
