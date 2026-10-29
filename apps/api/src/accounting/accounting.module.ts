import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AuditModule } from '../audit/audit.module.js';
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

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, WebhooksModule, AuditModule],
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
  ],
  exports: [AccountingService, VendorProjectFinanceService],
})
export class AccountingModule {}
