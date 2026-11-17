import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ModulePolicyModule } from '../common/tenant/module-policy.module.js';
import { PacModule } from '../pac/pac.module.js';
import { AiModule } from '../ai/ai.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { AccountingService } from './accounting.service.js';
import { AccountsController } from './accounts.controller.js';
import { JournalEntriesController } from './journal-entries.controller.js';
import { InvoicesController } from './invoices.controller.js';
import { BankingController } from './banking.controller.js';
import { BudgetsController } from './budgets.controller.js';
import { AccountingWorkspaceController } from './workspace.controller.js';
import { AccountingWorkspaceLedgerController } from './workspace-ledger.controller.js';
import { AccountingWorkspaceLedgerService } from './workspace-ledger.service.js';
import { ReconciliationMatchService } from './reconciliation-match.service.js';
import { ReconciliationMatchController } from './reconciliation-match.controller.js';
import { PeriodCloseController } from './period-close.controller.js';
import { PeriodCloseService } from './period-close.service.js';
import { AccountingWorkspaceReportsController } from './workspace-reports.controller.js';
import { AccountingWorkspaceReportsService } from './workspace-reports.service.js';
import { WorkspaceArApController } from './workspace-ar-ap.controller.js';
import { WorkspaceArApService } from './workspace-ar-ap.service.js';
import { VendorProjectFinanceService } from './vendor-project-finance.service.js';
import { VendorProjectFinanceController } from './vendor-project-finance.controller.js';
import { MesaContableController } from './mesa-contable/mesa-contable.controller.js';
import { PorFacturarService } from './mesa-contable/por-facturar.service.js';
import { PagosGastosService } from './mesa-contable/pagos-gastos.service.js';
import { EstadosFinancierosService } from './mesa-contable/estados-financieros.service.js';
import { RevisionFacturaService } from './mesa-contable/revision-factura.service.js';
import { BuzonSatController } from './buzon-sat/buzon-sat.controller.js';
import { BuzonSatService } from './buzon-sat/buzon-sat.service.js';
import { PolizaPropuestaService } from './buzon-sat/poliza-propuesta.service.js';
import { FacturaIaService } from './buzon-sat/factura-ia.service.js';
import { E2E4ContabilidadService } from './buzon-sat/e2-e4.service.js';
import { EstadoCuentaImportService } from './banco/estado-cuenta-import.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    WebhooksModule,
    AuditModule,
    ModulePolicyModule,
    PacModule,
    AiModule,
    JobsModule,
  ],
  controllers: [
    AccountsController,
    JournalEntriesController,
    InvoicesController,
    BankingController,
    BudgetsController,
    AccountingWorkspaceController,
    AccountingWorkspaceLedgerController,
    ReconciliationMatchController,
    PeriodCloseController,
    AccountingWorkspaceReportsController,
    WorkspaceArApController,
    VendorProjectFinanceController,
    MesaContableController,
    BuzonSatController,
  ],
  providers: [
    AccountingService,
    AccountingWorkspaceLedgerService,
    ReconciliationMatchService,
    PeriodCloseService,
    AccountingWorkspaceReportsService,
    WorkspaceArApService,
    VendorProjectFinanceService,
    PorFacturarService,
    PagosGastosService,
    EstadosFinancierosService,
    RevisionFacturaService,
    BuzonSatService,
    PolizaPropuestaService,
    FacturaIaService,
    E2E4ContabilidadService,
    EstadoCuentaImportService,
  ],
  exports: [AccountingService, VendorProjectFinanceService, BuzonSatService],
})
export class AccountingModule {}
