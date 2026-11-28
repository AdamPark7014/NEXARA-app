type Manejadores = Record<string, (...args: any[]) => void>;

const workers: Array<{ cola: string; procesar: (job: unknown) => Promise<void>; manejadores: Manejadores }> = [];
const agregados: Array<{ cola: string; nombre: string; opciones: Record<string, unknown> }> = [];

/** Lo que Redis «responde» a las colas simuladas. Cada prueba lo ajusta. */
const redis = {
  fallidos: {} as Record<string, unknown[]>,
  conteos: {} as Record<string, Record<string, number>>,
  workers: {} as Record<string, unknown[]>,
  info: 'used_memory:7189136\r\nmaxmemory:268435456\r\nmaxmemory_policy:allkeys-lru\r\nevicted_keys:0\r\n',
  getFailedLanza: false,
  getFailedColgado: false,
  sinGetters: false,
  llamadasConteos: 0,
  llamadasInfo: 0,
};

jest.mock('bullmq', () => ({
  Queue: class {
    getFailed: unknown;
    getJobCounts: unknown;
    getWorkers: unknown;
    constructor(private readonly cola: string) {
      if (redis.sinGetters) {
        // El mock de antes: sin getFailed, getJobCounts ni getWorkers.
        this.getFailed = undefined;
        this.getJobCounts = undefined;
        this.getWorkers = undefined;
      } else {
        this.getFailed = async () => {
          if (redis.getFailedLanza) throw new Error('Connection is closed.');
          if (redis.getFailedColgado) return new Promise(() => {});
          return redis.fallidos[this.cola] ?? [];
        };
        this.getJobCounts = async () => {
          redis.llamadasConteos += 1;
          return redis.conteos[this.cola] ?? { waiting: 0, active: 0, delayed: 0, failed: 0 };
        };
        this.getWorkers = async () => redis.workers[this.cola] ?? [];
      }
    }
    async add(nombre: string, _datos: unknown, opciones: Record<string, unknown>) {
      agregados.push({ cola: this.cola, nombre, opciones });
      return { id: opciones.jobId ?? '1' };
    }
    get client() {
      return Promise.resolve({
        info: async () => {
          redis.llamadasInfo += 1;
          return redis.info;
        },
      });
    }
    async close() {}
  },
  Worker: class {
    constructor(cola: string, procesar: (job: unknown) => Promise<void>) {
      workers.push({ cola, procesar, manejadores: this.manejadores });
    }
    manejadores: Manejadores = {};
    on(evento: string, manejador: (...args: any[]) => void) {
      this.manejadores[evento] = manejador;
    }
    async close() {}
  },
}));

import { JobQueueService } from './job-queue.service';
import { fallosRecientes, reiniciarFallosCola } from '../pulso/fallos-cola';

const metricas = { inc: jest.fn(), setGauge: jest.fn(), observe: jest.fn() };
const crear = () => new JobQueueService(metricas as never);

/** Un trabajo de BullMQ como lo ve el manejador `failed` del worker. */
const trabajo = (extra: Record<string, unknown> = {}) => ({
  id: '7',
  attemptsMade: 5,
  opts: { attempts: 5 },
  data: { correo: 'ana@ejemplo.com', companyId: 'empresa-123' },
  ...extra,
});

/** Un trabajo fallido tal como lo devuelve `queue.getFailed`. */
const fallidoEnRedis = (extra: Record<string, unknown> = {}) => ({
  id: '9',
  attemptsMade: 5,
  opts: { attempts: 5 },
  data: { correo: 'ana@ejemplo.com' },
  failedReason: 'No se pudo enviar a ana@ejemplo.com',
  finishedOn: 5_000,
  timestamp: 1_000,
  ...extra,
});

