import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { MetricsService } from '../observability/metrics.service.js';
import { errorCorto } from '../common/cron/error-corto.js';
import { clavesDe, fallosCola } from '../pulso/fallos-cola.js';

export type JobPayload = Record<string, unknown>;

export type JobHandler = (payload: JobPayload, attempt: number) => Promise<void>;

export interface EnqueueOptions {
  delayMs?: number;
  maxAttempts?: number;
  jobId?: string;
  /**
   * Con un `jobId` fijo: nunca hay más de uno esperando o corriendo. Al terminar se borra para que el
   * siguiente sí entre; si no, BullMQ lo ignoraría mientras siga guardado entre los terminados.
   */
  unico?: boolean;
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

/** Un trabajo perdido tal como lo ve `GET /jobs/dlq`. Los campos de `MemoryJob` no cambian; `origen` y `claves` se suman. */
export interface DlqItem extends MemoryJob {
  /** `memoria`: lo anotó este proceso (trae su payload). `bullmq`: lo leyó de Redis (sobrevive a un reinicio; sin payload). */
  origen: 'memoria' | 'bullmq';
  /** Solo en los leídos de Redis: nombres de las llaves del payload, nunca sus valores. */
  claves?: string[];
}

/** Estadísticas de una cola de BullMQ. `null` = no se pudo leer (Redis lento o caído), no «cero». */
export interface EstadisticaCola {
  /** Nombre del trabajo (`supplier.ct.sync`). */
  cola: string;
  /** Nombre real de la cola en Redis. */
  nombreRedis: string;
  waiting: number | null;
  active: number | null;
  delayed: number | null;
  failed: number | null;
  /** Workers conectados a esa cola desde cualquier proceso (API o worker aparte). */
  workers: number | null;
  error?: string;
}

export interface EstadisticasColas {
  backend: 'bullmq' | 'memory';
  /** ISO 8601. */
  generadoAt: string;
  colas: EstadisticaCola[];
  redis: {
    usedMemory: number | null;
    maxmemory: number | null;
    /** Con `allkeys-lru` Redis puede tirar llaves de BullMQ en silencio; lo correcto para colas es `noeviction`. */
    maxmemoryPolicy: string | null;
    evictedKeys: number | null;
    /** `used_memory / maxmemory` en porcentaje; `null` si Redis no tiene tope (`maxmemory` 0). */
    usoPct: number | null;
  } | null;
  /** Trabajos perdidos que este proceso tiene anotados (se pierden al reiniciar). */
  fallosEnMemoria: number;
  /** Trabajos esperando en la cola en memoria (sin Redis). */
  pendientesEnMemoria: number;
}

/** Cuánto se espera a Redis por consulta: con `maxRetriesPerRequest: null` un Redis caído haría colgar la petición. */
const ESPERA_REDIS_MS = 3000;
const CACHE_DETALLE_MS = 15_000;
const DLQ_LIMITE_MAX = 500;

function conTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), ms);
  });
  return Promise.race([promesa, limite]).finally(() => {
    if (temporizador) clearTimeout(temporizador);
  });
}

function numeroDeInfo(info: string, campo: string): number | null {
  const m = new RegExp(`^${campo}:(\\d+)\\s*$`, 'm').exec(info);
  return m ? Number(m[1]) : null;
}

