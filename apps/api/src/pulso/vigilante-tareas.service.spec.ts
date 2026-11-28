import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MAX_TAREAS_LATIDO, latido, reiniciarLatido } from '../common/cron/latido-tareas';
import { reiniciarCachePiloto } from '../common/piloto/interruptor-piloto';
import { runScheduledJob } from '../common/cron/run-scheduled-job';
import type { TareaCatalogo } from '../common/cron/tareas-catalogo';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import {
  CLAVE_PULSO_VIGILANTE,
  METRICA_TAREAS_ATRASADAS,
  METRICA_TAREAS_CRITICAS_ROJAS,
  VigilanteTareasService,
} from './vigilante-tareas.service';

const MIN = 60_000;
const HORA = 60 * MIN;
const ARRANQUE = Date.UTC(2026, 10, 20, 0, 0, 0);
/** Mucho después del arranque: nada se juzga «sin datos» por estar recién arrancado. */
const AHORA = ARRANQUE + 10 * 24 * HORA;

const CAT: Record<string, TareaCatalogo> = {
  critica5: { cron: '*/5 * * * *', zona: 'UTC', grupo: 't', que: 'crítica cada 5 min', critica: true },
  normal5: { cron: '*/5 * * * *', zona: 'UTC', grupo: 't', que: 'normal cada 5 min' },
  diaria: { cron: '0 8 * * *', zona: 'MX', grupo: 't', que: 'diaria' },
};

/** Deja una corrida buena que arrancó `haceMs` antes de `ahora`. */
function late(nombre: string, ahora: number, haceMs: number): void {
  latido.inicio(nombre, ahora - haceMs);
  latido.fin(nombre, 'ok', 1000, undefined, ahora - haceMs + 1000);
}

/** Deja `n` corridas seguidas con error, la última hace `haceMs`. */
function falla(nombre: string, ahora: number, haceMs: number, error: string, n = 3): void {
  for (let i = 0; i < n; i += 1) {
    const inicio = ahora - haceMs - (n - 1 - i) * MIN;
    latido.inicio(nombre, inicio);
    latido.fin(nombre, 'error', 500, error, inicio + 500);
  }
}

function armar(valor: string | null | Error = 'observar') {
  const findFirst = jest.fn(async (_args: unknown) => {
    if (valor instanceof Error) throw valor;
    return valor === null ? null : { value: valor };
  });
  const prisma = { systemSetting: { findFirst } } as unknown as PrismaService;
  const setGauge = jest.fn();
  const metrics = { setGauge } as unknown as MetricsService;
  const servicio = new VigilanteTareasService(prisma, metrics);
  const logger = (servicio as unknown as { logger: Logger }).logger;
  const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  const log = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  return { servicio, findFirst, setGauge, error, log, warn };
}

