import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeePaymentsController } from './employee-payments.controller.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { ControlNominaController } from './control-nomina.controller.js';
import { ControlNominaService } from './control-nomina.service.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeModule } from '../me/me.module.js';
import { ExcelModule } from '../common/excel.module.js';
import { ModulePolicyModule } from '../common/tenant/module-policy.module.js';

@Module({
  imports: [PrismaModule, AccountingModule, AuditModule, AuthModule, MeModule, ExcelModule, ModulePolicyModule],
  // El control semanal va primero: sus rutas (`control-semanal/...`) no deben caer en las
  // genéricas de pagos (`:id`, `:id/pagado`).
  controllers: [ControlNominaController, EmployeePaymentsController],
  providers: [EmployeePaymentsService, ControlNominaService],
})
export class EmployeePaymentsModule {}
