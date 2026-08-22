import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { CtFtpConnector } from './connectors/ct-ftp.connector.js';
import { CtCatalogSyncService } from './sync/ct-catalog-sync.service.js';
import { ProductSearchService } from './search/product-search.service.js';
import { LaborCatalogService } from './labor/labor-catalog.service.js';
import { CommercialRulesService } from './rules/commercial-rules.service.js';
import { SolutionConfiguratorService } from './configurator/solution-configurator.service.js';
import { QuoteVersionService } from './versioning/quote-version.service.js';
import { QuoteCopilotService } from './ai/quote-copilot.service.js';
import { SmartQuoteController } from './smart-quote.controller.js';
import { CtPurchaseOrderService } from './orders/ct-purchase-order.service.js';
import { SupplierAnalyticsService } from './analytics/supplier-analytics.service.js';
import { CtOnlineApiConnector } from './connectors/ct-online-api.connector.js';
import { SmartQuoteCronService } from './smart-quote.cron.js';

@Injectable()
class SmartQuoteJobHandlers implements OnModuleInit {
  private readonly logger = new Logger(SmartQuoteJobHandlers.name);

  constructor(
    private readonly queue: JobQueueService,
    private readonly sync: CtCatalogSyncService,
  ) {}

  onModuleInit() {
    this.queue.register('supplier.ct.sync', async (payload) => {
      const source = payload.source === 'FULL' ? 'FULL' : 'PRIMARY';
      const companyId = payload.companyId != null ? Number(payload.companyId) : null;
      const result = await this.sync.sync({ source, companyId });
      this.logger.log(`supplier.ct.sync → ${result.status} rows=${result.rowsUpserted}`);
      if (result.status === 'ERROR') {
        throw new Error(result.error || 'CT sync failed');
      }
    });
  }
}

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SmartQuoteController],
  providers: [
    CtFtpConnector,
    CtCatalogSyncService,
    ProductSearchService,
    LaborCatalogService,
    CommercialRulesService,
    SolutionConfiguratorService,
    QuoteVersionService,
    QuoteCopilotService,
    CtOnlineApiConnector,
    CtPurchaseOrderService,
    SupplierAnalyticsService,
    SmartQuoteJobHandlers,
    SmartQuoteCronService,
  ],
  exports: [
    CtCatalogSyncService,
    ProductSearchService,
    LaborCatalogService,
    CommercialRulesService,
    SolutionConfiguratorService,
    QuoteCopilotService,
    CtPurchaseOrderService,
    SupplierAnalyticsService,
  ],
})
export class SmartQuoteModule {}
