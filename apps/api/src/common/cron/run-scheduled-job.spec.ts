import { Logger } from '@nestjs/common';
import { runScheduledJob } from './run-scheduled-job.js';
import { latido, reiniciarLatido } from './latido-tareas';

function fakeLogger() {
  const errors: string[] = [];
  const debugs: string[] = [];
  const logger = {
    error: (msg: string) => errors.push(msg),
    debug: (msg: string) => debugs.push(msg),
  } as unknown as Logger;
  return { logger, errors, debugs };
}

describe('runScheduledJob', () => {
  it('ejecuta la tarea y registra la duración', async () => {
    const { logger, debugs, errors } = fakeLogger();
    const job = jest.fn().mockResolvedValue('ok');

    await runScheduledJob('kpi-snapshot', logger, job);

    expect(job).toHaveBeenCalled();
    expect(errors).toHaveLength(0);
    expect(debugs[0]).toContain('kpi-snapshot');
  });

  it('no propaga el fallo: la siguiente ejecución debe programarse igual', async () => {
    const { logger } = fakeLogger();
    const job = jest.fn().mockRejectedValue(new Error('base de datos caída'));

    // Si esto lanzara, acabaría como unhandledRejection anónimo.
    await expect(runScheduledJob('overdue-invoices', logger, job)).resolves.toBeUndefined();
  });

  it('atribuye el fallo a su tarea concreta', async () => {
    const { logger, errors } = fakeLogger();

    await runScheduledJob('sla-breach-escalate', logger, () =>
      Promise.reject(new Error('timeout de consulta')),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('sla-breach-escalate');
    expect(errors[0]).toContain('timeout de consulta');
  });

  it('tolera valores lanzados que no son Error', async () => {
    const { logger, errors } = fakeLogger();

    await runScheduledJob('webhook-retries', logger, () => Promise.reject('fallo suelto'));

    expect(errors[0]).toContain('fallo suelto');
  });
});

describe('runScheduledJob y el latido', () => {
  const antes = process.env.PULSO_LATIDO;
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

  const estadoDe = (nombre: string) => latido.instantanea().find((e) => e.nombre === nombre);

  beforeEach(() => {
    delete process.env.PULSO_LATIDO;
    reiniciarLatido();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (antes === undefined) delete process.env.PULSO_LATIDO;
    else process.env.PULSO_LATIDO = antes;
  });

  it('devuelve lo que devuelve el trabajo', async () => {
    await expect(runScheduledJob('latido:valor', logger, async () => 42)).resolves.toBe(42);
  });

  it('devuelve undefined si el trabajo falla o si se salta la vuelta', async () => {
    await expect(
      runScheduledJob('latido:falla', logger, async () => {
        throw new Error('x');
      }),
    ).resolves.toBeUndefined();

    let soltar!: () => void;
    const primera = runScheduledJob('latido:lenta', logger, () => new Promise<string>((r) => (soltar = () => r('listo'))));
    await expect(runScheduledJob('latido:lenta', logger, async () => 'otra')).resolves.toBeUndefined();
    soltar();
    await expect(primera).resolves.toBe('listo');
  });

  it('tras un éxito el latido dice ok, 1 corrida y 0 fallos seguidos', async () => {
    await runScheduledJob('latido:ok', logger, async () => undefined);
    expect(estadoDe('latido:ok')).toMatchObject({
      ultimoResultado: 'ok',
      corridas: 1,
      fallosSeguidos: 0,
      enCursoDesde: null,
    });
    expect(estadoDe('latido:ok')?.ultimoInicio).not.toBeNull();
    expect(estadoDe('latido:ok')?.duracionUltimaMs).toBeGreaterThanOrEqual(0);
  });

  it('tras un lanzamiento el latido dice error con el mensaje saneado; una corrida buena regresa los fallos seguidos a 0', async () => {
    await runScheduledJob('latido:error', logger, async () => {
      throw new Error('no se pudo avisar a ana@ejemplo.com\ncon datos privados en la segunda línea');
    });
    const e = estadoDe('latido:error')!;
    expect(e).toMatchObject({ ultimoResultado: 'error', fallos: 1, fallosSeguidos: 1, corridas: 1 });
    expect(e.ultimoError).toBe('no se pudo avisar a [correo]');

    await runScheduledJob('latido:error', logger, async () => undefined);
    expect(estadoDe('latido:error')).toMatchObject({ ultimoResultado: 'ok', fallosSeguidos: 0, fallos: 1, corridas: 2 });
  });

  it('un valor lanzado que no es Error también queda registrado', async () => {
    await runScheduledJob('latido:suelto', logger, () => Promise.reject('fallo suelto'));
    expect(estadoDe('latido:suelto')).toMatchObject({ ultimoResultado: 'error', ultimoError: 'fallo suelto' });
  });

  it('la segunda vuelta mientras la primera sigue cuenta 1 saltada y no llama al trabajo', async () => {
    let soltar!: () => void;
    const lenta = jest.fn(() => new Promise<void>((r) => (soltar = r)));
    const primera = runScheduledJob('latido:encimada', logger, lenta);
    expect(estadoDe('latido:encimada')?.enCursoDesde).not.toBeNull();

    await runScheduledJob('latido:encimada', logger, lenta);
    expect(lenta).toHaveBeenCalledTimes(1);
    expect(estadoDe('latido:encimada')).toMatchObject({ saltadas: 1, corridas: 0 });

    soltar();
    await primera;
    expect(estadoDe('latido:encimada')).toMatchObject({ saltadas: 1, corridas: 1, ultimoResultado: 'ok', enCursoDesde: null });
  });

  it('si el latido lanza (inicio, fin o saltada) la tarea corre igual y devuelve su valor', async () => {
    jest.spyOn(latido, 'inicio').mockImplementation(() => {
      throw new Error('latido roto');
    });
    jest.spyOn(latido, 'fin').mockImplementation(() => {
      throw new Error('latido roto');
    });
    jest.spyOn(latido, 'saltada').mockImplementation(() => {
      throw new Error('latido roto');
    });
    const trabajo = jest.fn().mockResolvedValue('hecho');
    await expect(runScheduledJob('latido:roto', logger, trabajo)).resolves.toBe('hecho');
    expect(trabajo).toHaveBeenCalledTimes(1);

    // También si el trabajo falla: el error se atribuye y no se propaga.
    await expect(
      runScheduledJob('latido:roto', logger, async () => {
        throw new Error('el trabajo');
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('latido:roto'), expect.anything());

    // Y la vuelta saltada tampoco se rompe por un latido roto.
    let soltar!: () => void;
    const primera = runScheduledJob('latido:roto-2', logger, () => new Promise<void>((r) => (soltar = r)));
    await expect(runScheduledJob('latido:roto-2', logger, async () => undefined)).resolves.toBeUndefined();
    soltar();
    await primera;
  });

  it('con PULSO_LATIDO=0 la tarea corre pero no se registra nada', async () => {
    process.env.PULSO_LATIDO = '0';
    const trabajo = jest.fn().mockResolvedValue(7);
    await expect(runScheduledJob('latido:apagado', logger, trabajo)).resolves.toBe(7);
    await runScheduledJob('latido:apagado', logger, async () => {
      throw new Error('x');
    });
    expect(trabajo).toHaveBeenCalledTimes(1);
    expect(latido.instantanea()).toEqual([]);
  });
});
