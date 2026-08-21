import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { CtCatalogSyncService } from './sync/ct-catalog-sync.service.js';

@Injectable()
export class SmartQuoteCronService {
  private readonly logger = new Logger(SmartQuoteCronService.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly sync: CtCatalogSyncService,
  ) {}

  /** JSON CT — cada 15 minutos (stock/precio fresco). */
  @Cron('*/15 * * * *', { name: 'ct-catalog-json-sync' })
  async syncJson() {
    if (process.env.CT_SYNC_ENABLED === '0') return;
    if (!process.env.CT_FTP_USER || !process.env.CT_FTP_PASSWORD) {
      this.logger.debug('CT sync skipped — credentials missing');
      return;
    }
    try {
      await this.jobs.enqueue('supplier.ct.sync', { source: 'PRIMARY' });
    } catch (err) {
      this.logger.warn(`CT JSON enqueue failed: ${(err as Error).message}`);
      // Fallback directo si la cola no está disponible
      await this.sync.sync({ source: 'PRIMARY' });
    }
  }

  /** XML completo — 3× al día (06:00, 14:00, 22:00). */
  @Cron('0 6,14,22 * * *', { name: 'ct-catalog-xml-sync' })
  async syncXml() {
    if (process.env.CT_SYNC_ENABLED === '0') return;
    if (!process.env.CT_FTP_USER || !process.env.CT_FTP_PASSWORD) return;
    try {
      await this.jobs.enqueue('supplier.ct.sync', { source: 'FULL' });
    } catch (err) {
      this.logger.warn(`CT XML enqueue failed: ${(err as Error).message}`);
    }
  }
}
