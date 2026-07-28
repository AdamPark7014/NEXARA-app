# ADR-0015: Dual job backend (BullMQ + memory fallback)

## Status
Accepted — 2026-07-25

## Context
Webhooks, email and CFDI need durable retry/DLQ. In-memory queues break under multi-instance deploy.

## Decision
- If `REDIS_URL` is set → BullMQ queues/workers (`nexara:<jobName>`).
- Else → in-process queue with exponential backoff (dev / single node).
- Handlers register once via `JobQueueService.register`.
- Metrics expose backend mode (`jobs_backend_bullmq`).

## Consequences
Compose includes Redis. Production must set REDIS_URL. Workers share the API process for now; split to dedicated worker process when throughput requires it.
