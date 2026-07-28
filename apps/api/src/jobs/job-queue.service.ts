import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { MetricsService } from '../observability/metrics.service.js';

export type JobPayload = Record<string, unknown>;

export type JobHandler = (payload: JobPayload, attempt: number) => Promise<void>;

export interface EnqueueOptions {
  delayMs?: number;
  maxAttempts?: number;
  jobId?: string;
}

interface MemoryJob {
  id: string;
  name: string;
  payload: JobPayload;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  lastError?: string;
}

/**
 * Job queue: BullMQ + Redis when REDIS_URL is set; otherwise in-process fallback.
 */
@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly pending: MemoryJob[] = [];
  private readonly dlq: MemoryJob[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private seq = 0;
  readonly redisConfigured: boolean;
  private connection: ConnectionOptions | null = null;
  private queues = new Map<string, Queue>();
  private workers: Worker[] = [];
  private mode: 'bullmq' | 'memory' = 'memory';

  constructor(private readonly metrics: MetricsService) {
    this.redisConfigured = Boolean(process.env.REDIS_URL?.trim());
  }

  onModuleInit() {
    if (this.redisConfigured) {
      try {
        const url = new URL(process.env.REDIS_URL!);
        this.connection = {
          host: url.hostname || '127.0.0.1',
          port: Number(url.port || 6379),
          password: url.password || undefined,
          username: url.username || undefined,
          maxRetriesPerRequest: null,
        };
        this.mode = 'bullmq';
        this.logger.log(`BullMQ enabled → ${url.hostname}:${url.port || 6379}`);
      } catch (err) {
        this.logger.error(`Invalid REDIS_URL, falling back to memory: ${(err as Error).message}`);
        this.mode = 'memory';
      }
    } else {
      this.logger.warn('REDIS_URL missing — using in-process queue (single-instance only)');
    }

    if (this.mode === 'memory') {
      this.timer = setInterval(() => void this.tickMemory(), 1000);
    }

    this.metrics.setGauge('jobs_redis_configured', this.mode === 'bullmq' ? 1 : 0);
    this.metrics.setGauge('jobs_backend_bullmq', this.mode === 'bullmq' ? 1 : 0);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }

  /** When false, API process only enqueues; a dedicated worker consumes. */
  private get runWorkers(): boolean {
    const raw = (process.env.JOBS_RUN_WORKERS ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
    if (this.mode === 'bullmq' && this.connection) {
      this.ensureQueue(name);
      if (!this.runWorkers) {
        this.logger.debug(`Queue ${name} ready (workers disabled in this process)`);
        return;
      }
      const worker = new Worker(
        this.queueName(name),
        async (job: Job) => {
          const attempt = job.attemptsMade + 1;
          const t0 = Date.now();
          try {
            await handler((job.data || {}) as JobPayload, attempt);
            this.metrics.inc('jobs_completed_total', 1, { name, backend: 'bullmq' });
            this.metrics.observe('jobs_duration_ms', Date.now() - t0, { name });
          } catch (err) {
            this.metrics.inc('jobs_failed_total', 1, { name, backend: 'bullmq' });
            throw err;
          }
        },
        {
          connection: this.connection,
          concurrency: Number(process.env.JOB_CONCURRENCY || 5),
        },
      );
      worker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= (job.opts.attempts || 5)) {
          this.dlq.push({
            id: String(job.id),
            name,
            payload: (job.data || {}) as JobPayload,
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts || 5,
            runAt: Date.now(),
            lastError: err?.message || String(err),
          });
          this.metrics.inc('jobs_dlq_total', 1, { name, backend: 'bullmq' });
          this.metrics.setGauge('jobs_dlq', this.dlq.length);
        }
      });
      this.workers.push(worker);
    }
  }

  async enqueue(name: string, payload: JobPayload = {}, opts: EnqueueOptions = {}) {
    this.metrics.inc('jobs_enqueued_total', 1, { name, backend: this.mode });

    if (this.mode === 'bullmq' && this.connection) {
      if (!this.handlers.has(name)) {
        this.logger.warn(`Enqueue for unregistered job ${name} — ensuring queue`);
      }
      const queue = this.ensureQueue(name);
      const job = await queue.add(name, payload, {
        jobId: opts.jobId,
        delay: opts.delayMs,
        attempts: opts.maxAttempts ?? 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return { id: String(job.id), name, backend: 'bullmq' as const };
    }

    const job: MemoryJob = {
      id: opts.jobId || `${name}-${Date.now()}-${++this.seq}`,
      name,
      payload,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 5,
      runAt: Date.now() + (opts.delayMs ?? 0),
    };
    this.pending.push(job);
    this.metrics.setGauge('jobs_pending', this.pending.length);
    return { id: job.id, name, backend: 'memory' as const };
  }

  getDlq(limit = 50) {
    return this.dlq.slice(-limit);
  }

  getStats() {
    return {
      backend: this.mode,
      pending: this.pending.length,
      dlq: this.dlq.length,
      handlers: [...this.handlers.keys()],
      redisConfigured: this.redisConfigured,
      workers: this.workers.length,
      runWorkers: this.runWorkers,
    };
  }

  private queueName(name: string) {
    return `nexara:${name}`;
  }

  private ensureQueue(name: string) {
    let queue = this.queues.get(name);
    if (!queue && this.connection) {
      queue = new Queue(this.queueName(name), { connection: this.connection });
      this.queues.set(name, queue);
    }
    if (!queue) throw new Error('Queue unavailable');
    return queue;
  }

  private async tickMemory() {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const due = this.pending.filter((j) => j.runAt <= now).slice(0, 10);
      for (const job of due) {
        const idx = this.pending.indexOf(job);
        if (idx >= 0) this.pending.splice(idx, 1);
        await this.executeMemory(job);
      }
      this.metrics.setGauge('jobs_pending', this.pending.length);
      this.metrics.setGauge('jobs_dlq', this.dlq.length);
    } finally {
      this.running = false;
    }
  }

  private async executeMemory(job: MemoryJob) {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      this.logger.error(`No handler for job ${job.name}`);
      this.dlq.push({ ...job, lastError: 'NO_HANDLER' });
      this.metrics.inc('jobs_dlq_total', 1, { name: job.name });
      return;
    }
    job.attempts += 1;
    const t0 = Date.now();
    try {
      await handler(job.payload, job.attempts);
      this.metrics.inc('jobs_completed_total', 1, { name: job.name, backend: 'memory' });
      this.metrics.observe('jobs_duration_ms', Date.now() - t0, { name: job.name });
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.warn(`Job ${job.name} attempt ${job.attempts} failed: ${message}`);
      this.metrics.inc('jobs_failed_total', 1, { name: job.name });
      if (job.attempts >= job.maxAttempts) {
        this.dlq.push({ ...job, lastError: message });
        this.metrics.inc('jobs_dlq_total', 1, { name: job.name });
      } else {
        const backoff = Math.min(60_000, 1000 * 2 ** job.attempts);
        job.runAt = Date.now() + backoff;
        this.pending.push(job);
      }
    }
  }
}
