import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AccountingService } from './accounting.service.js';
import { AccountsController } from './accounts.controller.js';
import { JournalEntriesController } from './journal-entries.controller.js';
import { InvoicesController } from './invoices.controller.js';
import { BankingController } from './banking.controller.js';
import { BudgetsController } from './budgets.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    AccountsController,
    JournalEntriesController,
    InvoicesController,
    BankingController,
    BudgetsController,
  ],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
