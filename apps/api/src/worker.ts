/**
 * Dedicated BullMQ worker process.
 *
 * Usage:
 *   JOBS_RUN_WORKERS=1 REDIS_URL=redis://... npm run start:worker -w api
 *
 * Pair with API process using JOBS_RUN_WORKERS=0 so only this process consumes.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { JobQueueService } from './jobs/job-queue.service.js';

async function bootstrap() {
  process.env.JOBS_RUN_WORKERS = process.env.JOBS_RUN_WORKERS || '1';
  const logger = new Logger('Worker');

  if (!process.env.REDIS_URL?.trim()) {
    logger.error('REDIS_URL is required for the dedicated worker');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const queue = app.get(JobQueueService);
  const stats = queue.getStats();
  logger.log(
    `NEXARA jobs worker online · backend=${stats.backend} · handlers=${stats.handlers.join(',') || '(none yet)'} · workers=${stats.workers}`,
  );

  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal}, shutting down worker…`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