describe('JobQueueService', () => {
  const redisAntes = process.env.REDIS_URL;
  const workersAntes = process.env.JOBS_RUN_WORKERS;

  beforeEach(() => {
    workers.length = 0;
    agregados.length = 0;
    reiniciarFallosCola();
    redis.fallidos = {};
    redis.conteos = {};
    redis.workers = {};
    redis.info = 'used_memory:7189136\r\nmaxmemory:268435456\r\nmaxmemory_policy:allkeys-lru\r\nevicted_keys:0\r\n';
    redis.getFailedLanza = false;
    redis.getFailedColgado = false;
    redis.sinGetters = false;
    redis.llamadasConteos = 0;
    redis.llamadasInfo = 0;
    process.env.REDIS_URL = 'redis://redis:6379';
    delete process.env.JOBS_RUN_WORKERS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  describe('fallos que se quedan anotados', () => {
    it('un fallo definitivo en BullMQ entra al DLQ y al anillo, con el error saneado y sin valores del payload', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});

      workers[0]!.manejadores.failed!(trabajo(), new Error('No se pudo enviar a ana@ejemplo.com'));

      expect(cola.getStats().dlq).toBe(1);
      const [anotado] = fallosRecientes();
      expect(anotado).toMatchObject({
        cola: 'email.send',
        jobId: '7',
        intentos: 5,
        error: 'No se pudo enviar a [correo]',
        claves: ['correo', 'companyId'],
      });
      expect(JSON.stringify(anotado)).not.toContain('empresa-123');
      expect(JSON.stringify(anotado)).not.toContain('ana@ejemplo.com');
      await cola.onModuleDestroy();
    });

    it('un intento que todavía tiene reintentos no es un fallo definitivo', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});

      workers[0]!.manejadores.failed!(trabajo({ attemptsMade: 2 }), new Error('otra vez'));

      expect(cola.getStats().dlq).toBe(0);
      expect(fallosRecientes()).toEqual([]);
      await cola.onModuleDestroy();
    });

    it('un trabajo `unico` con un solo intento deja rastro aunque BullMQ lo borre al fallar', async () => {
      const cola = crear();
      cola.register('supplier.ct.sync', async () => {});
      await cola.enqueue('supplier.ct.sync', {}, { jobId: 'ct-sync-PRIMARY', unico: true, maxAttempts: 1 });

      workers[0]!.manejadores.failed!(
        trabajo({ id: 'ct-sync-PRIMARY', attemptsMade: 1, opts: { attempts: 1 }, data: {} }),
        new Error('CT respondió 500'),
      );

      expect(fallosRecientes()).toHaveLength(1);
      expect(fallosRecientes()[0]).toMatchObject({ cola: 'supplier.ct.sync', jobId: 'ct-sync-PRIMARY', intentos: 1 });
      // Redis ya no lo tiene (se borró): el DLQ lo sigue mostrando mientras este proceso viva.
      redis.fallidos['nexara-supplier.ct.sync'] = [];
      const items = await cola.getDlq();
      expect(items.map((i) => i.id)).toEqual(['ct-sync-PRIMARY']);
      await cola.onModuleDestroy();
    });

    it('un fallo sin job (BullMQ a veces lo manda así) no rompe nada', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});

      expect(() => workers[0]!.manejadores.failed!(undefined, new Error('x'))).not.toThrow();
      expect(fallosRecientes()).toEqual([]);
      await cola.onModuleDestroy();
    });
  });

  describe('getDlq', () => {
    it('junta lo de memoria y lo que BullMQ guarda en Redis, sin repetir, el más reciente primero', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(10_000);
      const cola = crear();
      cola.register('email.send', async () => {});
      cola.register('webhook.deliver', async () => {});
      // El 7 está en memoria Y en Redis; el 9 y el 11 solo en Redis (los de antes del último despliegue).
      workers[0]!.manejadores.failed!(trabajo({ id: '7' }), new Error('falló aquí'));
      redis.fallidos['nexara-email.send'] = [fallidoEnRedis({ id: '7', finishedOn: 9_000 }), fallidoEnRedis({ id: '9', finishedOn: 5_000 })];
      redis.fallidos['nexara-webhook.deliver'] = [fallidoEnRedis({ id: '11', finishedOn: 7_000, failedReason: 'Webhook HTTP 500' })];

      const items = await cola.getDlq();

      expect(items.map((i) => `${i.name}:${i.id}:${i.origen}`)).toEqual([
        'email.send:7:memoria',
        'webhook.deliver:11:bullmq',
        'email.send:9:bullmq',
      ]);
      await cola.onModuleDestroy();
    });

    it('lo que viene de Redis lleva el error saneado, los intentos y la fecha, y ningún valor del payload', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      redis.fallidos['nexara-email.send'] = [fallidoEnRedis({ attemptsMade: 3, opts: { attempts: 3 }, finishedOn: 5_000 })];

      const [item] = await cola.getDlq();

      expect(item).toEqual({
        id: '9',
        name: 'email.send',
        payload: {},
        attempts: 3,
        maxAttempts: 3,
        runAt: 5_000,
        lastError: 'No se pudo enviar a [correo]',
        origen: 'bullmq',
        claves: ['correo'],
      });
      await cola.onModuleDestroy();
    });

    it('un fallido de Redis sin finishedOn usa processedOn y luego timestamp', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      redis.fallidos['nexara-email.send'] = [
        fallidoEnRedis({ id: 'a', finishedOn: undefined, processedOn: 3_000 }),
        fallidoEnRedis({ id: 'b', finishedOn: undefined, processedOn: undefined, timestamp: 2_000 }),
      ];

      const items = await cola.getDlq();

      expect(items.map((i) => [i.id, i.runAt])).toEqual([['a', 3_000], ['b', 2_000]]);
      await cola.onModuleDestroy();
    });

    it('un trabajo `unico` que falla dos veces con el mismo jobId sale dos veces (son dos sucesos)', async () => {
      const cola = crear();
      cola.register('supplier.ct.sync', async () => {});
      const falla = () =>
        workers[0]!.manejadores.failed!(trabajo({ id: 'ct-sync-PRIMARY', attemptsMade: 1, opts: { attempts: 1 } }), new Error('500'));
      falla();
      falla();

      const items = await cola.getDlq();

      expect(items).toHaveLength(2);
      await cola.onModuleDestroy();
    });

    it('corta a `limit` y no pide a Redis más de lo que necesita', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      const pedidos: Array<[number, number]> = [];
      const queue = (cola as any).queues.get('email.send');
      queue.getFailed = async (a: number, b: number) => {
        pedidos.push([a, b]);
        return [fallidoEnRedis({ id: '1', finishedOn: 3 }), fallidoEnRedis({ id: '2', finishedOn: 2 }), fallidoEnRedis({ id: '3', finishedOn: 1 })];
      };

      const items = await cola.getDlq(2);

      expect(items.map((i) => i.id)).toEqual(['1', '2']);
      expect(pedidos).toEqual([[0, 1]]);
      await cola.onModuleDestroy();
    });

    it('un `limit` raro cae a un valor razonable', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      const pedidos: Array<[number, number]> = [];
      (cola as any).queues.get('email.send').getFailed = async (a: number, b: number) => {
        pedidos.push([a, b]);
        return [];
      };

      await cola.getDlq(Number.NaN);
      await cola.getDlq(-4);
      await cola.getDlq(1_000_000);

      expect(pedidos).toEqual([[0, 49], [0, 0], [0, 499]]);
      await cola.onModuleDestroy();
    });

    it('si getFailed lanza, no rompe: queda lo que hay en memoria', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      workers[0]!.manejadores.failed!(trabajo(), new Error('falló'));
      redis.getFailedLanza = true;

      const items = await cola.getDlq();

      expect(items.map((i) => i.id)).toEqual(['7']);
      await cola.onModuleDestroy();
    });

    it('con el mock de antes (sin getFailed) también se degrada sin lanzar', async () => {
      redis.sinGetters = true;
      const cola = crear();
      cola.register('email.send', async () => {});
      workers[0]!.manejadores.failed!(trabajo(), new Error('falló'));

      await expect(cola.getDlq()).resolves.toHaveLength(1);
      await cola.onModuleDestroy();
    });

    it('si Redis no contesta, no se cuelga: responde con lo de memoria al agotarse el tiempo', async () => {
      const cola = crear();
      (cola as any).esperaRedisMs = 20;
      cola.register('email.send', async () => {});
      workers[0]!.manejadores.failed!(trabajo(), new Error('falló'));
      redis.getFailedColgado = true;

      const items = await cola.getDlq();

      expect(items.map((i) => i.id)).toEqual(['7']);
      await cola.onModuleDestroy();
    });

    it('una cola sana se lee aunque otra falle', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      cola.register('webhook.deliver', async () => {});
      (cola as any).queues.get('email.send').getFailed = async () => {
        throw new Error('Connection is closed.');
      };
      redis.fallidos['nexara-webhook.deliver'] = [fallidoEnRedis({ id: '11', failedReason: 'Webhook HTTP 500' })];

      const items = await cola.getDlq();

      expect(items.map((i) => i.id)).toEqual(['11']);
      await cola.onModuleDestroy();
    });
  });

  describe('getStatsDetallado', () => {
    it('devuelve por cola lo que esperan, corren, están demorados y fallidos, los workers y la memoria de Redis', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      cola.register('supplier.ct.sync', async () => {});
      redis.conteos['nexara-email.send'] = { waiting: 3, active: 1, delayed: 2, failed: 4 };
      redis.workers['nexara-email.send'] = [{}, {}];
      redis.workers['nexara-supplier.ct.sync'] = [{}];

      const r = await cola.getStatsDetallado();

      expect(r.backend).toBe('bullmq');
      expect(r.colas).toEqual([
        { cola: 'email.send', nombreRedis: 'nexara-email.send', waiting: 3, active: 1, delayed: 2, failed: 4, workers: 2 },
        { cola: 'supplier.ct.sync', nombreRedis: 'nexara-supplier.ct.sync', waiting: 0, active: 0, delayed: 0, failed: 0, workers: 1 },
      ]);
      expect(r.redis).toEqual({
        usedMemory: 7189136,
        maxmemory: 268435456,
        maxmemoryPolicy: 'allkeys-lru',
        evictedKeys: 0,
        usoPct: 2.7,
      });
      expect(Date.parse(r.generadoAt)).not.toBeNaN();
      await cola.onModuleDestroy();
    });

    it('Redis sin tope de memoria (maxmemory 0) no da un porcentaje', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      redis.info = 'used_memory:1000\r\nmaxmemory:0\r\nmaxmemory_policy:noeviction\r\nevicted_keys:12\r\n';

      const r = await cola.getStatsDetallado();

      expect(r.redis).toEqual({ usedMemory: 1000, maxmemory: 0, maxmemoryPolicy: 'noeviction', evictedKeys: 12, usoPct: null });
      await cola.onModuleDestroy();
    });

    it('se guarda 15 s: la segunda consulta no vuelve a Redis, y pasado el tiempo sí', async () => {
      let ahora = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => ahora);
      const cola = crear();
      cola.register('email.send', async () => {});

      const primera = await cola.getStatsDetallado();
      ahora += 14_000;
      const segunda = await cola.getStatsDetallado();
      expect(segunda).toBe(primera);
      expect(redis.llamadasConteos).toBe(1);
      expect(redis.llamadasInfo).toBe(1);

      ahora += 2_000;
      await cola.getStatsDetallado();
      expect(redis.llamadasConteos).toBe(2);
      await cola.onModuleDestroy();
    });

    it('consultas a la vez comparten una sola lectura', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});

      const [a, b, c] = await Promise.all([cola.getStatsDetallado(), cola.getStatsDetallado(), cola.getStatsDetallado()]);

      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(redis.llamadasConteos).toBe(1);
      await cola.onModuleDestroy();
    });

    it('si una cola no responde, esa fila queda en null con su error y las demás se leen', async () => {
      const cola = crear();
      (cola as any).esperaRedisMs = 20;
      cola.register('email.send', async () => {});
      cola.register('webhook.deliver', async () => {});
      (cola as any).queues.get('email.send').getJobCounts = () => new Promise(() => {});

      const r = await cola.getStatsDetallado();

      expect(r.colas[0]).toMatchObject({ cola: 'email.send', waiting: null, failed: null, error: 'Redis no respondió a tiempo' });
      expect(r.colas[1]).toMatchObject({ cola: 'webhook.deliver', waiting: 0, failed: 0 });
      await cola.onModuleDestroy();
    });

    it('con el mock de antes (sin getJobCounts ni getWorkers) devuelve un objeto sin lanzar', async () => {
      redis.sinGetters = true;
      const cola = crear();
      cola.register('email.send', async () => {});

      const r = await cola.getStatsDetallado();

      expect(r.colas).toHaveLength(1);
      expect(r.colas[0]).toMatchObject({ cola: 'email.send', waiting: null, workers: null });
      expect(r.colas[0]!.error).toBeTruthy();
      await cola.onModuleDestroy();
    });

    it('si no se puede leer INFO de Redis, redis queda en null y lo demás sigue', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      Object.defineProperty((cola as any).queues.get('email.send'), 'client', {
        get: () => Promise.reject(new Error('Connection is closed.')),
      });

      const r = await cola.getStatsDetallado();

      expect(r.redis).toBeNull();
      expect(r.colas).toHaveLength(1);
      await cola.onModuleDestroy();
    });

    describe('con Redis mudo (plazo único)', () => {
      afterEach(() => {
        jest.useRealTimers();
      });

      /** Una cola cuyas tres lecturas (conteos, workers y cliente para INFO) nunca contestan. */
      const volverMuda = (queue: any, pedidos: { client: number }) => {
        queue.getJobCounts = () => new Promise(() => {});
        queue.getWorkers = () => new Promise(() => {});
        Object.defineProperty(queue, 'client', {
          get: () => {
            pedidos.client += 1;
            return new Promise(() => {});
          },
        });
      };

      it('con 3 colas que no contestan tarda un plazo, no uno por cola, y pide INFO una sola vez', async () => {
        jest.useFakeTimers();
        const cola = crear();
        (cola as any).esperaRedisMs = 20;
        const pedidos = { client: 0 };
        for (const nombre of ['email.send', 'webhook.deliver', 'supplier.ct.sync']) {
          cola.register(nombre, async () => {});
          volverMuda((cola as any).queues.get(nombre), pedidos);
        }

        let resultado: Awaited<ReturnType<typeof cola.getStatsDetallado>> | undefined;
        void cola.getStatsDetallado().then((r) => {
          resultado = r;
        });
        // Un plazo (20 ms) y un poco más. Con un plazo por cola el INFO habría tardado 3 × 20 ms más los 20 de las colas.
        await jest.advanceTimersByTimeAsync(25);

        expect(resultado).toBeDefined();
        expect(resultado!.redis).toBeNull();
        expect(resultado!.colas).toHaveLength(3);
        for (const fila of resultado!.colas) {
          expect(fila).toMatchObject({ waiting: null, workers: null, error: 'Redis no respondió a tiempo' });
        }
        expect(pedidos.client).toBe(1);

        // Pasado mucho más tiempo, nadie vuelve a pedirle nada a un Redis que no contesta.
        await jest.advanceTimersByTimeAsync(500);
        expect(pedidos.client).toBe(1);
        await cola.onModuleDestroy();
      });

      it('si el cliente llega tarde, con el plazo ya vencido no se lanza INFO ni se prueba otra cola', async () => {
        jest.useFakeTimers();
        const cola = crear();
        (cola as any).esperaRedisMs = 20;
        cola.register('email.send', async () => {});
        cola.register('webhook.deliver', async () => {});
        const info = jest.fn(async () => redis.info);
        let entregarCliente: (c: unknown) => void = () => {};
        Object.defineProperty((cola as any).queues.get('email.send'), 'client', {
          get: () => new Promise((resolver) => (entregarCliente = resolver)),
        });
        const otraColaPidioCliente = jest.fn();
        Object.defineProperty((cola as any).queues.get('webhook.deliver'), 'client', {
          get: () => {
            otraColaPidioCliente();
            return Promise.resolve({ info });
          },
        });

        let resultado: Awaited<ReturnType<typeof cola.getStatsDetallado>> | undefined;
        void cola.getStatsDetallado().then((r) => {
          resultado = r;
        });
        await jest.advanceTimersByTimeAsync(25);
        expect(resultado!.redis).toBeNull();

        // Redis vuelve después: el cliente que estaba pendiente llega, pero ya no se le pregunta nada.
        entregarCliente({ info });
        await jest.advanceTimersByTimeAsync(500);

        expect(info).not.toHaveBeenCalled();
        expect(otraColaPidioCliente).not.toHaveBeenCalled();
        await cola.onModuleDestroy();
      });

      it('si la primera cola falla al instante, usa la siguiente (siempre dentro del mismo plazo)', async () => {
        const cola = crear();
        cola.register('email.send', async () => {});
        cola.register('webhook.deliver', async () => {});
        Object.defineProperty((cola as any).queues.get('email.send'), 'client', {
          get: () => Promise.reject(new Error('Connection is closed.')),
        });

        const r = await cola.getStatsDetallado();

        expect(r.redis).toMatchObject({ maxmemoryPolicy: 'allkeys-lru', usedMemory: 7189136 });
        expect(redis.llamadasInfo).toBe(1);
        await cola.onModuleDestroy();
      });
    });

    it('el error de una cola no deja correos ni números largos', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});
      (cola as any).queues.get('email.send').getJobCounts = async () => {
        throw new Error('fallo con ana@ejemplo.com y 1234567890123');
      };

      const r = await cola.getStatsDetallado();

      expect(r.colas[0]!.error).toBe('fallo con [correo] y #');
      await cola.onModuleDestroy();
    });

    it('getStats() sigue siendo síncrono y con la misma forma', async () => {
      const cola = crear();
      cola.register('email.send', async () => {});

      const stats = cola.getStats();

      expect(stats).toEqual({
        backend: 'bullmq',
        pending: 0,
        dlq: 0,
        handlers: ['email.send'],
        redisConfigured: true,
        workers: 1,
        runWorkers: true,
      });
      await cola.onModuleDestroy();
    });
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

    it('al agotar los intentos el trabajo va al DLQ y deja rastro en el anillo', async () => {
      const cola = crear();
      cola.register('email.send', async () => {
        throw new Error('No se pudo enviar a ana@ejemplo.com');
      });
      await cola.enqueue('email.send', { to: 'ana@ejemplo.com', subject: 'x' }, { maxAttempts: 3, jobId: 'correo-1' });

      for (let vuelta = 0; vuelta < 3; vuelta++) {
        for (const j of (cola as any).pending) j.runAt = 0;
        await (cola as any).tickMemory();
      }

      expect(cola.getStats()).toMatchObject({ pending: 0, dlq: 1 });
      expect(fallosRecientes()).toHaveLength(1);
      expect(fallosRecientes()[0]).toMatchObject({
        cola: 'email.send',
        jobId: 'correo-1',
        intentos: 3,
        error: 'No se pudo enviar a [correo]',
        claves: ['to', 'subject'],
      });
      await cola.onModuleDestroy();
    });

    it('un intento que todavía puede reintentarse no deja rastro', async () => {
      const cola = crear();
      cola.register('email.send', async () => {
        throw new Error('falló');
      });
      await cola.enqueue('email.send', {}, { maxAttempts: 3 });

      for (const j of (cola as any).pending) j.runAt = 0;
      await (cola as any).tickMemory();

      expect(cola.getStats()).toMatchObject({ pending: 1, dlq: 0 });
      expect(fallosRecientes()).toEqual([]);
      await cola.onModuleDestroy();
    });

    it('un trabajo sin handler también deja rastro', async () => {
      const cola = crear();
      await cola.enqueue('no-existe', { dato: 1 }, { jobId: 'x-1' });

      for (const j of (cola as any).pending) j.runAt = 0;
      await (cola as any).tickMemory();

      expect(fallosRecientes()[0]).toMatchObject({ cola: 'no-existe', jobId: 'x-1', error: 'NO_HANDLER', claves: ['dato'] });
      await cola.onModuleDestroy();
    });

    it('getDlq en memoria devuelve lo anotado, con su origen, sin consultar a nadie', async () => {
      const cola = crear();
      cola.register('email.send', async () => {
        throw new Error('falló');
      });
      await cola.enqueue('email.send', {}, { maxAttempts: 1, jobId: 'c-1' });
      for (const j of (cola as any).pending) j.runAt = 0;
      await (cola as any).tickMemory();

      const items = await cola.getDlq();

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id: 'c-1', name: 'email.send', attempts: 1, maxAttempts: 1, lastError: 'falló', origen: 'memoria' });
      await cola.onModuleDestroy();
    });

    it('getStatsDetallado sin Redis es un objeto simple y no lanza', async () => {
      const cola = crear();
      await cola.enqueue('email.send', {}, { delayMs: 60_000 });

      const r = await cola.getStatsDetallado();

      expect(r).toMatchObject({ backend: 'memory', colas: [], redis: null, fallosEnMemoria: 0, pendientesEnMemoria: 1 });
      await cola.onModuleDestroy();
    });
  });
});
