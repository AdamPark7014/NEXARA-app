import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { CtCatalogSyncService } from './sync/ct-catalog-sync.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';

/** La siguiente corrida ya la trae el cron: nada se acumula si la cola se atora, y no se reintenta. */
const unaEnCola = (source: 'PRIMARY' | 'FULL') => ({ jobId: `ct-sync-${source}`, unico: true, maxAttempts: 1 });

@Injectable()
export class SmartQuoteCronService {
  private readonly logger = new Logger(SmartQuoteCronService.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly sync: CtCatalogSyncService,
  ) {}

  @Cron('*/15 * * * *', { name: 'ct-catalog-json-sync' })
  async cronSyncJson() {
    await runScheduledJob('ct-catalog-json-sync', this.logger, () => this.syncJson());
  }

  /** JSON CT — cada 15 minutos (stock/precio fresco). */
  async syncJson() {
    if (process.env.CT_SYNC_ENABLED === '0') return;
    if (!process.env.CT_FTP_USER || !process.env.CT_FTP_PASSWORD) {
      this.logger.debug('CT sync skipped — credentials missing');
      return;
    }
    try {
      await this.jobs.enqueue('supplier.ct.sync', { source: 'PRIMARY' }, unaEnCola('PRIMARY'));
    } catch (err) {
      this.logger.warn(`CT JSON enqueue failed: ${(err as Error).message}`);
      // Fallback directo si la cola no está disponible
      await this.sync.sync({ source: 'PRIMARY' });
    }
  }

  /** El horario es UTC (el contenedor corre en UTC): 00:00, 08:00 y 16:00 en la Ciudad de México. */
  @Cron('0 6,14,22 * * *', { name: 'ct-catalog-xml-sync' })
  async cronSyncXml() {
    await runScheduledJob('ct-catalog-xml-sync', this.logger, () => this.syncXml());
  }

  /** XML completo — 3× al día (06:00, 14:00 y 22:00 UTC). */
  async syncXml() {
    if (process.env.CT_SYNC_ENABLED === '0') return;
    if (!process.env.CT_FTP_USER || !process.env.CT_FTP_PASSWORD) return;
    try {
      await this.jobs.enqueue('supplier.ct.sync', { source: 'FULL' }, unaEnCola('FULL'));
    } catch (err) {
      this.logger.warn(`CT XML enqueue failed: ${(err as Error).message}`);
      // Sin respaldo directo: si no se pudo encolar, la tarea falló (el latido debe decirlo).
      throw err;
    }
  }
}
