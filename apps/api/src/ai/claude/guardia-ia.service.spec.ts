import Anthropic from '@anthropic-ai/sdk';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { reiniciarCachePiloto } from '../../common/piloto/interruptor-piloto';
import { ClaudeService } from './claude.service';
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
