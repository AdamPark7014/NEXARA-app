import Anthropic from '@anthropic-ai/sdk';
import { ForbiddenException } from '@nestjs/common';
import { conBaseDesechable } from '../../common/piloto/base-desechable';
import { reiniciarCachePiloto } from '../../common/piloto/interruptor-piloto';
import { ClaudeService } from '../claude/claude.service';
import { clasificarFallo, type ModoIa } from '../claude/compuerta-ia';
import { SaludIaService, anfitrionDeLaPuerta } from './salud-ia.service';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 28, 15, 0, 0); // 28-11-2026 09:00 en México
const LLAVE = 'pia_prueba_secreta_9f8e7d6c5b4a';
const SECRETO_EN_URL = 'clavesecreta7788';
const PUERTA = `http://usuario:${SECRETO_EN_URL}@puerta-ia:8080/v1/mensajes?token=${SECRETO_EN_URL}`;

const cuerpo = (tipo: string, mensaje = 'x') => ({ type: 'error', error: { type: tipo, message: mensaje } });
const error401 = () => new Anthropic.AuthenticationError(401, cuerpo('authentication_error', 'invalid x-api-key'), 'invalid x-api-key', new Headers());
const error500 = () => new Anthropic.InternalServerError(500, cuerpo('api_error'), 'x', new Headers());

type Tarjeta = { entityType: string | null; createdAt: Date } | null;
type FilaSql = { dia: Date | string; total: number | bigint; con_sugerencia: number | bigint };

/** Servicio con una base simulada que solo contesta lo que el servicio pregunta, y una IA real sin red. */
function armar(
  opciones: {
    modo?: ModoIa;
    tarjeta?: Tarjeta | Error;
    filas?: FilaSql[] | Error;
    ultimaActividad?: { id: number; fechaAsignacion: Date } | null;
    reuniones?: number;
    vehiculos?: number;
  } = {},
) {
  const modo = opciones.modo ?? 'observar';
  process.env.ANTHROPIC_API_KEY = LLAVE;
  process.env.CLAUDE_BASE_URL = PUERTA;
  process.env.IA_COMPUERTA_MODO = modo;
  const claude = new ClaudeService();
  claude.compuerta.modo = modo;
  const prisma = {
    notification: {
      findFirst: jest.fn(async (_args: unknown) => {
        if (opciones.tarjeta instanceof Error) throw opciones.tarjeta;
        return opciones.tarjeta ?? null;
      }),
    },
    activity: { findFirst: jest.fn(async (_args: unknown) => opciones.ultimaActividad ?? null) },
    meetingRecording: { count: jest.fn(async (_args: unknown) => opciones.reuniones ?? 0) },
    vehicleControl: { count: jest.fn(async (_args: unknown) => opciones.vehiculos ?? 0) },
    $queryRaw: jest.fn(async (_sql: unknown) => {
      if (opciones.filas instanceof Error) throw opciones.filas;
      return opciones.filas ?? [];
    }),
  };
  const svc = new SaludIaService(claude, prisma as never);
  const avisos = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, claude, prisma, avisos };
}