describe('VigilanteTareasService', () => {
  const relevoAntes = process.env.NEXARA_RELEVO;

  beforeEach(() => {
    delete process.env.NEXARA_RELEVO;
    reiniciarLatido(ARRANQUE);
    reiniciarCachePiloto();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (relevoAntes === undefined) delete process.env.NEXARA_RELEVO;
    else process.env.NEXARA_RELEVO = relevoAntes;
  });

  it('Nest le inyecta Prisma y el servicio de medidores', async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        VigilanteTareasService,
        { provide: PrismaService, useValue: { systemSetting: { findFirst: jest.fn(async () => null) } } },
        { provide: MetricsService, useValue: { setGauge: jest.fn() } },
      ],
    }).compile();
    const servicio = modulo.get(VigilanteTareasService);
    await expect(servicio.revisar(AHORA, CAT)).resolves.toMatchObject({ modo: 'apagado' });
  });

  it('lee el interruptor «pulso.vigilante»', async () => {
    const { servicio, findFirst } = armar('observar');
    await servicio.revisar(AHORA, CAT);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { key: CLAVE_PULSO_VIGILANTE } }));
    expect(CLAVE_PULSO_VIGILANTE).toBe('pulso.vigilante');
  });

  describe('aviso único', () => {
    it('una tarea atrasada loguea UNA vez aunque revisar() corra 5 veces', async () => {
      const { servicio, error } = armar('observar');
      late('normal5', AHORA, 60 * MIN);
      for (let i = 0; i < 5; i += 1) await servicio.revisar(AHORA + i * 5 * MIN, { normal5: CAT.normal5! });

      expect(error).toHaveBeenCalledTimes(1);
      const texto = String(error.mock.calls[0]![0]);
      expect(texto).toContain('[PULSO]');
      expect(texto).toContain('"normal5"');
      expect(texto).toContain('atrasada');
      expect(latido.instantanea().find((e) => e.nombre === 'normal5')?.avisadoAt).toBe(AHORA);
    });

    it('al recuperarse loguea «recuperada» una sola vez y vuelve a armarse', async () => {
      const { servicio, error, log } = armar('observar');
      const catalogo = { normal5: CAT.normal5! };
      late('normal5', AHORA, 60 * MIN);
      await servicio.revisar(AHORA, catalogo);
      expect(error).toHaveBeenCalledTimes(1);

      // Vuelve a latir.
      late('normal5', AHORA + 31 * MIN, MIN);
      for (let i = 0; i < 4; i += 1) await servicio.revisar(AHORA + 31 * MIN + i * MIN, catalogo);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]![0])).toContain('[PULSO]');
      expect(String(log.mock.calls[0]![0])).toContain('recuperada');
      expect(latido.instantanea().find((e) => e.nombre === 'normal5')?.avisadoAt).toBeNull();
      expect(error).toHaveBeenCalledTimes(1);

      // Si se atrasa otra vez, avisa otra vez (una sola).
      const mucho = AHORA + 2 * HORA;
      await servicio.revisar(mucho, catalogo);
      await servicio.revisar(mucho + 5 * MIN, catalogo);
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('una tarea crítica y una que no lo es se loguean igual; la crítica cuenta en rojas', async () => {
      const { servicio, error, setGauge } = armar('observar');
      late('critica5', AHORA, 60 * MIN);
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { critica5: CAT.critica5!, normal5: CAT.normal5! });

      expect(error).toHaveBeenCalledTimes(2);
      const textos = error.mock.calls.map((c) => String(c[0]));
      expect(textos.find((t) => t.includes('"critica5"'))).toContain('(crítica)');
      expect(textos.find((t) => t.includes('"normal5"'))).not.toContain('(crítica)');
      expect(resumen).toMatchObject({ modo: 'observar', conProblema: 2, criticasRojas: 1, avisadas: 2, recuperadas: 0 });
      expect(setGauge).toHaveBeenCalledWith(METRICA_TAREAS_ATRASADAS, 2);
      expect(setGauge).toHaveBeenCalledWith(METRICA_TAREAS_CRITICAS_ROJAS, 1);
    });

    it('una tarea sin historial que ya pasó su límite desde el arranque también se avisa', async () => {
      const { servicio, error } = armar('observar');
      // La diaria nunca latió y el proceso lleva 10 días arriba.
      await servicio.revisar(AHORA, { diaria: CAT.diaria! });
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]![0])).toContain('No ha corrido desde que arrancó');
    });

    it('una tarea sin estado en el latido se avisa UNA vez aunque revisar() corra 5 veces', async () => {
      const { servicio, error, setGauge } = armar('observar');
      const catalogo = { diaria: CAT.diaria! };
      expect(latido.instantanea()).toHaveLength(0); // no hay ningún estado: nunca corrió
      const resumenes = [];
      for (let i = 0; i < 5; i += 1) resumenes.push(await servicio.revisar(AHORA + i * 5 * MIN, catalogo));

      expect(error).toHaveBeenCalledTimes(1);
      expect(resumenes.map((r) => r.avisadas)).toEqual([1, 0, 0, 0, 0]);
      // El problema sigue contando en el medidor en cada vuelta, aunque ya no se vuelva a avisar.
      expect(resumenes.map((r) => r.conProblema)).toEqual([1, 1, 1, 1, 1]);
      expect(setGauge).toHaveBeenLastCalledWith(METRICA_TAREAS_CRITICAS_ROJAS, 0);
      // El aviso quedó anotado en el latido (así el volcado de 1B también lo guarda).
      expect(latido.instantanea().find((e) => e.nombre === 'diaria')).toMatchObject({ avisadoAt: AHORA, corridas: 0 });
    });

    it('una tarea sin estado que al fin late da UN «recuperada» y vuelve a armarse', async () => {
      const { servicio, error, log } = armar('observar');
      const catalogo = { diaria: CAT.diaria! };
      for (let i = 0; i < 5; i += 1) await servicio.revisar(AHORA + i * 5 * MIN, catalogo);
      expect(error).toHaveBeenCalledTimes(1);

      // Por fin corre.
      const despues = AHORA + HORA;
      late('diaria', despues, MIN);
      for (let i = 0; i < 4; i += 1) await servicio.revisar(despues + i * MIN, catalogo);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]![0])).toContain('recuperada');
      expect(latido.instantanea().find((e) => e.nombre === 'diaria')?.avisadoAt).toBeNull();
      expect(error).toHaveBeenCalledTimes(1);

      // Se vuelve a callar más allá de su límite (48 h): avisa otra vez, una sola.
      const muchoDespues = despues + 5 * 24 * HORA;
      await servicio.revisar(muchoDespues, catalogo);
      await servicio.revisar(muchoDespues + 5 * MIN, catalogo);
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('con el catálogo real y el latido vacío, cada tarea atrasada se avisa una sola vez en 5 vueltas', async () => {
      const { servicio, error } = armar('observar');
      const primera = await servicio.revisar(AHORA);
      expect(primera.conProblema).toBeGreaterThan(0);
      expect(primera.avisadas).toBe(primera.conProblema);
      const tras1 = error.mock.calls.length;
      expect(tras1).toBe(primera.conProblema);

      for (let i = 1; i < 5; i += 1) {
        const otra = await servicio.revisar(AHORA + i * 5 * MIN);
        expect(otra.avisadas).toBe(0);
      }
      expect(error).toHaveBeenCalledTimes(tras1);
    });

    it('si el latido ya no tiene lugar para más nombres, el aviso tampoco se repite', async () => {
      const { servicio, error, log } = armar('observar');
      for (let i = 0; i < MAX_TAREAS_LATIDO; i += 1) latido.inicio(`relleno-${i}`, AHORA - MIN);
      expect(latido.instantanea()).toHaveLength(MAX_TAREAS_LATIDO);
      const catalogo = { diaria: CAT.diaria! };

      for (let i = 0; i < 5; i += 1) await servicio.revisar(AHORA + i * 5 * MIN, catalogo);
      expect(error).toHaveBeenCalledTimes(1);
      expect(latido.instantanea()).toHaveLength(MAX_TAREAS_LATIDO); // no se coló un estado de más

      // Sigue sin lugar y sin latir: nada nuevo que decir.
      await servicio.revisar(AHORA + HORA, catalogo);
      expect(error).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    });

    it('una tarea atorada se avisa una vez', async () => {
      const { servicio, error } = armar('observar');
      latido.inicio('normal5', AHORA - 2 * HORA); // arrancó y nunca terminó
      await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      await servicio.revisar(AHORA + 5 * MIN, { normal5: CAT.normal5! });
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]![0])).toContain('atorada');
    });

    it('una tarea que falla 3 veces seguidas se avisa una vez', async () => {
      const { servicio, error } = armar('observar');
      falla('normal5', AHORA, MIN, 'ECONNREFUSED');
      await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      await servicio.revisar(AHORA + MIN, { normal5: CAT.normal5! });
      expect(error).toHaveBeenCalledTimes(1);
      const texto = String(error.mock.calls[0]![0]);
      expect(texto).toContain('fallando');
      expect(texto).toContain('3 veces seguidas');
      expect(texto).toContain('ECONNREFUSED');
    });

    it('el error que cita el aviso sale de la envoltura, ya sin correos ni números largos', async () => {
      const { servicio, error } = armar('observar');
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const quien = new Logger('prueba');
      for (let i = 0; i < 3; i += 1) {
        await runScheduledJob('normal5', quien, async () => {
          throw new Error('No se pudo mandar a ana@empresa.com con 5512345678901');
        });
      }
      await servicio.revisar(Date.now(), { normal5: CAT.normal5! });
      expect(error).toHaveBeenCalledTimes(1);
      const texto = String(error.mock.calls[0]![0]);
      expect(texto).toContain('fallando');
      expect(texto).not.toContain('ana@empresa.com');
      expect(texto).not.toContain('5512345678901');
    });

    it('«sin datos» no es falla: no avisa ni arma el aviso', async () => {
      const { servicio, error, log, setGauge } = armar('observar');
      // El proceso arrancó hace 1 minuto: la diaria todavía no le tocaba correr.
      reiniciarLatido(AHORA - MIN);
      const resumen = await servicio.revisar(AHORA, { diaria: CAT.diaria! });
      expect(error).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(resumen).toMatchObject({ conProblema: 0, criticasRojas: 0, avisadas: 0 });
      expect(setGauge).toHaveBeenCalledWith(METRICA_TAREAS_ATRASADAS, 0);
    });

    it('una tarea que late a tiempo no deja nada en el log', async () => {
      const { servicio, error, log } = armar('observar');
      late('critica5', AHORA, 2 * MIN);
      await servicio.revisar(AHORA, { critica5: CAT.critica5! });
      expect(error).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });
  });

  describe('interruptor', () => {
    it('apagado: no loguea, no publica y no marca nada', async () => {
      const { servicio, error, log, setGauge } = armar('apagado');
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(error).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(setGauge).not.toHaveBeenCalled();
      expect(resumen).toMatchObject({ modo: 'apagado', avisadas: 0 });
      expect(latido.instantanea().find((e) => e.nombre === 'normal5')?.avisadoAt).toBeNull();
    });

    it('sin fila en system_settings está apagado (de fábrica)', async () => {
      const { servicio, error, setGauge } = armar(null);
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(resumen.modo).toBe('apagado');
      expect(error).not.toHaveBeenCalled();
      expect(setGauge).not.toHaveBeenCalled();
    });

    it('una fila mal escrita también apaga', async () => {
      const { servicio, error } = armar('quizá');
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(resumen.modo).toBe('apagado');
      expect(error).not.toHaveBeenCalled();
    });

    it.each(['observar', 'activo'])('«%s» deja el aviso en el log', async (valor) => {
      const { servicio, error } = armar(valor);
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(resumen.modo).toBe(valor);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('si la base falla y nunca se leyó el interruptor, queda apagado y no truena', async () => {
      const { servicio, error, setGauge } = armar(new Error('conexión caída'));
      late('normal5', AHORA, 60 * MIN);
      await expect(servicio.revisar(AHORA, { normal5: CAT.normal5! })).resolves.toMatchObject({ modo: 'apagado' });
      expect(error).not.toHaveBeenCalled();
      expect(setGauge).not.toHaveBeenCalled();
    });

    it('si la base falla después de haber leído «observar», conserva «observar»', async () => {
      const { servicio, findFirst, error } = armar('observar');
      const ahora = jest.spyOn(Date, 'now');
      ahora.mockReturnValue(1_800_000_000_000);
      late('normal5', AHORA, 60 * MIN);
      await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(error).toHaveBeenCalledTimes(1);

      // Pasa la caché (30 s), la base se cae y llega otra tarea atrasada.
      ahora.mockReturnValue(1_800_000_000_000 + 60_000);
      findFirst.mockRejectedValue(new Error('conexión caída'));
      late('critica5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5!, critica5: CAT.critica5! });
      expect(resumen.modo).toBe('observar');
      expect(error).toHaveBeenCalledTimes(2); // solo la nueva: la primera ya estaba avisada
    });

    describe('con el latido apagado (PULSO_LATIDO=0)', () => {
      const latidoAntes = process.env.PULSO_LATIDO;
      afterEach(() => {
        if (latidoAntes === undefined) delete process.env.PULSO_LATIDO;
        else process.env.PULSO_LATIDO = latidoAntes;
      });

      it.each(['observar', 'activo'])('«%s»: no loguea, no publica y no marca nada (no hay con qué juzgar)', async (valor) => {
        const { servicio, error, log, warn, setGauge } = armar(valor);
        late('normal5', AHORA, 60 * MIN); // registrada a mano antes de apagar el latido
        process.env.PULSO_LATIDO = '0';
        for (let i = 0; i < 3; i += 1) {
          const resumen = await servicio.revisar(AHORA + i * 5 * MIN, { normal5: CAT.normal5!, diaria: CAT.diaria! });
          expect(resumen).toMatchObject({ modo: valor, conProblema: 0, criticasRojas: 0, avisadas: 0, recuperadas: 0 });
        }
        expect(error).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(setGauge).not.toHaveBeenCalled();
        const estados = latido.instantanea();
        expect(estados.map((e) => e.nombre)).toEqual(['normal5']); // no se creó ningún estado
        expect(estados[0]!.avisadoAt).toBeNull();
      });

      it('con el catálogo real y el latido apagado el log queda en silencio', async () => {
        const { servicio, error, setGauge } = armar('observar');
        process.env.PULSO_LATIDO = '0';
        for (let i = 0; i < 3; i += 1) await servicio.revisar(AHORA + i * 5 * MIN);
        expect(error).not.toHaveBeenCalled();
        expect(setGauge).not.toHaveBeenCalled();
      });

      it('al volver a encenderlo, el vigilante vuelve a juzgar', async () => {
        const { servicio, error } = armar('observar');
        process.env.PULSO_LATIDO = '0';
        await servicio.revisar(AHORA, { diaria: CAT.diaria! });
        expect(error).not.toHaveBeenCalled();
        delete process.env.PULSO_LATIDO;
        await servicio.revisar(AHORA + 5 * MIN, { diaria: CAT.diaria! });
        expect(error).toHaveBeenCalledTimes(1);
      });
    });

    it('con relevo (NEXARA_RELEVO=1) no loguea ni publica ni marca', async () => {
      process.env.NEXARA_RELEVO = '1';
      const { servicio, error, log, setGauge } = armar('observar');
      late('normal5', AHORA, 60 * MIN);
      const resumen = await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      expect(error).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(setGauge).not.toHaveBeenCalled();
      expect(resumen).toMatchObject({ avisadas: 0, conProblema: 0 });
      expect(latido.instantanea().find((e) => e.nombre === 'normal5')?.avisadoAt).toBeNull();
    });
  });

  describe('solidez', () => {
    it('solo observa: no escribe en la base', async () => {
      const { servicio, findFirst } = armar('observar');
      late('normal5', AHORA, 60 * MIN);
      await servicio.revisar(AHORA, { normal5: CAT.normal5! });
      // La única consulta es la lectura del interruptor.
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    it('si los medidores fallan, la revisión sigue', async () => {
      const { servicio, setGauge, error } = armar('observar');
      setGauge.mockImplementation(() => {
        throw new Error('medidor roto');
      });
      late('normal5', AHORA, 60 * MIN);
      await expect(servicio.revisar(AHORA, { normal5: CAT.normal5! })).resolves.toMatchObject({ avisadas: 1 });
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('si falla el aviso de una tarea, las demás se revisan igual', async () => {
      const { servicio, error, warn } = armar('observar');
      late('critica5', AHORA, 60 * MIN);
      late('normal5', AHORA, 60 * MIN);
      error.mockImplementationOnce(() => {
        throw new Error('log roto');
      });
      const resumen = await servicio.revisar(AHORA, { critica5: CAT.critica5!, normal5: CAT.normal5! });
      expect(resumen.conProblema).toBe(2);
      expect(resumen.avisadas).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('cron() corre dentro de runScheduledJob: deja su propio latido y recién arrancado no avisa de nada', async () => {
      const { servicio, error } = armar('observar');
      reiniciarLatido(Date.now());
      await servicio.cron();
      const propio = latido.instantanea().find((e) => e.nombre === 'pulso:vigilante');
      expect(propio).toMatchObject({ corridas: 1, fallos: 0, ultimoResultado: 'ok' });
      expect(error).not.toHaveBeenCalled();
    });

    it('cron() apagado también deja latido (la tarea sigue viva aunque no actúe)', async () => {
      const { servicio, setGauge } = armar('apagado');
      reiniciarLatido(Date.now());
      await servicio.cron();
      expect(latido.instantanea().find((e) => e.nombre === 'pulso:vigilante')).toMatchObject({ corridas: 1, ultimoResultado: 'ok' });
      expect(setGauge).not.toHaveBeenCalled();
    });

    it('si revisar() lanza, runScheduledJob lo atrapa y lo anota en el latido', async () => {
      const { servicio } = armar('observar');
      jest.spyOn(servicio, 'revisar').mockRejectedValue(new Error('algo raro'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      reiniciarLatido(Date.now());
      await expect(servicio.cron()).resolves.toBeUndefined();
      expect(latido.instantanea().find((e) => e.nombre === 'pulso:vigilante')).toMatchObject({ fallos: 1, ultimoResultado: 'error' });
      // Y la envoltura sigue disponible para la vuelta siguiente.
      await expect(runScheduledJob('pulso:vigilante', new Logger('x'), async () => 1)).resolves.toBe(1);
    });
  });
});