function textoDeInfo(info: string, campo: string): string | null {
  const m = new RegExp(`^${campo}:([A-Za-z0-9_-]{1,40})\\s*$`, 'm').exec(info);
  return m ? m[1]! : null;
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
  /** Cuánto se espera a Redis por consulta de lectura (se puede bajar en pruebas). */
  private esperaRedisMs = ESPERA_REDIS_MS;
  private detalleCache: { en: number; valor: EstadisticasColas } | null = null;
  private detalleEnCurso: Promise<EstadisticasColas> | null = null;

  constructor(private readonly metrics: MetricsService) {
    this.redisConfigured = Boolean(process.env.REDIS_URL?.trim());
    // Aquí y no en `onModuleInit`: Nest no promete el orden de arranque entre módulos, y `register` sin
    // conexión guarda el handler sin crear su Worker, sin error. Así se quedó la cola de CT del 22-08 al 02-11-2026.
    this.elegirBackend();
  }

  private elegirBackend() {
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
  }

  onModuleInit() {
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
          // Un trabajo `unico` se borra de Redis al fallar: este rastro es lo único que queda de él (hasta C8).
          this.anotarFallo(name, job.id, job.attemptsMade, err, job.data);
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
        removeOnComplete: opts.unico ? true : 1000,
        removeOnFail: opts.unico ? true : 5000,
      });
      return { id: String(job.id), name, backend: 'bullmq' as const };
    }

    if (opts.unico && opts.jobId && this.pending.some((j) => j.id === opts.jobId)) {
      return { id: opts.jobId, name, backend: 'memory' as const };
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

  /**
   * Trabajos perdidos (agotaron sus intentos), el más reciente primero, hasta `limit`.
   *
   * Junta dos fuentes sin repetir (clave `trabajo:jobId`): lo que este proceso anotó en memoria y lo que BullMQ guarda
   * en Redis para cada cola (`removeOnFail` 5000), que sobrevive a un despliegue. Si un mismo trabajo está en las dos,
   * gana la anotación en memoria (trae su payload). Las anotaciones en memoria son sucesos: un trabajo `unico` que
   * falla dos veces con el mismo `jobId` sale dos veces.
   *
   * Nunca lanza ni se cuelga: cada cola se consulta en paralelo con su propio tiempo límite y la que falle se omite.
   */
  async getDlq(limit = 50): Promise<DlqItem[]> {
    const tope = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), DLQ_LIMITE_MAX);
    const items: DlqItem[] = this.dlq.map((j) => ({ ...j, origen: 'memoria' as const }));
    const vistos = new Set(items.map((j) => `${j.name}:${j.id}`));

    if (this.mode === 'bullmq') {
      const porCola = await Promise.all(
        [...this.queues].map(async ([name, queue]) => {
          try {
            const fallidos = await conTiempo(Promise.resolve(queue.getFailed(0, tope - 1)), this.esperaRedisMs);
            return fallidos.map((job): DlqItem => {
              const intentos = Number(job.attemptsMade) || 0;
              return {
                id: String(job.id),
                name,
                payload: {},
                attempts: intentos,
                maxAttempts: Number(job.opts?.attempts) || 5,
                runAt: job.finishedOn ?? job.processedOn ?? job.timestamp ?? 0,
                lastError: errorCorto(job.failedReason),
                origen: 'bullmq',
                claves: clavesDe(job.data),
              };
            });
          } catch (err) {
            this.logger.debug(`getDlq: no se pudo leer los fallidos de ${name}: ${errorCorto(err)}`);
            return [] as DlqItem[];
          }
        }),
      );
      for (const item of porCola.flat()) {
        const clave = `${item.name}:${item.id}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        items.push(item);
      }
    }

    return items.sort((a, b) => b.runAt - a.runAt).slice(0, tope);
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

  /**
   * Estadísticas por cola desde Redis: cuántos trabajos esperan, corren, están demorados o fallidos; cuántos workers
   * están conectados (de cualquier proceso, así que sirve aunque el worker viva aparte) y cómo va la memoria de Redis.
   * Solo lectura, nunca lanza. Se guarda 15 s para que un tablero que consulta seguido no cargue a Redis; consultas
   * simultáneas comparten la misma lectura. `getStats()` sigue igual (síncrono, lo usa `worker.ts`).
   */
  async getStatsDetallado(): Promise<EstadisticasColas> {
    const ahora = Date.now();
    if (this.detalleCache && ahora - this.detalleCache.en < CACHE_DETALLE_MS) return this.detalleCache.valor;
    if (this.detalleEnCurso) return this.detalleEnCurso;

    const lectura = this.leerEstadisticas()
      .then((valor) => {
        this.detalleCache = { en: Date.now(), valor };
        return valor;
      })
      .finally(() => {
        this.detalleEnCurso = null;
      });
    this.detalleEnCurso = lectura;
    return lectura;
  }

  private async leerEstadisticas(): Promise<EstadisticasColas> {
    const base = {
      backend: this.mode,
      generadoAt: new Date().toISOString(),
      fallosEnMemoria: this.dlq.length,
      pendientesEnMemoria: this.pending.length,
    };
    if (this.mode !== 'bullmq') return { ...base, colas: [], redis: null };

    // Todo en paralelo y cada parte con su propio plazo: con Redis mudo la lectura entera tarda un `esperaRedisMs`,
    // no uno por cola (hay unas 9 colas registradas).
    const entradas = [...this.queues];
    const [colas, redis] = await Promise.all([
      Promise.all(entradas.map(([name, queue]) => this.estadisticaDe(name, queue))),
      this.leerMemoriaRedis(entradas.map(([, queue]) => queue)),
    ]);

    return { ...base, colas, redis };
  }

  /**
   * `INFO` de Redis. Todas las colas hablan con el mismo Redis, así que basta preguntar una vez: se usa la primera cola
   * que dé cliente. Si una cola falla al instante (su conexión está cerrada) se prueba con la siguiente, pero todo el
   * intento comparte UN solo plazo: si se agota, se deja de probar (si no, cada intento colgado se quedaría en la cola
   * de espera de ioredis y se ejecutaría de golpe cuando Redis vuelva). Nunca lanza; `null` = no se pudo leer.
   */
  private async leerMemoriaRedis(colas: Queue[]): Promise<EstadisticasColas['redis']> {
    let vencido = false;
    const intentar = async (): Promise<EstadisticasColas['redis']> => {
      for (const queue of colas) {
        if (vencido) return null;
        try {
          const cliente = await queue.client;
          // Si el plazo ya venció mientras esperábamos el cliente, no se lanza otro comando a un Redis que no contesta.
          if (vencido) return null;
          const info = String(await cliente.info());
          const usedMemory = numeroDeInfo(info, 'used_memory');
          const maxmemory = numeroDeInfo(info, 'maxmemory');
          return {
            usedMemory,
            maxmemory,
            maxmemoryPolicy: textoDeInfo(info, 'maxmemory_policy'),
            evictedKeys: numeroDeInfo(info, 'evicted_keys'),
            usoPct: usedMemory !== null && maxmemory ? Math.round((usedMemory / maxmemory) * 1000) / 10 : null,
          };
        } catch (err) {
          this.logger.debug(`getStatsDetallado: no se pudo leer INFO de Redis: ${errorCorto(err)}`);
        }
      }
      return null;
    };

    try {
      return await conTiempo(intentar(), this.esperaRedisMs);
    } catch (err) {
      vencido = true;
      this.logger.debug(`getStatsDetallado: no se pudo leer INFO de Redis: ${errorCorto(err)}`);
      return null;
    }
  }

  private async estadisticaDe(name: string, queue: Queue): Promise<EstadisticaCola> {
    const fila: EstadisticaCola = {
      cola: name,
      nombreRedis: this.queueName(name),
      waiting: null,
      active: null,
      delayed: null,
      failed: null,
      workers: null,
    };
    const [conteos, workers] = await Promise.allSettled([
      conTiempo(Promise.resolve().then(() => queue.getJobCounts('waiting', 'active', 'delayed', 'failed')), this.esperaRedisMs),
      conTiempo(Promise.resolve().then(() => queue.getWorkers()), this.esperaRedisMs),
    ]);
    if (conteos.status === 'fulfilled') {
      const c = conteos.value ?? {};
      fila.waiting = Number(c.waiting ?? 0);
      fila.active = Number(c.active ?? 0);
      fila.delayed = Number(c.delayed ?? 0);
      fila.failed = Number(c.failed ?? 0);
    } else {
      fila.error = errorCorto(conteos.reason);
    }
    // Sin permiso para `CLIENT LIST` (Redis administrado) o sin respuesta: se queda en `null`, no en cero.
    if (workers.status === 'fulfilled' && Array.isArray(workers.value)) fila.workers = workers.value.length;
    return fila;
  }

  /** Deja el rastro seguro del trabajo perdido (error saneado, solo nombres de llaves). Nunca lanza. */
  private anotarFallo(name: string, jobId: string | number | null | undefined, intentos: number, error: unknown, payload: unknown) {
    try {
      fallosCola.registrar({ cola: name, jobId, intentos, error, claves: clavesDe(payload) });
    } catch {
      // Anotar nunca debe romper a la cola.
    }
  }

  private queueName(name: string) {
    // BullMQ rejects ":" in queue names; keep a stable prefix without colons.
    return `nexara-${String(name).replace(/:/g, '-')}`;
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
      this.anotarFallo(job.name, job.id, job.attempts, 'NO_HANDLER', job.payload);
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
        this.anotarFallo(job.name, job.id, job.attempts, err, job.payload);
      } else {
        const backoff = Math.min(60_000, 1000 * 2 ** job.attempts);
        job.runAt = Date.now() + backoff;
        this.pending.push(job);
      }
    }
  }
}
