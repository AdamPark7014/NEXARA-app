import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AccountingService } from './accounting.service.js';
import { AccountsController } from './accounts.controller.js';
import { JournalEntriesController } from './journal-entries.controller.js';
import { InvoicesController } from './invoices.controller.js';
import { BankingController } from './banking.controller.js';
import { BudgetsController } from './budgets.controller.js';
import { AccountingWorkspaceController } from './workspace.controller.js';
import { WorkspaceArApController } from './workspace-ar-ap.controller.js';
import { WorkspaceArApService } from './workspace-ar-ap.service.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, WebhooksModule],
  controllers: [
    AccountsController,
    JournalEntriesController,
    InvoicesController,
    BankingController,
    BudgetsController,
    AccountingWorkspaceController,
    WorkspaceArApController,
  ],
  providers: [AccountingService, WorkspaceArApService],
  exports: [AccountingService],
})
export class AccountingModule {}
