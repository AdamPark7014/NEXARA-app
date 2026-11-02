const workers: Array<{ cola: string; procesar: (job: unknown) => Promise<void> }> = [];
const agregados: Array<{ cola: string; nombre: string; opciones: Record<string, unknown> }> = [];

jest.mock('bullmq', () => ({
  Queue: class {
    constructor(private readonly cola: string) {}
    async add(nombre: string, _datos: unknown, opciones: Record<string, unknown>) {
      agregados.push({ cola: this.cola, nombre, opciones });
      return { id: opciones.jobId ?? '1' };
    }
    async close() {}
  },
  Worker: class {
    constructor(cola: string, procesar: (job: unknown) => Promise<void>) {
      workers.push({ cola, procesar });
    }
    on() {}
    async close() {}
  },
}));

import { JobQueueService } from './job-queue.service';

const metricas = { inc: jest.fn(), setGauge: jest.fn(), observe: jest.fn() };
const crear = () => new JobQueueService(metricas as never);

describe('JobQueueService', () => {
  const redisAntes = process.env.REDIS_URL;
  const workersAntes = process.env.JOBS_RUN_WORKERS;

  beforeEach(() => {
    workers.length = 0;
    agregados.length = 0;
    process.env.REDIS_URL = 'redis://redis:6379';
    delete process.env.JOBS_RUN_WORKERS;
  });

  afterAll(() => {
    if (redisAntes === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = redisAntes;
    if (workersAntes === undefined) delete process.env.JOBS_RUN_WORKERS;
    else process.env.JOBS_RUN_WORKERS = workersAntes;
  });

  it('crea el Worker aunque el módulo registre antes de que corra su onModuleInit', async () => {
    const cola = crear();

    cola.register('supplier.ct.sync', async () => {});

    expect(workers.map((w) => w.cola)).toEqual(['nexara-supplier.ct.sync']);
    expect(cola.getStats()).toMatchObject({ backend: 'bullmq', workers: 1 });
    await cola.onModuleDestroy();
  });

  it('también lo crea si registra después', async () => {
    const cola = crear();
    cola.onModuleInit();

    cola.register('email.send', async () => {});

    expect(workers).toHaveLength(1);
    await cola.onModuleDestroy();
  });

  it('con JOBS_RUN_WORKERS=0 este proceso solo encola', async () => {
    process.env.JOBS_RUN_WORKERS = '0';
    const cola = crear();

    cola.register('email.send', async () => {});

    expect(workers).toHaveLength(0);
    await cola.onModuleDestroy();
  });

  it('`unico` no deja guardado el trabajo terminado, para que el siguiente sí entre', async () => {
    const cola = crear();

    await cola.enqueue('supplier.ct.sync', {}, { jobId: 'ct-sync-PRIMARY', unico: true, maxAttempts: 1 });
    await cola.enqueue('email.send', {});

    expect(agregados[0]!.opciones).toMatchObject({ jobId: 'ct-sync-PRIMARY', attempts: 1, removeOnComplete: true, removeOnFail: true });
    expect(agregados[1]!.opciones).toMatchObject({ attempts: 5, removeOnComplete: 1000, removeOnFail: 5000 });
    await cola.onModuleDestroy();
  });

  describe('sin Redis', () => {
    beforeEach(() => {
      delete process.env.REDIS_URL;
    });

    it('`unico` tampoco repite mientras siga esperando', async () => {
      const cola = crear();

      await cola.enqueue('supplier.ct.sync', {}, { jobId: 'ct-sync-PRIMARY', unico: true });
      await cola.enqueue('supplier.ct.sync', {}, { jobId: 'ct-sync-PRIMARY', unico: true });

      expect(cola.getStats()).toMatchObject({ backend: 'memory', pending: 1 });
      await cola.onModuleDestroy();
    });
  });
});
