import Anthropic from '@anthropic-ai/sdk';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { reiniciarCachePiloto } from '../../common/piloto/interruptor-piloto';
import { runWithTenant, tenantStorage } from '../../common/tenant/tenant-context';
import { ClaudeService } from './claude.service';
import { clasificarFallo } from './compuerta-ia';
import { GuardiaIaService } from './guardia-ia.service';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 28, 15, 0, 0);

function respuestaOk() {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: 'ok', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

/** `ClaudeService` real con base simulada (modo del interruptor) y un cliente cuyo `create` se pasa. */
function servicioReal(create: jest.Mock, modo: string | null) {
  process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
  const findFirst = jest.fn(async (_args: unknown) => (modo === null ? null : { value: modo }));
  const claude = new ClaudeService({ systemSetting: { findFirst } } as any);
  (claude as any).cliente = { messages: { create } };
  jest.spyOn((claude as any).logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn((claude as any).logger, 'error').mockImplementation(() => undefined);
  jest.spyOn((claude as any).logger, 'log').mockImplementation(() => undefined);
  return claude;
}

describe('GuardiaIaService', () => {
  const previo = {
    llave: process.env.ANTHROPIC_API_KEY,
    nodeEnv: process.env.NODE_ENV,
    relevo: process.env.NEXARA_RELEVO,
  };
  let ahora: jest.SpyInstance<number, []> | undefined;
  const irA = (t: number) => {
    ahora?.mockRestore();
    ahora = jest.spyOn(Date, 'now').mockReturnValue(t);
  };
  const restaurar = (nombre: string, valor: string | undefined) => {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  };

  beforeEach(() => {
    reiniciarCachePiloto();
    delete process.env.IA_SONDA_MINUTOS;
    delete process.env.IA_COMPUERTA_MODO;
  });
  afterEach(() => {
    ahora?.mockRestore();
    ahora = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
    restaurar('ANTHROPIC_API_KEY', previo.llave);
    restaurar('NODE_ENV', previo.nodeEnv);
    restaurar('NEXARA_RELEVO', previo.relevo);
  });

  describe('vuelta()', () => {
    it('con la compuerta ok y el modo apagado no hace nada', async () => {
      const create = jest.fn().mockResolvedValue(respuestaOk());
      const guardia = new GuardiaIaService(servicioReal(create, 'apagado'));
      expect(await guardia.vuelta()).toBe(false);
      irA(T0 + 60 * MIN);
      expect(await guardia.vuelta()).toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it('en modo observar sondea una vez, no repite antes de 30 min y repite al cumplirse', async () => {
      irA(T0);
      const create = jest.fn().mockResolvedValue(respuestaOk());
      const guardia = new GuardiaIaService(servicioReal(create, 'observar'));
      expect(await guardia.vuelta()).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][1].headers).toEqual({ 'x-proceso': 'nexara-sonda' });
      for (const minutos of [1, 2, 15, 29]) {
        irA(T0 + minutos * MIN);
        expect(await guardia.vuelta()).toBe(false);
      }
      expect(create).toHaveBeenCalledTimes(1);
      irA(T0 + 30 * MIN);
      expect(await guardia.vuelta()).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('con la compuerta en caída sondea al llegar el próximo intento, y cierra la caída si la puerta ya responde', async () => {
      irA(T0);
      const create = jest.fn().mockRejectedValue(
        new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', new Headers()),
      );
      const claude = servicioReal(create, 'activo');
      const guardia = new GuardiaIaService(claude);
      await guardia.vuelta(); // la primera sonda cae al instante
      expect(claude.compuerta.instantanea().estado).toBe('caida');
      irA(T0 + 4 * MIN);
      expect(await guardia.vuelta()).toBe(false);
      create.mockResolvedValue(respuestaOk());
      irA(T0 + 5 * MIN);
      expect(await guardia.vuelta()).toBe(true);
      expect(claude.compuerta.instantanea().estado).toBe('ok');
      expect(claude.disponible()).toBe(true);
    });

    it('no se encima: una vuelta que sigue en curso hace que la siguiente se salte', async () => {
      irA(T0);
      let soltar: (v: unknown) => void = () => undefined;
      const create = jest.fn().mockImplementation(() => new Promise((resolver) => (soltar = resolver)));
      const guardia = new GuardiaIaService(servicioReal(create, 'observar'));
      const primera = guardia.vuelta();
      await new Promise((r) => setImmediate(r));
      expect(await guardia.vuelta()).toBe(false);
      soltar(respuestaOk());
      expect(await primera).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('nunca lanza: un error de adentro se anota y la vuelta siguiente sigue funcionando', async () => {
      const sondearSiToca = jest.fn().mockRejectedValueOnce(new Error('se cayó')).mockResolvedValue(true);
      const guardia = new GuardiaIaService({ sondearSiToca } as unknown as ClaudeService);
      const aviso = jest.spyOn((guardia as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(guardia.vuelta()).resolves.toBe(false);
      expect(aviso).toHaveBeenCalledTimes(1);
      await expect(guardia.vuelta()).resolves.toBe(true);
    });
  });

  describe('en Nest', () => {
    it('Nest resuelve ClaudeService con PrismaService (opcional) y GuardiaIaService con ClaudeService', async () => {
      process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
      const findFirst = jest.fn(async (_args: unknown) => ({ value: 'activo' }));
      const modulo = await Test.createTestingModule({
        providers: [ClaudeService, GuardiaIaService, { provide: PrismaService, useValue: { systemSetting: { findFirst } } }],
      }).compile();
      const claude = modulo.get(ClaudeService);
      expect(modulo.get(GuardiaIaService)).toBeInstanceOf(GuardiaIaService);
      // De verdad recibió la base: lee el interruptor de ella y no del entorno.
      expect(await claude.modoIa('ia.compuerta.modo')).toBe('activo');
      expect(findFirst).toHaveBeenCalledTimes(1);
      await modulo.close();
    });

    it('sin PrismaService en el contenedor también arranca (queda como los evals)', async () => {
      const modulo = await Test.createTestingModule({ providers: [ClaudeService, GuardiaIaService] }).compile();
      expect(await modulo.get(ClaudeService).modoIa('ia.compuerta.modo')).toBe('apagado');
      await modulo.close();
    });
  });

  describe('programación', () => {
    const falso = () => ({ sondearSiToca: jest.fn().mockResolvedValue(false) });

    it('en pruebas no programa nada', () => {
      process.env.NODE_ENV = 'test';
      const setInterval = jest.spyOn(global, 'setInterval');
      const setTimeout = jest.spyOn(global, 'setTimeout');
      const guardia = new GuardiaIaService(falso() as unknown as ClaudeService);
      guardia.onApplicationBootstrap();
      expect(setInterval).not.toHaveBeenCalled();
      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('en el contenedor de relevo de un despliegue tampoco corre', () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXARA_RELEVO = '1';
      const setInterval = jest.spyOn(global, 'setInterval');
      const guardia = new GuardiaIaService(falso() as unknown as ClaudeService);
      guardia.onApplicationBootstrap();
      expect(setInterval).not.toHaveBeenCalled();
    });

    it('programa una primera vuelta a los 45 s y luego una cada minuto, con los timers sin referencia', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.NEXARA_RELEVO;
      const unref = jest.fn();
      const intervalo = jest.spyOn(global, 'setInterval').mockReturnValue({ unref } as unknown as NodeJS.Timeout);
      const espera = jest.spyOn(global, 'setTimeout').mockReturnValue({ unref } as unknown as NodeJS.Timeout);
      const guardia = new GuardiaIaService(falso() as unknown as ClaudeService);
      guardia.onApplicationBootstrap();
      expect(espera).toHaveBeenCalledWith(expect.any(Function), 45_000);
      expect(intervalo).toHaveBeenCalledWith(expect.any(Function), 60_000);
      expect(unref).toHaveBeenCalledTimes(2);
    });

    it('con timers falsos corre a los 45 s, a los 60 s y cada minuto, y deja de correr al apagar el módulo', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.NEXARA_RELEVO;
      jest.useFakeTimers();
      const claude = falso();
      const guardia = new GuardiaIaService(claude as unknown as ClaudeService);
      guardia.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(44_999);
      expect(claude.sondearSiToca).toHaveBeenCalledTimes(0);
      await jest.advanceTimersByTimeAsync(1);
      expect(claude.sondearSiToca).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(15_000);
      expect(claude.sondearSiToca).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(claude.sondearSiToca).toHaveBeenCalledTimes(3);
      guardia.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(10 * MIN);
      expect(claude.sondearSiToca).toHaveBeenCalledTimes(3);
    });

    it('si programar falla, lo anota y no tumba el arranque', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.NEXARA_RELEVO;
      jest.spyOn(global, 'setTimeout').mockImplementation(() => {
        throw new Error('sin timers');
      });
      const guardia = new GuardiaIaService(falso() as unknown as ClaudeService);
      const aviso = jest.spyOn((guardia as any).logger, 'warn').mockImplementation(() => undefined);
      expect(() => guardia.onApplicationBootstrap()).not.toThrow();
      expect(aviso).toHaveBeenCalledTimes(1);
    });
  });
});

// ── El aviso de «la IA cayó» y «la IA volvió» ───────────────────────────────────────────────────────────────────────

const CLASE_401 = clasificarFallo(
  new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', new Headers()),
);

type Tarjeta = {
  id: number;
  userId: number;
  category: string;
  entityType: string;
  title: string;
  message: string;
  createdAt: Date;
};
type Persona = { id: number; email: string; puesto: string | null; managerId: number | null; roleKey: string | null };

type OpcionesMundo = {
  /** `null` = no hay cuenta de desarrollo activa. */
  desarrollo?: { id: number } | null;
  /** `null` = el dueño no tiene empresa. Por omisión, la empresa 1. */
  empresaDelDueno?: number | null;
  /** Lo que dice la fila de `ia.aviso_direccion.modo` (`undefined` = no hay fila). */
  modoDireccion?: string;
  personasDireccion?: Persona[];
  tarjetas?: Tarjeta[];
};

/**
 * La base y el centro de avisos simulados, COMPARTIDOS entre los «contenedores» de una prueba. Cada llamada anota si
 * corrió con el filtro de empresa quitado (`bypass`) y con qué empresa activa.
 */
function mundo(opciones: OpcionesMundo = {}) {
  const tarjetas: Tarjeta[] = [...(opciones.tarjetas ?? [])];
  const contexto: Array<{ llamada: string; bypass: boolean | undefined; companyId: number | null | undefined }> = [];
  const ver = (llamada: string) => {
    const almacen = tenantStorage.getStore();
    contexto.push({ llamada, bypass: almacen?.bypass, companyId: almacen?.companyId });
  };
  let siguienteId = 1000;
  const desarrollo = opciones.desarrollo === undefined ? { id: 7 } : opciones.desarrollo;
  const empresaDelDueno = opciones.empresaDelDueno === undefined ? 1 : opciones.empresaDelDueno;

  const prisma = {
    user: {
      findFirst: jest.fn(async (args: any) => {
        ver('user.findFirst');
        if (args.where.email === 'developer@nexara.com.mx') return desarrollo;
        if (args.where.email === 'gerencia@nexara.com.mx') {
          return { companyMemberships: empresaDelDueno == null ? [] : [{ companyId: empresaDelDueno }] };
        }
        return null;
      }),
      findMany: jest.fn(async (_args: any) => {
        ver('user.findMany');
        return opciones.personasDireccion ?? [];
      }),
    },
    systemSetting: {
      findFirst: jest.fn(async (_args: any) => {
        ver('systemSetting.findFirst');
        return opciones.modoDireccion === undefined ? null : { value: opciones.modoDireccion };
      }),
    },
    notification: {
      findFirst: jest.fn(async (args: any) => {
        ver('notification.findFirst');
        const { userId, category, createdAt } = args.where;
        return (
          tarjetas
            .filter((t) => t.userId === userId && t.category === category && t.createdAt >= createdAt.gte)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
            .map((t) => ({ entityType: t.entityType, createdAt: t.createdAt }))[0] ?? null
        );
      }),
    },
  };
  const notifications = {
    createNotification: jest.fn(async (p: any) => {
      ver('createNotification');
      const tarjeta: Tarjeta = {
        id: siguienteId++,
        userId: p.userId,
        category: p.category,
        entityType: p.entityType,
        title: p.title,
        message: p.message,
        createdAt: new Date(),
      };
      tarjetas.push(tarjeta);
      return { id: tarjeta.id };
    }),
  };
  return { prisma, notifications, tarjetas, contexto };
}
type Mundo = ReturnType<typeof mundo>;

/** Un proceso del API: su propia compuerta (en `observar`) y su propia guardia, conectadas al mismo mundo. */
function contenedor(m: Mundo, modo: 'apagado' | 'observar' | 'activo' = 'observar') {
  const claude = new ClaudeService();
  claude.compuerta.modo = modo;
  for (const nivel of ['log', 'warn', 'error'] as const) {
    jest.spyOn((claude as any).logger, nivel).mockImplementation(() => undefined);
  }
  const guardia = new GuardiaIaService(
    claude,
    m.prisma as unknown as PrismaService,
    m.notifications as unknown as NotificationsService,
  );
  const aviso = jest.spyOn((guardia as any).logger, 'warn').mockImplementation(() => undefined);
  const nota = jest.spyOn((guardia as any).logger, 'log').mockImplementation(() => undefined);
  guardia.onModuleInit();
  return { claude, guardia, aviso, nota };
}

/** Tres fallos seguidos de la llave: abre la caída. */
const caer = (claude: ClaudeService) => {
  for (let i = 0; i < 3; i++) claude.compuerta.registrarFallo(CLASE_401, 'proceso-x', false, 5);
};
/** Una llamada buena: cierra la caída. */
const volver = (claude: ClaudeService) => claude.compuerta.registrarBuena('proceso-x', 'claude-haiku-5-5', 5);
const entidades = (m: Mundo) => m.tarjetas.map((t) => t.entityType);
const minutosAtras = (n: number) => new Date(Date.now() - n * MIN);
const horasAtras = (n: number) => minutosAtras(n * 60);
const diasAtras = (n: number) => horasAtras(n * 24);
/** La tarjeta de «la IA dejó de responder» que quedó de antes (sin «volvió» después). */
const tarjetaCaida = (createdAt: Date, userId = 7): Tarjeta => ({
  id: 1,
  userId,
  category: 'ia-estado',
  entityType: 'IA_CAIDA',
  title: 'La IA de NEXARA dejó de responder',
  message: 'm',
  createdAt,
});

describe('GuardiaIaService: aviso de la caída y del regreso de la IA', () => {
  beforeEach(() => {
    reiniciarCachePiloto();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('qué tarjeta sale', () => {
    it('la caída crea UNA tarjeta informativa para la cuenta de desarrollo, con todo lo que pide el centro de avisos', async () => {
      const m = mundo();
      const a = contenedor(m);
      // Los dos primeros fallos no abren la caída: todavía no hay nada que avisar.
      a.claude.compuerta.registrarFallo(CLASE_401, 'proceso-x', false, 5);
      a.claude.compuerta.registrarFallo(CLASE_401, 'proceso-x', false, 5);
      await a.guardia.esperarAvisos();
      expect(m.notifications.createNotification).not.toHaveBeenCalled();

      a.claude.compuerta.registrarFallo(CLASE_401, 'proceso-x', false, 5);
      await a.guardia.esperarAvisos();
      expect(m.prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'developer@nexara.com.mx', isActive: true },
        select: { id: true },
      });
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(m.notifications.createNotification).toHaveBeenCalledWith({
        userId: 7,
        type: 'WORKFLOW_PENDING',
        category: 'ia-estado',
        entityType: 'IA_CAIDA',
        title: 'La IA de NEXARA dejó de responder',
        message: expect.stringContaining('la puerta de IA rechaza la llave de Anthropic (3 intentos seguidos)'),
        priority: 'high',
        relatedUrl: '/erp/notifications-center',
        collapseKey: 'nx_ia_estado_u7',
        entrega: 'siempre',
        dedupeSeconds: 0,
      });
    });

    it('al volver, la segunda tarjeta (IA_VOLVIO) con la misma llave de colapso, en prioridad normal', async () => {
      const m = mundo();
      const a = contenedor(m);
      caer(a.claude);
      volver(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      expect(m.notifications.createNotification).toHaveBeenLastCalledWith(
        expect.objectContaining({
          userId: 7,
          category: 'ia-estado',
          entityType: 'IA_VOLVIO',
          title: 'La IA de NEXARA ya responde otra vez',
          message: expect.stringContaining('Estuvo sin responder'),
          priority: 'normal',
          collapseKey: 'nx_ia_estado_u7',
          entrega: 'siempre',
          dedupeSeconds: 0,
        }),
      );
    });

    it('con la compuerta apagada no hay eventos y por tanto no hay tarjeta; en observar y activo sí', async () => {
      for (const [modo, tarjetas] of [['apagado', 0], ['observar', 1], ['activo', 1]] as const) {
        const m = mundo();
        const a = contenedor(m, modo);
        caer(a.claude);
        await a.guardia.esperarAvisos();
        expect(m.tarjetas).toHaveLength(tarjetas);
      }
    });

    it('una caída que se abre por la sonda (un solo fallo) también avisa, y dice que la prueba automática lo confirmó', async () => {
      const m = mundo();
      const a = contenedor(m);
      a.claude.compuerta.registrarFallo(CLASE_401, 'nexara-sonda', true);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas).toHaveLength(1);
      expect(m.tarjetas[0].message).toContain('lo confirmó la prueba automática');
    });
  });

  describe('una sola tarjeta por episodio', () => {
    it('un segundo contenedor (relevo o API reiniciado) que también ve la caída NO repite la tarjeta', async () => {
      const m = mundo();
      const a = contenedor(m);
      const b = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
    });

    it('lo mismo con el regreso: los dos contenedores lo ven y sale una sola tarjeta de «volvió»', async () => {
      const m = mundo();
      const a = contenedor(m);
      const b = contenedor(m);
      // Cada contenedor ve el evento en su momento (sus compuertas son independientes): no en el mismo milisegundo.
      caer(a.claude);
      await a.guardia.esperarAvisos();
      caer(b.claude);
      await b.guardia.esperarAvisos();
      volver(a.claude);
      await a.guardia.esperarAvisos();
      volver(b.claude);
      await b.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
    });

    it('«volvió» sin caída previa no crea nada (p. ej. la persona borró la tarjeta de la caída)', async () => {
      const m = mundo();
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      m.tarjetas.splice(0);
      volver(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas).toHaveLength(0);
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
    });

    it('un episodio nuevo (cayó, volvió, cayó otra vez) vuelve a avisar; sin haber vuelto, no', async () => {
      const m = mundo();
      const a = contenedor(m);
      caer(a.claude);
      volver(a.claude);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO', 'IA_CAIDA']);
      // Otro contenedor ve la misma caída sin que haya vuelto: ya se avisó.
      const b = contenedor(m);
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(m.tarjetas).toHaveLength(3);
    });

    it('«cayó» y «volvió» en el mismo instante no se atropellan: salen en ese orden', async () => {
      const m = mundo();
      const a = contenedor(m);
      caer(a.claude);
      volver(a.claude); // sin esperar: cuando se revisa la última tarjeta, la de la caída aún no se crea
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
    });

    // La caída sin «volvió» tapa una caída nueva SOLO mientras es reciente (12 h). Antes tapaba hasta 30 días: si el API se
    // reiniciaba cuando la IA ya había vuelto (el proceso nuevo arranca en `ok` y nunca emite VOLVIO), esa tarjeta se quedaba
    // «abierta» y la siguiente caída pasaba días sin que nadie se enterara.
    it('una caída sin cerrar de hace 1 hora SÍ tapa la nueva: es el mismo episodio y no se repite', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(1))] });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);
      expect(m.notifications.createNotification).not.toHaveBeenCalled();
    });

    it('una caída sin cerrar de hace 2 días NO tapa la nueva: el cierre se perdió en un reinicio y esta es otra caída', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(diasAtras(2))] });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_CAIDA']);
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
      // Con la tarjeta nueva ya hay una reciente: otro contenedor que ve lo mismo no la repite.
      const b = contenedor(m);
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(m.tarjetas).toHaveLength(2);
    });

    it('el tope es de 12 horas: 11 h 59 min todavía tapa, 12 h 1 min ya no', async () => {
      const justoAntes = mundo({ tarjetas: [tarjetaCaida(minutosAtras(12 * 60 - 1))] });
      const a = contenedor(justoAntes);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(justoAntes.tarjetas).toHaveLength(1);

      const justoDespues = mundo({ tarjetas: [tarjetaCaida(minutosAtras(12 * 60 + 1))] });
      const b = contenedor(justoDespues);
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(entidades(justoDespues)).toEqual(['IA_CAIDA', 'IA_CAIDA']);
    });

    it('el tope vale por persona: a quien tiene una caída vieja le llega la nueva aunque la de desarrollo sea reciente', async () => {
      const m = mundo({
        modoDireccion: 'activo',
        personasDireccion: [{ id: 21, email: 'gerencia@nexara.com.mx', puesto: 'CEO', managerId: null, roleKey: 'ceo' }],
        tarjetas: [tarjetaCaida(horasAtras(1), 7), tarjetaCaida(diasAtras(2), 21)],
      });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => `${t.userId}:${t.entityType}`)).toEqual(['7:IA_CAIDA', '21:IA_CAIDA', '21:IA_CAIDA']);
    });

    it('para el regreso la última caída cuenta dentro de los 30 días, sea cual sea su edad: una caída larga que terminó se avisa', async () => {
      for (const [dias, creada] of [[2, true], [5, true], [29, true], [31, false]] as const) {
        const m = mundo({ tarjetas: [tarjetaCaida(diasAtras(dias))] });
        const a = contenedor(m);
        await a.guardia.avisarCambio({ tipo: 'VOLVIO', desde: Date.now() - dias * 24 * 60 * 60 * 1000, hasta: Date.now() });
        expect(entidades(m)).toEqual(creada ? ['IA_CAIDA', 'IA_VOLVIO'] : ['IA_CAIDA']);
      }
    });

    it('la tarjeta de otra persona o de otra categoría no cuenta', async () => {
      const ajena: Tarjeta = { id: 1, userId: 99, category: 'ia-estado', entityType: 'IA_CAIDA', title: 't', message: 'm', createdAt: new Date() };
      const otra: Tarjeta = { ...ajena, id: 2, userId: 7, category: 'recortes-filas' };
      const m = mundo({ tarjetas: [ajena, otra] });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.filter((t) => t.userId === 7 && t.category === 'ia-estado')).toHaveLength(1);
    });

    it('suscribirse dos veces no duplica el aviso', async () => {
      const m = mundo();
      const a = contenedor(m);
      a.guardia.onModuleInit();
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('nunca tumba a quien llamó a la IA', () => {
    it('sin cuenta de desarrollo activa no lanza, no crea nada y lo anota', async () => {
      const m = mundo({ desarrollo: null });
      const a = contenedor(m);
      expect(() => caer(a.claude)).not.toThrow();
      await expect(a.guardia.esperarAvisos()).resolves.toBeUndefined();
      expect(m.notifications.createNotification).not.toHaveBeenCalled();
      expect(a.aviso).toHaveBeenCalledWith(expect.stringContaining('developer@nexara.com.mx'));
    });

    it('si crear la tarjeta falla, la petición de la persona no se entera y el aviso siguiente sí sale', async () => {
      const m = mundo();
      const a = contenedor(m);
      m.notifications.createNotification.mockRejectedValueOnce(new Error('base caída'));
      expect(() => caer(a.claude)).not.toThrow();
      await expect(a.guardia.esperarAvisos()).resolves.toBeUndefined();
      expect(m.tarjetas).toHaveLength(0);
      expect(a.aviso).toHaveBeenCalledWith(expect.stringContaining('base caída'));
      // Siguiente episodio: el regreso no crea nada (no hubo tarjeta de caída) y la nueva caída sí.
      volver(a.claude);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);
    });

    it('si la base falla al buscar la cuenta de desarrollo tampoco lanza, y el aviso siguiente sí sale', async () => {
      const m = mundo();
      const a = contenedor(m);
      m.prisma.user.findFirst.mockRejectedValueOnce(new Error('sin conexión'));
      expect(() => caer(a.claude)).not.toThrow();
      await expect(a.guardia.esperarAvisos()).resolves.toBeUndefined();
      expect(m.notifications.createNotification).not.toHaveBeenCalled();
      expect(a.aviso).toHaveBeenCalledTimes(1);
      volver(a.claude);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);
    });

    it('si la base falla al buscar la última tarjeta tampoco lanza ni crea una a ciegas', async () => {
      const m = mundo();
      const a = contenedor(m);
      m.prisma.notification.findFirst.mockRejectedValueOnce(new Error('sin conexión'));
      expect(() => caer(a.claude)).not.toThrow();
      await expect(a.guardia.esperarAvisos()).resolves.toBeUndefined();
      expect(m.notifications.createNotification).not.toHaveBeenCalled();
      expect(a.aviso).toHaveBeenCalledWith(expect.stringContaining('sin conexión'));
    });

    it('un oyente ajeno que lanza no impide el aviso, y el nuestro no rompe a los demás', async () => {
      const m = mundo();
      const a = contenedor(m);
      const otros: string[] = [];
      a.claude.compuerta.alCambiar(() => {
        throw new Error('oyente ajeno roto');
      });
      a.claude.compuerta.alCambiar((e) => otros.push(e.tipo));
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(otros).toEqual(['CAIDA']);
      expect(m.tarjetas).toHaveLength(1);
    });
  });

  describe('contexto de empresa', () => {
    it('corre TODO dentro de withTenantBypassAsync aunque quien disparó el aviso tenga su empresa activa', async () => {
      const m = mundo();
      const a = contenedor(m);
      const durante: Array<{ bypass: boolean | undefined; companyId: number | null | undefined }> = [];
      a.claude.compuerta.alCambiar(() => {
        const almacen = tenantStorage.getStore();
        durante.push({ bypass: almacen?.bypass, companyId: almacen?.companyId });
      });
      runWithTenant({ companyId: 5, userId: 9 }, () => caer(a.claude));
      await a.guardia.esperarAvisos();

      // Control: el evento SÍ se levantó dentro de la petición de la empresa 5, sin bypass.
      expect(durante).toEqual([{ bypass: undefined, companyId: 5 }]);
      // Y aun así todo lo de base y la tarjeta corrieron con el filtro de empresa quitado.
      const llamadas = m.contexto.map((c) => c.llamada);
      expect(llamadas).toEqual(['user.findFirst', 'systemSetting.findFirst', 'notification.findFirst', 'createNotification']);
      for (const c of m.contexto) {
        expect(c).toEqual(expect.objectContaining({ bypass: true, companyId: null }));
      }
      // Y el contexto de la petición no se alteró afuera.
      expect(tenantStorage.getStore()).toBeUndefined();
    });

    it('también el regreso, que llega en otra petición de otra empresa', async () => {
      const m = mundo();
      const a = contenedor(m);
      runWithTenant({ companyId: 5, userId: 9 }, () => caer(a.claude));
      runWithTenant({ companyId: 8, userId: 3 }, () => volver(a.claude));
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      // La caída consulta el interruptor de la dirección; el regreso lo toma de la caché de 30 s del lector único.
      expect(m.contexto.map((c) => c.llamada)).toEqual([
        'user.findFirst',
        'systemSetting.findFirst',
        'notification.findFirst',
        'createNotification',
        'user.findFirst',
        'notification.findFirst',
        'createNotification',
      ]);
      expect(m.contexto.every((c) => c.bypass === true && c.companyId == null)).toBe(true);
    });
  });

  describe('también a la dirección (interruptor ia.aviso_direccion.modo, apagado de fábrica)', () => {
    const direccion: Persona[] = [
      { id: 21, email: 'gerencia@nexara.com.mx', puesto: 'CEO', managerId: null, roleKey: 'ceo' },
      { id: 22, email: 'direccion.operaciones@nexara.com.mx', puesto: 'Director de Operaciones', managerId: 21, roleKey: 'dir_operaciones' },
      // Cuenta de la tienda de apps: el filtro de cuentas de prueba la descarta.
      { id: 23, email: 'play.review@nexara.com.mx', puesto: null, managerId: null, roleKey: 'ceo' },
    ];

    it('sin fila, el aviso es solo para desarrollo y ni siquiera se busca a la dirección', async () => {
      const m = mundo({ personasDireccion: direccion });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => t.userId)).toEqual([7]);
      expect(m.prisma.systemSetting.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'ia.aviso_direccion.modo' } }));
      expect(m.prisma.user.findMany).not.toHaveBeenCalled();
    });

    it.each(['apagado', 'prendidisimo', ''])('con la fila «%s» sigue apagado', async (valor) => {
      const m = mundo({ modoDireccion: valor, personasDireccion: direccion });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => t.userId)).toEqual([7]);
      expect(m.prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('en observar calcula a quién le llegaría y lo dice en el log, pero no manda nada a la dirección', async () => {
      const m = mundo({ modoDireccion: 'observar', personasDireccion: direccion });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => t.userId)).toEqual([7]);
      expect(m.prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(a.nota).toHaveBeenCalledWith(expect.stringContaining('le llegaría a 2 persona(s); no se mandó'));
    });

    it('en activo le llega a CEO y directores reales de la empresa del dueño, con el texto sin nombres técnicos', async () => {
      const m = mundo({ modoDireccion: 'activo', personasDireccion: direccion, empresaDelDueno: 4 });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();

      expect(m.tarjetas.map((t) => t.userId)).toEqual([7, 21, 22]);
      const [paraDesarrollo, paraCeo, paraDirector] = m.tarjetas;
      expect(paraDesarrollo.message).toContain('subir-llave-ia.ps1');
      for (const t of [paraCeo, paraDirector]) {
        expect(t.message).toContain('Ya se avisó a desarrollo.');
        expect(t.message).not.toMatch(/subir-llave-ia|\.ps1|config\/|\/etc\//);
      }
      // La empresa sale del dueño de la plataforma (su predeterminada), no de una constante.
      expect(m.prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'gerencia@nexara.com.mx', isActive: true },
          select: expect.objectContaining({
            companyMemberships: expect.objectContaining({ orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], take: 1 }),
          }),
        }),
      );
      expect(m.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyMemberships: { some: { companyId: 4 } } }) }),
      );
      // Cada quien con su propia llave de colapso en el teléfono.
      expect(m.notifications.createNotification.mock.calls.map(([p]: any) => p.collapseKey)).toEqual([
        'nx_ia_estado_u7',
        'nx_ia_estado_u21',
        'nx_ia_estado_u22',
      ]);
    });

    it('el regreso y la no repetición valen para cada destinatario por separado', async () => {
      const m = mundo({ modoDireccion: 'activo', personasDireccion: direccion });
      const a = contenedor(m);
      const b = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(m.tarjetas).toHaveLength(3);
      volver(a.claude);
      await a.guardia.esperarAvisos();
      volver(b.claude);
      await b.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => `${t.userId}:${t.entityType}`)).toEqual([
        '7:IA_CAIDA',
        '21:IA_CAIDA',
        '22:IA_CAIDA',
        '7:IA_VOLVIO',
        '21:IA_VOLVIO',
        '22:IA_VOLVIO',
      ]);
    });

    it('si el dueño no tiene empresa, o no hay cuenta de desarrollo, se avisa a quien sí hay', async () => {
      const sinEmpresa = mundo({ modoDireccion: 'activo', personasDireccion: direccion, empresaDelDueno: null });
      const a = contenedor(sinEmpresa);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(sinEmpresa.tarjetas.map((t) => t.userId)).toEqual([7]);
      expect(sinEmpresa.prisma.user.findMany).not.toHaveBeenCalled();

      const sinDesarrollo = mundo({ modoDireccion: 'activo', personasDireccion: direccion, desarrollo: null });
      const b = contenedor(sinDesarrollo);
      caer(b.claude);
      await b.guardia.esperarAvisos();
      expect(sinDesarrollo.tarjetas.map((t) => t.userId)).toEqual([21, 22]);
    });

    it('si falla la tarjeta de una persona, las demás la reciben igual', async () => {
      const m = mundo({ modoDireccion: 'activo', personasDireccion: direccion });
      const original = m.notifications.createNotification.getMockImplementation()!;
      m.notifications.createNotification.mockImplementation(async (p: any) => {
        if (p.userId === 7) throw new Error('falló la de desarrollo');
        return original(p);
      });
      const a = contenedor(m);
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => t.userId)).toEqual([21, 22]);
      expect(a.aviso).toHaveBeenCalledWith(expect.stringContaining('falló la de desarrollo'));
    });
  });

  // El API se reinicia (o se recrea el contenedor para arreglar la causa) cuando la IA ya volvió: el proceso nuevo arranca
  // en `ok`, su primera sonda sale bien y la compuerta NO emite VOLVIO. La guardia lo cierra sola, una vez por proceso.
  describe('regreso que este proceso no vio (revisión tras el arranque)', () => {
    const llavePrevia = process.env.ANTHROPIC_API_KEY;
    afterEach(() => {
      if (llavePrevia === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = llavePrevia;
    });

    /** Un proceso nuevo: `ClaudeService` real con la puerta simulada (`create`) y la guardia conectada al mismo mundo. */
    function procesoNuevo(m: Mundo, create: jest.Mock) {
      const claude = servicioReal(create, 'observar');
      const guardia = new GuardiaIaService(claude, m.prisma as unknown as PrismaService, m.notifications as unknown as NotificationsService);
      const aviso = jest.spyOn((guardia as any).logger, 'warn').mockImplementation(() => undefined);
      jest.spyOn((guardia as any).logger, 'log').mockImplementation(() => undefined);
      guardia.onModuleInit(); // como en la app: suscrita a los cambios de estado de la compuerta
      return { claude, guardia, aviso };
    }
    const puertaSana = () => jest.fn().mockResolvedValue(respuestaOk());
    const puertaCon401 = () =>
      jest.fn().mockRejectedValue(
        new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', new Headers()),
      );

    it('la primera sonda buena con una caída sin cerrar de antes manda el «volvió» que faltaba, contado desde la tarjeta de la caída', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(3))] });
      const p = procesoNuevo(m, puertaSana());
      expect(await p.guardia.vuelta()).toBe(true);
      await p.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      expect(m.notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          category: 'ia-estado',
          entityType: 'IA_VOLVIO',
          title: 'La IA de NEXARA ya responde otra vez',
          message: expect.stringContaining('Estuvo sin responder 3 h 0 min'),
          collapseKey: 'nx_ia_estado_u7',
        }),
      );
      // Y una caída nueva después sí avisa: la tarjeta ya no está «abierta».
      caer(p.claude);
      await p.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO', 'IA_CAIDA']);
    });

    it('corre una sola vez por proceso: las vueltas siguientes no vuelven a buscar la última tarjeta', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(3))] });
      const p = procesoNuevo(m, puertaSana());
      await p.guardia.vuelta();
      await p.guardia.esperarAvisos();
      expect(m.prisma.notification.findFirst).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 3; i++) await p.guardia.vuelta();
      await p.guardia.esperarAvisos();
      expect(m.prisma.notification.findFirst).toHaveBeenCalledTimes(1);
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
    });

    it('sin caída pendiente (no hay tarjeta, o la última ya es un «volvió») no crea nada', async () => {
      const sinNada = mundo();
      const a = procesoNuevo(sinNada, puertaSana());
      await a.guardia.vuelta();
      await a.guardia.esperarAvisos();
      expect(sinNada.tarjetas).toHaveLength(0);

      const cerrada = mundo({
        tarjetas: [tarjetaCaida(horasAtras(5)), { ...tarjetaCaida(horasAtras(4)), id: 2, entityType: 'IA_VOLVIO' }],
      });
      const b = procesoNuevo(cerrada, puertaSana());
      await b.guardia.vuelta();
      await b.guardia.esperarAvisos();
      expect(entidades(cerrada)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      expect(cerrada.notifications.createNotification).not.toHaveBeenCalled();
    });

    it('si la puerta sigue sin responder no manda «volvió»; cuando de verdad vuelve, sale UNA sola, por el camino normal', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(1))] });
      const create = puertaCon401();
      const p = procesoNuevo(m, create);
      const real = Date.now();
      const reloj = jest.spyOn(Date, 'now').mockReturnValue(real);
      await p.guardia.vuelta(); // la sonda cae: este proceso abre su caída, y la tarjeta reciente impide repetirla
      await p.guardia.esperarAvisos();
      expect(p.claude.compuerta.instantanea().estado).toBe('caida');
      expect(entidades(m)).toEqual(['IA_CAIDA']);

      create.mockResolvedValue(respuestaOk());
      reloj.mockReturnValue(real + 6 * MIN); // ya toca el siguiente intento (5 min)
      expect(await p.guardia.vuelta()).toBe(true); // vuelve: el VOLVIO normal de la compuerta
      await p.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      expect(m.notifications.createNotification).toHaveBeenCalledTimes(1);
      // El de la compuerta (esta caída duró 6 min), no el de la revisión del arranque (que contaría desde la tarjeta, 1 h 6 min).
      expect(m.tarjetas[1].message).toContain('Estuvo sin responder 6 min');
    });

    it('un fallo de la base se reintenta en la vuelta siguiente', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(3))] });
      m.prisma.notification.findFirst.mockRejectedValueOnce(new Error('base caída'));
      const p = procesoNuevo(m, puertaSana());
      await p.guardia.vuelta();
      await p.guardia.esperarAvisos();
      expect(p.aviso).toHaveBeenCalledWith(expect.stringContaining('base caída'));
      expect(entidades(m)).toEqual(['IA_CAIDA']);
      await p.guardia.vuelta();
      await p.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
    });

    it('si la base sigue fallando se rinde a los 5 intentos (queda el tope de 12 horas) y la vuelta de la sonda no se entera', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(3))] });
      m.prisma.notification.findFirst.mockRejectedValue(new Error('base caída'));
      const p = procesoNuevo(m, puertaSana());
      for (let i = 0; i < 8; i++) {
        await expect(p.guardia.vuelta()).resolves.toEqual(expect.any(Boolean));
        await p.guardia.esperarAvisos();
      }
      expect(m.prisma.notification.findFirst).toHaveBeenCalledTimes(5);
      expect(entidades(m)).toEqual(['IA_CAIDA']);
    });

    it('cada destinatario con su propia caída pendiente recibe su «volvió»; el que no tiene ninguna, nada', async () => {
      const m = mundo({
        modoDireccion: 'activo',
        personasDireccion: [
          { id: 21, email: 'gerencia@nexara.com.mx', puesto: 'CEO', managerId: null, roleKey: 'ceo' },
          { id: 22, email: 'direccion.operaciones@nexara.com.mx', puesto: 'Director de Operaciones', managerId: 21, roleKey: 'dir_operaciones' },
        ],
        tarjetas: [tarjetaCaida(horasAtras(2), 7), tarjetaCaida(horasAtras(2), 21)],
      });
      const p = procesoNuevo(m, puertaSana());
      await p.guardia.vuelta();
      await p.guardia.esperarAvisos();
      expect(m.tarjetas.map((t) => `${t.userId}:${t.entityType}`)).toEqual(['7:IA_CAIDA', '21:IA_CAIDA', '7:IA_VOLVIO', '21:IA_VOLVIO']);
    });

    it('corre dentro de withTenantBypassAsync aunque la vuelta se dispare con una empresa activa en el contexto', async () => {
      const m = mundo({ tarjetas: [tarjetaCaida(horasAtras(3))] });
      const p = procesoNuevo(m, puertaSana());
      await runWithTenant({ companyId: 9, userId: 3 }, async () => {
        await p.guardia.vuelta();
        await p.guardia.esperarAvisos();
      });
      expect(entidades(m)).toEqual(['IA_CAIDA', 'IA_VOLVIO']);
      expect(m.contexto.every((c) => c.bypass === true && c.companyId == null)).toBe(true);
    });

    it('sin base o sin centro de avisos (la guardia de solo sondear) no revisa nada y no lanza', async () => {
      const claude = servicioReal(puertaSana(), 'observar');
      const guardia = new GuardiaIaService(claude);
      await expect(guardia.vuelta()).resolves.toBe(true);
      await expect(guardia.esperarAvisos()).resolves.toBeUndefined();
    });
  });

  describe('en Nest', () => {
    const previo = { llave: process.env.ANTHROPIC_API_KEY, nodeEnv: process.env.NODE_ENV, relevo: process.env.NEXARA_RELEVO };
    const restaurar = (nombre: string, valor: string | undefined) => {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    };
    afterEach(() => {
      restaurar('ANTHROPIC_API_KEY', previo.llave);
      restaurar('NODE_ENV', previo.nodeEnv);
      restaurar('NEXARA_RELEVO', previo.relevo);
    });

    it('Nest inyecta la base y el centro de avisos, y al arrancar la guardia queda suscrita (y deja de estarlo al cerrar)', async () => {
      const m = mundo();
      const modulo = await Test.createTestingModule({
        providers: [
          ClaudeService,
          GuardiaIaService,
          { provide: PrismaService, useValue: m.prisma },
          { provide: NotificationsService, useValue: m.notifications },
        ],
      }).compile();
      await modulo.init();
      const claude = modulo.get(ClaudeService);
      const guardia = modulo.get(GuardiaIaService);
      claude.compuerta.modo = 'observar';
      jest.spyOn((claude as any).logger, 'error').mockImplementation(() => undefined);
      jest.spyOn((claude as any).logger, 'log').mockImplementation(() => undefined);
      jest.spyOn((guardia as any).logger, 'log').mockImplementation(() => undefined);

      caer(claude);
      await guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);

      await modulo.close();
      volver(claude);
      await guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']);
    });

    it('sin el centro de avisos en el contenedor arranca igual, solo sondea y no se suscribe', async () => {
      const m = mundo();
      const modulo = await Test.createTestingModule({
        providers: [ClaudeService, GuardiaIaService, { provide: PrismaService, useValue: m.prisma }],
      }).compile();
      await modulo.init();
      const claude = modulo.get(ClaudeService);
      claude.compuerta.modo = 'observar';
      jest.spyOn((claude as any).logger, 'error').mockImplementation(() => undefined);
      expect(() => caer(claude)).not.toThrow();
      await modulo.get(GuardiaIaService).esperarAvisos();
      expect(m.prisma.user.findFirst).not.toHaveBeenCalled();
      await modulo.close();
    });

    it('en el contenedor de relevo también se suscribe: el aviso no depende de la vuelta de la sonda', async () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXARA_RELEVO = '1';
      const setInterval = jest.spyOn(global, 'setInterval');
      const m = mundo();
      const a = contenedor(m);
      a.guardia.onApplicationBootstrap();
      expect(setInterval).not.toHaveBeenCalled(); // la sonda no corre en el relevo…
      caer(a.claude);
      await a.guardia.esperarAvisos();
      expect(entidades(m)).toEqual(['IA_CAIDA']); // …pero el aviso sí.
    });

    it('AiModule importa NotificationsModule (UsersModule ya lo importa: no se crea ciclo)', () => {
      // Cargar los módulos de Nest arrastra la estrategia JWT, que exige su secreto al importarse.
      const habia = process.env.JWT_SECRET;
      process.env.JWT_SECRET = habia || 'secreto-de-prueba';
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AiModule } = require('../ai.module') as typeof import('../ai.module');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { NotificationsModule } = require('../../notifications/notifications.module') as typeof import('../../notifications/notifications.module');
        expect(Reflect.getMetadata('imports', AiModule)).toContain(NotificationsModule);
        expect(Reflect.getMetadata('providers', AiModule)).toContain(GuardiaIaService);
      } finally {
        restaurar('JWT_SECRET', habia);
      }
    });
  });
});