describe('SaludIaService (GET /ai/salud)', () => {
  const previo = {
    llave: process.env.ANTHROPIC_API_KEY,
    base: process.env.CLAUDE_BASE_URL,
    modo: process.env.IA_COMPUERTA_MODO,
    tope: process.env.CLAUDE_TOPE_DIARIO,
  };
  const restaurar = (nombre: string, valor: string | undefined) => {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  };
  let reloj: jest.SpyInstance | undefined;
  let uptime: jest.SpyInstance | undefined;
  /** Mueve el reloj (lo usan la compuerta y el cupo). */
  const irA = (t: number) => {
    reloj?.mockRestore();
    reloj = jest.spyOn(Date, 'now').mockReturnValue(t);
  };
  const caer = (claude: ClaudeService, veces = 3, companyId = 1) => {
    for (let i = 0; i < veces; i++) claude.compuerta.registrarFallo(clasificarFallo(error401()), 'complejidad-sugerir', false, companyId);
  };

  beforeEach(() => {
    reiniciarCachePiloto();
    delete process.env.CLAUDE_TOPE_DIARIO;
    irA(T0);
    uptime = jest.spyOn(process, 'uptime').mockReturnValue(3600);
  });
  afterEach(() => {
    reloj?.mockRestore();
    reloj = undefined;
    uptime?.mockRestore();
    restaurar('ANTHROPIC_API_KEY', previo.llave);
    restaurar('CLAUDE_BASE_URL', previo.base);
    restaurar('IA_COMPUERTA_MODO', previo.modo);
    restaurar('CLAUDE_TOPE_DIARIO', previo.tope);
  });

  describe('la forma de la respuesta', () => {
    it('con la compuerta en ok: la IA responde, trae lo último bueno y el cupo de hoy', async () => {
      const { svc, claude } = armar();
      claude.compuerta.registrarBuena('complejidad-sugerir', 'claude-haiku-5-5', 1);
      irA(T0 + 5 * MIN);
      const salud = await svc.estado(1);
      expect(salud).toEqual({
        generadoEn: '2026-11-28T15:05:00.000Z',
        modo: 'observar',
        configurada: true,
        disponible: true,
        estado: 'ok',
        motivo: null,
        explicacion: 'La IA responde.',
        desde: null,
        ultimaBuena: { en: '2026-11-28T15:00:00.000Z', proceso: 'complejidad-sugerir', modelo: 'claude-haiku-5-5' },
        ultimoFallo: null,
        fallosSeguidos: 0,
        umbral: 3,
        proximoIntento: null,
        sondaEnVuelo: false,
        ultimaSonda: null,
        procesoDesde: '2026-11-28T14:05:00.000Z',
        puerta: 'puerta-ia:8080',
        hoy: {
          dia: '2026-11-28',
          porProceso: [{ proceso: 'complejidad-sugerir', llamadas: 1, buenas: 1, fallosSinCosto: 0, fallosOtros: 0 }],
          cupo: { tope: 300, usadas: 0 },
        },
        senales: { complejidadPorDia: [], pendientesPorCaida: { reunionesConError: 0, usosDeVehiculoSinIa: 0 }, ultimaSenalEnBase: null },
        sinDatos: [],
      });
    });

    it('en caída: dice desde cuándo, por qué, el último fallo y cuándo vuelve a probar; y disponible es falso aunque el modo sea observar', async () => {
      const { svc, claude } = armar({ modo: 'observar' });
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      irA(T0 + MIN);
      caer(claude);
      irA(T0 + 2 * MIN);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({
        estado: 'caida',
        // `ClaudeService.disponible()` diría true aquí (observar no decide): este es el honesto.
        disponible: false,
        motivo: 'llave_puerta_invalida',
        desde: '2026-11-28T15:01:00.000Z',
        fallosSeguidos: 3,
        proximoIntento: '2026-11-28T15:06:00.000Z',
        ultimaBuena: { en: '2026-11-28T15:00:00.000Z', proceso: 'actas' },
        ultimoFallo: { en: '2026-11-28T15:01:00.000Z', motivo: 'llave_puerta_invalida', proceso: 'complejidad-sugerir', detalle: '401 authentication_error' },
      });
      expect(salud.explicacion).toContain('rechaza la llave de Anthropic');
      expect(salud.explicacion).toContain('observar');
      expect(claude.disponible()).toBe(true);
    });

    it('en modo activo la explicación dice que las llamadas se niegan', async () => {
      const { svc, claude } = armar({ modo: 'activo' });
      caer(claude);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({ estado: 'caida', modo: 'activo', disponible: false });
      expect(salud.explicacion).toContain('se niegan');
    });

    it('sondeando: este proceso aún no ha visto nada; la IA se considera disponible y no hay fecha', async () => {
      const { svc } = armar();
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({
        estado: 'sondeando',
        disponible: true,
        motivo: null,
        desde: null,
        ultimaBuena: null,
        ultimoFallo: null,
        ultimaSonda: null,
      });
      expect(salud.explicacion).toContain('45 segundos');
    });

    it('sondeando con una caída sin cerrar de antes del reinicio: desde es el de la tarjeta', async () => {
      const antes = new Date(T0 - 3 * 60 * MIN);
      const { svc } = armar({ tarjeta: { entityType: 'IA_CAIDA', createdAt: antes } });
      expect(await svc.estado(1)).toMatchObject({ estado: 'sondeando', desde: antes.toISOString() });
    });

    it('la última sonda dice si salió bien o mal y por qué', async () => {
      const { svc, claude } = armar();
      claude.compuerta.registrarFallo(clasificarFallo(error401()), 'nexara-sonda', true);
      expect((await svc.estado(1)).ultimaSonda).toEqual({ en: '2026-11-28T15:00:00.000Z', ok: false, motivo: 'llave_puerta_invalida' });
      irA(T0 + 5 * MIN);
      claude.compuerta.registrarBuena('nexara-sonda', 'claude-haiku-5-5', undefined, true);
      expect(await svc.estado(1)).toMatchObject({
        estado: 'ok',
        desde: null,
        ultimaSonda: { en: '2026-11-28T15:05:00.000Z', ok: true, motivo: null },
      });
    });

    it('un fallo posterior a la última llamada buena que no abre el corte ya no deja decir «La IA responde»: cita el fallo y la cuenta', async () => {
      // Antes esta prueba corría con el reloj quieto (la llamada buena y los fallos en el mismo milisegundo) y daba «ok»;
      // en el servidor los fallos siempre llegan después, así que el caso real es este.
      const { svc, claude } = armar();
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      irA(T0 + MIN);
      claude.compuerta.registrarFallo(clasificarFallo(error401()), 'actas', false, 1);
      claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({
        estado: 'con_fallos',
        disponible: false,
        motivo: null,
        fallosSeguidos: 1,
        ultimaBuena: { en: '2026-11-28T15:00:00.000Z', proceso: 'actas' },
        ultimoFallo: { en: '2026-11-28T15:01:00.000Z', motivo: 'error_servicio', proceso: 'actas', detalle: '500 api_error' },
      });
      expect(salud.explicacion).toBe(
        'No se puede confirmar que la IA responda. La puerta o Anthropic contestaron con un error del servidor. ' +
          'Desde la última llamada buena no ha salido otra bien. Van 1 de 3 fallos seguidos para abrir el corte.',
      );
    });

    it('un fallo ANTERIOR a la última llamada buena no cuenta: la IA responde y el fallo queda a la vista', async () => {
      const { svc, claude } = armar();
      claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
      irA(T0 + MIN);
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({
        estado: 'ok',
        disponible: true,
        fallosSeguidos: 0,
        ultimoFallo: { en: '2026-11-28T15:00:00.000Z', motivo: 'error_servicio' },
        ultimaBuena: { en: '2026-11-28T15:01:00.000Z' },
      });
      expect(salud.explicacion).toBe('La IA responde.');
    });

    describe('sin ninguna llamada buena en este proceso', () => {
      it('solo fallos de conexión (la puerta caída no abre el corte) no es «ok»: con_fallos, disponible falso y la explicación cita el fallo', async () => {
        const { svc, claude } = armar();
        const sinConexion = clasificarFallo(new Anthropic.APIConnectionError({ message: 'connect ECONNREFUSED puerta-ia:8080' }));
        expect(sinConexion).toMatchObject({ motivo: 'sin_conexion', cuentaParaCorte: false });
        for (let i = 0; i < 5; i++) {
          irA(T0 + i * MIN);
          claude.compuerta.registrarFallo(sinConexion, 'complejidad-sugerir', false, 1);
        }
        irA(T0 + 6 * MIN);
        claude.compuerta.registrarFallo(sinConexion, 'nexara-sonda', true);

        const salud = await svc.estado(1);
        expect(claude.compuerta.instantanea().estado).toBe('ok'); // la compuerta no se abrió: es justo el hueco que se cierra aquí
        expect(salud).toMatchObject({
          estado: 'con_fallos',
          disponible: false,
          motivo: null,
          desde: null,
          ultimaBuena: null,
          ultimaSonda: { en: '2026-11-28T15:06:00.000Z', ok: false, motivo: 'sin_conexion' },
          ultimoFallo: { motivo: 'sin_conexion', proceso: 'nexara-sonda' },
        });
        expect(salud.explicacion).toBe(
          'No se puede confirmar que la IA responda. No hubo conexión con la puerta o se agotó el tiempo. ' +
            'Este proceso todavía no ha visto una llamada buena.',
        );
      });

      it('un solo fallo del servicio (5xx, tiempo agotado, saturada) ya basta para no decir «ok»', async () => {
        for (const fallo of [error500(), new Anthropic.APIConnectionTimeoutError({ message: 'x' }), new Anthropic.RateLimitError(429, cuerpo('rate_limit_error'), 'x', new Headers())]) {
          const { svc, claude } = armar();
          claude.compuerta.registrarFallo(clasificarFallo(fallo), 'actas', false, 1);
          const salud = await svc.estado(1);
          expect(salud).toMatchObject({ estado: 'con_fallos', disponible: false, ultimaBuena: null });
          expect(salud.explicacion).not.toContain('La IA responde');
        }
      });

      it('un 401 que todavía no llega al umbral tampoco es «ok»: dice que la llave fue rechazada y cuántos van', async () => {
        const { svc, claude } = armar();
        claude.compuerta.registrarFallo(clasificarFallo(error401()), 'actas', false, 1);
        const salud = await svc.estado(1);
        expect(salud).toMatchObject({ estado: 'con_fallos', disponible: false, fallosSeguidos: 1 });
        expect(salud.explicacion).toContain('rechaza la llave de Anthropic');
        expect(salud.explicacion).toContain('Van 1 de 3');
      });

      it('una sonda que falla por un motivo de la solicitud (modelo no permitido) tampoco deja decir «ok»', async () => {
        const { svc, claude } = armar();
        const noPermitido = new Anthropic.BadRequestError(400, cuerpo('invalid_request_error', 'El modelo x no está permitido'), 'x', new Headers());
        claude.compuerta.registrarFallo(clasificarFallo(noPermitido), 'nexara-sonda', true);
        // Una llamada real posterior con una solicitud demasiado grande no borra la causa de la sonda.
        irA(T0 + MIN);
        claude.compuerta.registrarFallo(clasificarFallo(new Anthropic.APIError(413, cuerpo('request_too_large'), 'x', new Headers())), 'actas', false, 1);
        const salud = await svc.estado(1);
        expect(salud).toMatchObject({ estado: 'con_fallos', disponible: false, ultimaSonda: { ok: false, motivo: 'modelo_no_permitido' } });
        expect(salud.explicacion).toContain('no permite el modelo');
      });

      it('solo fallos de UNA solicitud (muy grande, rechazada) no dicen nada de la puerta: sigue «sondeando», nunca «ok»', async () => {
        const { svc, claude } = armar();
        claude.compuerta.registrarFallo(clasificarFallo(new Anthropic.APIError(413, cuerpo('request_too_large'), 'x', new Headers())), 'actas', false, 1);
        claude.compuerta.registrarFallo(clasificarFallo(new Anthropic.BadRequestError(400, cuerpo('invalid_request_error'), 'x', new Headers())), 'actas', false, 1);
        const salud = await svc.estado(1);
        expect(salud).toMatchObject({ estado: 'sondeando', disponible: true, ultimaBuena: null, ultimoFallo: { motivo: 'solicitud_rechazada' } });
        expect(salud.explicacion).not.toContain('La IA responde');
      });

      it('en cuanto una llamada sale bien después de los fallos, pasa a «ok»', async () => {
        const { svc, claude } = armar();
        claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
        expect((await svc.estado(1)).estado).toBe('con_fallos');
        irA(T0 + MIN);
        claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
        expect(await svc.estado(1)).toMatchObject({ estado: 'ok', disponible: true, explicacion: 'La IA responde.' });
      });

      it('con la compuerta apagada o sin configurar no se vuelve «con_fallos»: manda ese estado', async () => {
        const apagada = armar({ modo: 'apagado' });
        apagada.claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1); // apagada: no cuenta
        expect((await apagada.svc.estado(1)).estado).toBe('sin_vigilar');
        const sinLlave = armar();
        sinLlave.claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
        delete process.env.ANTHROPIC_API_KEY;
        expect((await sinLlave.svc.estado(1)).estado).toBe('sin_configurar');
      });

      it('con una caída abierta sigue mandando «caida»', async () => {
        const { svc, claude } = armar();
        claude.compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
        irA(T0 + MIN);
        caer(claude);
        expect((await svc.estado(1)).estado).toBe('caida');
      });
    });

    it('sin llave o sin puerta no está configurada: disponible es falso y no se inventa un estado', async () => {
      const { svc } = armar();
      delete process.env.ANTHROPIC_API_KEY;
      expect(await svc.estado(1)).toMatchObject({ estado: 'sin_configurar', configurada: false, disponible: false });
    });

    it('con la compuerta apagada avisa que no se vigila nada', async () => {
      const { svc, claude } = armar({ modo: 'apagado' });
      caer(claude); // apagada: no cuenta
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({ estado: 'sin_vigilar', modo: 'apagado', disponible: true, fallosSeguidos: 0, ultimoFallo: null });
      expect(salud.explicacion).toContain('no es confiable');
    });

    it('si el cupo del día ya se acabó, disponible es falso aunque la puerta esté sana', async () => {
      const { svc, claude } = armar();
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      process.env.CLAUDE_TOPE_DIARIO = '4';
      (claude as any).llamadasPorDia.set('1:2026-11-28', 4);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({ estado: 'ok', disponible: false, hoy: { cupo: { tope: 4, usadas: 4 } } });
      expect(salud.explicacion).toContain('cupo');
      // Otra empresa no ha gastado nada.
      expect(await svc.estado(2)).toMatchObject({ disponible: true, hoy: { cupo: { tope: 4, usadas: 0 } } });
    });

    it('consultar no cambia nada: ni la compuerta ni el cupo', async () => {
      const { svc, claude } = armar();
      caer(claude);
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      const antes = JSON.stringify({ compuerta: claude.compuerta.instantanea(), cupo: claude.cupoDelDia(1) });
      const primera = await svc.estado(1);
      const segunda = await svc.estado(1);
      expect(segunda).toEqual(primera);
      expect(JSON.stringify({ compuerta: claude.compuerta.instantanea(), cupo: claude.cupoDelDia(1) })).toBe(antes);
    });
  });

  describe('qué ve cada empresa', () => {
    it('las cuentas por proceso son solo de la empresa que consulta (dos empresas en el Map, una consulta)', async () => {
      const { svc, claude } = armar();
      const c = claude.compuerta;
      c.registrarBuena('actas', 'claude-haiku-5-5', 1);
      c.registrarBuena('actas', 'claude-haiku-5-5', 1);
      c.registrarFallo(clasificarFallo(error401()), 'actas', false, 1);
      c.registrarFallo(clasificarFallo(error500()), 'triage', false, 1);
      c.registrarBuena('cotizar-secreta-de-la-otra', 'claude-haiku-5-5', 2);
      c.registrarBuena('cotizar-secreta-de-la-otra', 'claude-haiku-5-5', 2);
      c.registrarBuena('cotizar-secreta-de-la-otra', 'claude-haiku-5-5', 2);

      const uno = await svc.estado(1);
      expect(uno.hoy.porProceso).toEqual([
        { proceso: 'actas', llamadas: 3, buenas: 2, fallosSinCosto: 1, fallosOtros: 0 },
        { proceso: 'triage', llamadas: 1, buenas: 0, fallosSinCosto: 0, fallosOtros: 1 },
      ]);
      expect(JSON.stringify(uno.hoy)).not.toContain('cotizar-secreta-de-la-otra');

      const dos = await svc.estado(2);
      expect(dos.hoy.porProceso).toEqual([{ proceso: 'cotizar-secreta-de-la-otra', llamadas: 3, buenas: 3, fallosSinCosto: 0, fallosOtros: 0 }]);
      expect(JSON.stringify(dos.hoy)).not.toContain('actas');

      expect((await svc.estado(3)).hoy.porProceso).toEqual([]);
    });

    it('todas las consultas de la base llevan la empresa pedida', async () => {
      const { svc, prisma, claude } = armar({ tarjeta: { entityType: 'IA_VOLVIO', createdAt: new Date(T0) } });
      caer(claude); // para que también pida la tarjeta
      await svc.estado(7);

      const sql = prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
      expect(sql.sql).toMatch(/a\."companyId" = \?/);
      expect(sql.sql).toMatch(/a\."deletedAt" IS NULL/);
      expect(sql.values).toContain(7);
      expect(sql.values).not.toContain(8);

      expect((prisma.activity.findFirst.mock.calls[0][0] as any).where).toMatchObject({ companyId: 7 });
      expect((prisma.meetingRecording.count.mock.calls[0][0] as any).where).toMatchObject({ companyId: 7, estado: 'ERROR', error: { contains: 'IA' } });
      expect((prisma.vehicleControl.count.mock.calls[0][0] as any).where).toMatchObject({
        companyId: 7,
        analisisDanosEstatus: { in: ['SIN_IA', 'ERROR'] },
      });
    });

    it('la tarjeta de la caída solo se lee de la cuenta de desarrollo, por categoría y tipo, sin traer títulos ni textos', async () => {
      const { svc, prisma, claude } = armar({ tarjeta: null });
      caer(claude);
      await svc.estado(1);
      const args = prisma.notification.findFirst.mock.calls[0][0] as any;
      expect(args.where).toMatchObject({ category: 'ia-estado', user: { email: 'developer@nexara.com.mx' } });
      expect(args.select).toEqual({ entityType: true, createdAt: true });
    });

    it('sin empresa no se pregunta nada', async () => {
      const { svc, prisma } = armar();
      for (const empresa of [null, undefined, 0, -1, Number.NaN]) {
        await expect(svc.estado(empresa as never)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.activity.findFirst).not.toHaveBeenCalled();
      expect(prisma.meetingRecording.count).not.toHaveBeenCalled();
      expect(prisma.vehicleControl.count).not.toHaveBeenCalled();
      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('desde, si el API se reinició durante la caída', () => {
    it('toma el de la tarjeta si es anterior al de la memoria', async () => {
      const antes = new Date(T0 - 5 * 60 * MIN);
      const { svc, claude } = armar({ tarjeta: { entityType: 'IA_CAIDA', createdAt: antes } });
      irA(T0 + 10 * MIN);
      caer(claude); // el proceso nuevo vuelve a detectarla diez minutos después de arrancar
      expect((await svc.estado(1)).desde).toBe(antes.toISOString());
    });

    it('toma el de la memoria si la tarjeta es posterior', async () => {
      const despues = new Date(T0 + 30 * MIN);
      const { svc, claude } = armar({ tarjeta: { entityType: 'IA_CAIDA', createdAt: despues } });
      caer(claude);
      expect((await svc.estado(1)).desde).toBe(new Date(T0).toISOString());
    });

    it('una última tarjeta de «volvió» (o ninguna) no cambia nada', async () => {
      for (const tarjeta of [{ entityType: 'IA_VOLVIO', createdAt: new Date(T0 - 60 * MIN) }, null]) {
        const { svc, claude } = armar({ tarjeta });
        caer(claude);
        expect((await svc.estado(1)).desde).toBe(new Date(T0).toISOString());
      }
    });

    it('con la IA respondiendo no se lee ninguna tarjeta: una vieja sin cerrar es asunto de la guardia', async () => {
      const { svc, claude, prisma } = armar({ tarjeta: { entityType: 'IA_CAIDA', createdAt: new Date(T0 - 60 * MIN) } });
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      expect((await svc.estado(1)).desde).toBeNull();
      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    });

    it('si la base de las tarjetas falla, sale con la hora de la memoria y lo avisa en sinDatos', async () => {
      const { svc, claude } = armar({ tarjeta: new Error('conexión caída: select * from notifications where …') });
      caer(claude);
      const salud = await svc.estado(1);
      expect(salud).toMatchObject({ estado: 'caida', desde: new Date(T0).toISOString(), sinDatos: ['tarjeta_caida'] });
    });
  });

  describe('las señales de la base', () => {
    it('complejidadPorDia pasa lo que cuenta la base (fecha, texto o BigInt) y calcula el porcentaje', async () => {
      const { svc } = armar({
        filas: [
          { dia: new Date('2026-11-28T00:00:00Z'), total: 13, con_sugerencia: BigInt(0) },
          { dia: '2026-11-27', total: 14, con_sugerencia: 0 },
          { dia: new Date('2026-11-21T00:00:00Z'), total: 28, con_sugerencia: 26 },
          { dia: new Date('2026-11-20T00:00:00Z'), total: 0, con_sugerencia: 0 },
        ],
      });
      expect((await svc.estado(1)).senales.complejidadPorDia).toEqual([
        { dia: '2026-11-28', total: 13, conSugerencia: 0, porcentaje: 0 },
        { dia: '2026-11-27', total: 14, conSugerencia: 0, porcentaje: 0 },
        { dia: '2026-11-21', total: 28, conSugerencia: 26, porcentaje: 92.9 },
        { dia: '2026-11-20', total: 0, conSugerencia: 0, porcentaje: null },
      ]);
    });

    it('la consulta cuenta por día de México, solo las actividades vivas de ocho días atrás', async () => {
      const { svc, prisma } = armar();
      await svc.estado(1);
      const sql = prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
      expect(sql.sql).toContain(`AT TIME ZONE 'UTC'`);
      expect(sql.sql).toContain('GROUP BY 1');
      expect(sql.values).toContain('America/Mexico_City');
      const desde = sql.values.find((v) => v instanceof Date) as Date;
      expect(desde.getTime()).toBe(T0 - 8 * 86_400_000);
    });

    it('trae las reuniones y los usos de vehículo que quedaron sin IA, y la última actividad con sugerencia (solo número y fecha)', async () => {
      const fecha = new Date('2026-11-21T22:10:00Z');
      const { svc, prisma } = armar({ reuniones: 1, vehiculos: 2, ultimaActividad: { id: 712, fechaAsignacion: fecha } });
      const { senales } = await svc.estado(1);
      expect(senales.pendientesPorCaida).toEqual({ reunionesConError: 1, usosDeVehiculoSinIa: 2 });
      expect(senales.ultimaSenalEnBase).toEqual({ actividadId: 712, fechaAsignacion: '2026-11-21T22:10:00.000Z' });
      expect((prisma.activity.findFirst.mock.calls[0][0] as any).select).toEqual({ id: true, fechaAsignacion: true });
    });

    it('una señal que falla no tumba la respuesta: sale vacía y se anota, sin el mensaje del error', async () => {
      const { svc, avisos } = armar({ filas: new Error('relation "Activity" does not exist: secreto-de-la-consulta') });
      const salud = await svc.estado(1);
      expect(salud.senales.complejidadPorDia).toBeNull();
      expect(salud.senales.pendientesPorCaida).toEqual({ reunionesConError: 0, usosDeVehiculoSinIa: 0 });
      expect(salud.sinDatos).toEqual(['complejidad_por_dia']);
      expect(JSON.stringify(salud)).not.toContain('secreto-de-la-consulta');
      expect(avisos.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('secreto-de-la-consulta');
    });
  });

  describe('la puerta nunca muestra llaves ni tokens', () => {
    it('solo el anfitrión: ni la llave, ni el usuario o la clave de la URL, ni la ruta o los parámetros', async () => {
      const { svc, claude } = armar();
      caer(claude);
      claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      const texto = JSON.stringify(await svc.estado(1));
      expect(texto).toContain('"puerta":"puerta-ia:8080"');
      expect(texto).not.toContain(process.env.ANTHROPIC_API_KEY as string);
      expect(texto).not.toContain(LLAVE);
      expect(texto).not.toContain(SECRETO_EN_URL);
      expect(texto).not.toContain('usuario');
      expect(texto).not.toContain('/v1/mensajes');
      expect(texto).not.toMatch(/pia_/);
    });

    it('el detalle del último fallo es solo estado y tipo, nunca el mensaje de la puerta', async () => {
      const { svc, claude } = armar();
      const malo = new Anthropic.AuthenticationError(401, cuerpo('authentication_error', `llave ${LLAVE} inválida`), `llave ${LLAVE} inválida`, new Headers());
      claude.compuerta.registrarFallo(clasificarFallo(malo), 'actas', false, 1);
      const texto = JSON.stringify(await svc.estado(1));
      expect(texto).not.toContain(LLAVE);
      expect(texto).toContain('401 authentication_error');
    });

    it.each([
      ['http://puerta-ia:8080', 'puerta-ia:8080'],
      ['https://ia.zynoratek.com', 'ia.zynoratek.com'],
      ['https://ia.zynoratek.com/', 'ia.zynoratek.com'],
      ['http://usuario:clave@puerta-ia:8080/ruta?a=b#c', 'puerta-ia:8080'],
      ['  http://puerta-ia:8080  ', 'puerta-ia:8080'],
      ['puerta-ia:8080', null],
      ['no es una url', null],
      ['', null],
      [undefined, null],
    ])('anfitrionDeLaPuerta(%p) = %p', (base, esperado) => {
      expect(anfitrionDeLaPuerta(base as string | undefined)).toBe(esperado);
    });

    it('sin CLAUDE_BASE_URL la puerta es null', async () => {
      const { svc } = armar();
      delete process.env.CLAUDE_BASE_URL;
      expect((await svc.estado(1)).puerta).toBeNull();
    });
  });
});

/**
 * Contra Postgres de verdad (se salta sin `NEXARA_PRUEBAS_URL`): el SQL del día de México, el filtro por empresa y las
 * demás consultas las hace la base, no la prueba.
 */
conBaseDesechable('GET /ai/salud contra Postgres', (base) => {
  const llave = process.env.ANTHROPIC_API_KEY;
  const puerta = process.env.CLAUDE_BASE_URL;
  const modo = process.env.IA_COMPUERTA_MODO;
  beforeEach(() => {
    reiniciarCachePiloto();
    process.env.ANTHROPIC_API_KEY = LLAVE;
    process.env.CLAUDE_BASE_URL = PUERTA;
    process.env.IA_COMPUERTA_MODO = 'observar';
  });
  afterEach(() => {
    for (const [nombre, valor] of [['ANTHROPIC_API_KEY', llave], ['CLAUDE_BASE_URL', puerta], ['IA_COMPUERTA_MODO', modo]] as const) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  });

  async function sembrar() {
    const [e1, e2] = await Promise.all([
      base.prisma.companyProfile.create({ data: { legalName: 'Empresa uno', rfc: 'AAA010101AAA' } }),
      base.prisma.companyProfile.create({ data: { legalName: 'Empresa dos', rfc: 'BBB020202BBB' } }),
    ]);
    const rol = await base.prisma.role.create({ data: { nombre: 'Rol de prueba salud' } });
    const dep = await base.prisma.department.create({ data: { nombre: 'General', companyId: e1.id } });
    const nuevaPersona = (email: string) =>
      base.prisma.user.create({
        data: { nombre: email.split('@')[0], email, passwordHash: 'no-es-una-contrasena', roleId: rol.id, roleKey: 'ceo', departmentId: dep.id },
      });
    const sembrada = await base.prisma.user.findUnique({ where: { email: 'developer@nexara.com.mx' } });
    const desarrollo = sembrada ?? (await nuevaPersona('developer@nexara.com.mx'));
    const otra = await nuevaPersona('otra.persona@nexara.com.mx');
    let n = 0;
    const actividad = (companyId: number, fechaAsignacion: Date, extra: { complejidadSugerida?: string; deletedAt?: Date } = {}) =>
      base.prisma.activity.create({
        data: {
          anNumber: `AN-${++n}`,
          titulo: `Actividad ${n}`,
          creadoPorId: desarrollo.id,
          responsableId: desarrollo.id,
          companyId,
          fechaAsignacion,
          ...extra,
        },
      });
    return { e1, e2, desarrollo, otra, actividad };
  }

  const servicio = () => {
    const claude = new ClaudeService();
    claude.compuerta.modo = 'observar';
    const svc = new SaludIaService(claude, base.prisma as never);
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    return { svc, claude };
  };

  it('cuenta las actividades por día de MÉXICO (no UTC), solo de la empresa pedida, vivas y de los últimos ocho días', async () => {
    const { e1, e2, actividad } = await sembrar();
    // 27-11 en México: de 06:00 UTC del 27 a 05:59:59 UTC del 28.
    await actividad(e1.id, new Date('2026-11-28T05:59:00Z'), { complejidadSugerida: 'BASICA' }); // 27-11 23:59 MX
    await actividad(e1.id, new Date('2026-11-28T03:00:00Z'), { complejidadSugerida: 'ESTANDAR' }); // 27-11 21:00 MX
    await actividad(e1.id, new Date('2026-11-27T20:00:00Z')); // 27-11 14:00 MX, sin sugerencia
    // 28-11 en México.
    await actividad(e1.id, new Date('2026-11-28T06:01:00Z')); // 28-11 00:01 MX
    await actividad(e1.id, new Date('2026-11-28T14:00:00Z'), { complejidadSugerida: 'COMPLEJA' });
    // Fuera: borrada, de otra empresa, de hace más de ocho días.
    await actividad(e1.id, new Date('2026-11-28T14:30:00Z'), { complejidadSugerida: 'BASICA', deletedAt: new Date('2026-11-28T15:00:00Z') });
    await actividad(e2.id, new Date('2026-11-28T14:00:00Z'), { complejidadSugerida: 'BASICA' });
    await actividad(e2.id, new Date('2026-11-28T14:10:00Z'));
    await actividad(e1.id, new Date('2026-11-10T14:00:00Z'), { complejidadSugerida: 'BASICA' });

    const { svc } = servicio();
    const ahora = Date.UTC(2026, 10, 28, 15, 0, 0);
    const filas = await (svc as any).complejidadPorDia(e1.id, ahora);
    expect(filas).toEqual([
      { dia: '2026-11-28', total: 2, conSugerencia: 1, porcentaje: 50 },
      { dia: '2026-11-27', total: 3, conSugerencia: 2, porcentaje: 66.7 },
    ]);
    // La otra empresa solo ve lo suyo.
    expect(await (svc as any).complejidadPorDia(e2.id, ahora)).toEqual([{ dia: '2026-11-28', total: 2, conSugerencia: 1, porcentaje: 50 }]);
  });

  it('estado() de punta a punta: la última señal es la de la empresa, y las cuentas en memoria también', async () => {
    const { e1, e2, actividad } = await sembrar();
    const hace = (h: number) => new Date(Date.now() - h * 3_600_000);
    const ultima = await actividad(e1.id, hace(30), { complejidadSugerida: 'BASICA' });
    await actividad(e1.id, hace(2)); // más nueva, pero sin sugerencia
    await actividad(e2.id, hace(1), { complejidadSugerida: 'CRITICA' }); // más nueva todavía, de otra empresa
    const { svc, claude } = servicio();
    claude.compuerta.registrarBuena('actas', 'claude-haiku-5-5', e1.id);
    claude.compuerta.registrarBuena('otra-funcion', 'claude-haiku-5-5', e2.id);

    const salud = await svc.estado(e1.id);
    expect(salud.sinDatos).toEqual([]);
    expect(salud.senales.ultimaSenalEnBase).toEqual({ actividadId: ultima.id, fechaAsignacion: ultima.fechaAsignacion.toISOString() });
    expect(salud.senales.complejidadPorDia?.reduce((suma, fila) => suma + fila.total, 0)).toBe(2);
    expect(salud.senales.pendientesPorCaida).toEqual({ reunionesConError: 0, usosDeVehiculoSinIa: 0 });
    expect(salud.hoy.porProceso.map((p) => p.proceso)).toEqual(['actas']);
    expect(salud.estado).toBe('ok');
  });

  it('la tarjeta sin cerrar sale de la cuenta de desarrollo y pone el desde más viejo; la de otra persona no cuenta', async () => {
    const { desarrollo, otra } = await sembrar();
    const tarjeta = (userId: number, entityType: string, createdAt: Date) =>
      base.prisma.notification.create({
        data: { userId, type: 'WORKFLOW_PENDING', category: 'ia-estado', entityType, title: 'La IA', message: 'x', createdAt },
      });
    const caida = new Date(Date.now() - 3 * 3_600_000);
    await tarjeta(desarrollo.id, 'IA_VOLVIO', new Date(Date.now() - 10 * 3_600_000));
    await tarjeta(desarrollo.id, 'IA_CAIDA', caida);
    // Una tarjeta más nueva, pero de otra persona: no se lee.
    await tarjeta(otra.id, 'IA_VOLVIO', new Date(Date.now() - 1 * 3_600_000));

    const { svc, claude } = servicio();
    for (let i = 0; i < 3; i++) claude.compuerta.registrarFallo(clasificarFallo(error401()), 'actas', false, 1);
    const salud = await svc.estado((await base.prisma.companyProfile.findFirstOrThrow()).id);
    expect(salud.estado).toBe('caida');
    expect(salud.desde).toBe(caida.toISOString());

    // Si lo último de desarrollo es «volvió», no cambia el desde de la memoria.
    await tarjeta(desarrollo.id, 'IA_VOLVIO', new Date(Date.now() - 60_000));
    const otraVez = await svc.estado((await base.prisma.companyProfile.findFirstOrThrow()).id);
    expect(new Date(otraVez.desde as string).getTime()).toBeGreaterThan(caida.getTime());
  });
});
