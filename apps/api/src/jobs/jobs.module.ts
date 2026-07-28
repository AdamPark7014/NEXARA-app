import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { JobQueueService } from './job-queue.service.js';
import { JobsController } from './jobs.controller.js';
import { ObservabilityModule } from '../observability/observability.module.js';

@Injectable()
class CoreJobHandlers implements OnModuleInit {
  private readonly logger = new Logger(CoreJobHandlers.name);

  constructor(private readonly queue: JobQueueService) {}

  onModuleInit() {
    this.queue.register('webhook.deliver', async (payload, attempt) => {
      const url = String(payload.url || '');
      const body = payload.body ?? {};
      const headers = (payload.headers as Record<string, string>) || {};
      if (!url) throw new Error('webhook.deliver missing url');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status} (attempt ${attempt})`);
      }
      this.logger.debug(`Delivered webhook to ${url}`);
    });

    this.queue.register('email.send', async (payload) => {
      // Handled by EmailModule consumers; this is a durable placeholder that validates shape.
      if (!payload.to || !payload.subject) throw new Error('email.send requires to+subject');
      this.logger.log(`email.send queued → ${payload.to}`);
    });

    this.queue.register('cfdi.dispatch', async (payload) => {
      if (!payload.invoiceId) throw new Error('cfdi.dispatch requires invoiceId');
      this.logger.log(`cfdi.dispatch queued → invoice ${payload.invoiceId}`);
    });
  }
}

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [JobQueueService, CoreJobHandlers],
  controllers: [JobsController],
  exports: [JobQueueService],
})
export class JobsModule {}
