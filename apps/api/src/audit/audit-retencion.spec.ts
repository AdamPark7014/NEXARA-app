import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { BadRequestException, Logger } from '@nestjs/common';
import { TAREAS_CATALOGO } from '../common/cron/tareas-catalogo';
import { AuditService } from './audit.service';
import {
  CACHE_RETENCION_MS,
  CLAVE_RETENCION_BITACORA,
  LOTE_PURGA,
  MAX_LOTES_PURGA,
  PAUSA_ENTRE_LOTES_MS,
  PISO_DIAS,
  RETENCION_POR_OMISION_DIAS,
  TECHO_DIAS,
  describirOrigenRetencion,
  interpretarRetencionDias,
  leerRetencionDias,
  normalizarDiasManuales,
  reiniciarCacheRetencion,
  type LectorRetencion,
} from './audit-retencion';

const T0 = 1_800_000_000_000;
const DIA_MS = 86_400_000;

/** Prisma simulado: `valor` es lo que contesta `findFirst` (null = sin fila; Error = la base falla). */
function simulado(valor: string | null | Error) {
  const findFirst = jest.fn(async (_args: unknown) => {
    if (valor instanceof Error) throw valor;
    return valor === null ? null : { value: valor };
  });
  return { prisma: { systemSetting: { findFirst } } as LectorRetencion, findFirst };
}

/** Valores que alguien puede escribir a mano en `system_settings` (PUT /api/settings no valida esta clave). */
const ILEGIBLES = ['abc', '', '   ', '-5', '1.5', '1e3', '180 días', '365 días', '1 año', '36 5', 'null', 'NaN', 'Infinity', '٣٠٠'];

describe('retención de la bitácora: número de días', () => {
  let avisos: jest.SpyInstance;

  beforeEach(() => {
    reiniciarCacheRetencion();
    // El aviso del lector sale por `Logger.prototype.warn`; se captura para fijarlo y para no ensuciar la salida.
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('las constantes son las del plan: 90 por omisión, piso 30, techo 3650', () => {
    expect(RETENCION_POR_OMISION_DIAS).toBe(90);
    expect(PISO_DIAS).toBe(30);
    expect(TECHO_DIAS).toBe(3650);
    expect(CLAVE_RETENCION_BITACORA).toBe('audit.retencion_dias');
    expect(CACHE_RETENCION_MS).toBe(5 * 60_000);
  });

  describe('interpretarRetencionDias', () => {
    it.each([
      ['180', 180],
      [' 180 ', 180],
      ['90', 90],
      ['30', 30],
      ['3650', 3650],
      ['0090', 90],
    ])('%j = %i días', (valor, esperado) => expect(interpretarRetencionDias(valor)).toBe(esperado));

    it.each(['5', '0', '29'])('%j queda en el piso de 30', (valor) => expect(interpretarRetencionDias(valor)).toBe(30));

    it.each(['3651', '99999', '9'.repeat(400)])('%j queda en el techo de 3650', (valor) =>
      expect(interpretarRetencionDias(valor)).toBe(3650),
    );

    it.each(ILEGIBLES)('%j no es un entero: es ilegible (null), NO se adivina un número', (valor) =>
      expect(interpretarRetencionDias(valor)).toBeNull(),
    );

    it.each([null, undefined, 180, true, {}, []])('un valor que no es texto (%j) es ilegible (null)', (valor) =>
      expect(interpretarRetencionDias(valor)).toBeNull(),
    );
  });

  describe('normalizarDiasManuales (cuerpo de POST /audit/purge)', () => {
    it('sin days no pide nada: rige la regla configurada', () => {
      expect(normalizarDiasManuales(undefined)).toBeNull();
      expect(normalizarDiasManuales(null)).toBeNull();
    });

    it('un entero manda, con piso de 30 y techo de 3650', () => {
      expect(normalizarDiasManuales(200)).toBe(200);
      expect(normalizarDiasManuales(10)).toBe(30);
      expect(normalizarDiasManuales(0)).toBe(30);
      expect(normalizarDiasManuales(45.9)).toBe(45);
      expect(normalizarDiasManuales(1e12)).toBe(3650);
      expect(normalizarDiasManuales('200')).toBe(200);
      expect(normalizarDiasManuales(' 10 ')).toBe(30);
    });

    it.each(['abc', '', -1, NaN, Infinity, true, {}, [], '1.5', '-3'])('%j es inválido (no se adivina)', (valor) =>
      expect(normalizarDiasManuales(valor)).toBe('invalido'),
    );
  });

  describe('leerRetencionDias', () => {
    it('sin fila → 90 por omisión', async () => {
      const { prisma } = simulado(null);
      await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 90, origen: 'omision' });
      expect(avisos).not.toHaveBeenCalled();
    });

    it("fila '180' → 180 configurado", async () => {
      const { prisma } = simulado('180');
      await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 180, origen: 'configurado' });
      expect(avisos).not.toHaveBeenCalled();
    });

    it.each([
      ['5', 30],
      ['99999', 3650],
    ])('fila %j (entero fuera de rango) → %i, configurado y sin aviso', async (valor, esperado) => {
      const { prisma } = simulado(valor);
      await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: esperado, origen: 'configurado' });
      expect(avisos).not.toHaveBeenCalled();
    });

    describe('fila ilegible (alguien la escribió a mano mal)', () => {
      it.each(ILEGIBLES)('%j sin número válido anterior → dias null (no se adivina 90) y un aviso', async (valor) => {
        const { prisma } = simulado(valor);
        await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: null, origen: 'invalido' });
        expect(avisos).toHaveBeenCalledTimes(1);
        const aviso = String(avisos.mock.calls[0]![0]);
        expect(aviso).toContain(CLAVE_RETENCION_BITACORA);
        expect(aviso).toContain('NO borra nada');
      });

      it('el aviso no copia el valor escrito: dice solo su forma', async () => {
        const { prisma } = simulado('1 año');
        await leerRetencionDias(prisma, T0);
        const aviso = String(avisos.mock.calls[0]![0]);
        expect(aviso).not.toContain('1 año');
        expect(aviso).toContain('un texto de 5 caracteres');
      });

      it('con un número válido leído antes, conserva ese número y avisa', async () => {
        const findFirst = jest.fn(async () => ({ value: '365' }));
        const prisma = { systemSetting: { findFirst } } as LectorRetencion;
        await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 365, origen: 'configurado' });
        expect(avisos).not.toHaveBeenCalled();

        findFirst.mockResolvedValue({ value: '1 año' });
        await expect(leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS + 1)).resolves.toEqual({
          dias: 365,
          origen: 'conservado',
        });
        expect(avisos).toHaveBeenCalledTimes(1);
        const aviso = String(avisos.mock.calls[0]![0]);
        expect(aviso).toContain('Se conserva el último número válido: 365 días');
        expect(aviso).not.toContain('1 año');
      });

      it('si antes no había fila, el último número válido es el 90 de omisión', async () => {
        const findFirst = jest.fn(async (): Promise<{ value: string } | null> => null);
        const prisma = { systemSetting: { findFirst } } as LectorRetencion;
        await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 90, origen: 'omision' });
        findFirst.mockResolvedValue({ value: 'abc' });
        await expect(leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS + 1)).resolves.toEqual({
          dias: 90,
          origen: 'conservado',
        });
        expect(avisos).toHaveBeenCalledTimes(1);
      });

      it('el aviso sale una sola vez por lectura: dentro de la caché no se repite, al vencer sí', async () => {
        const { prisma, findFirst } = simulado('abc');
        await leerRetencionDias(prisma, T0);
        await leerRetencionDias(prisma, T0 + 1_000);
        await leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS - 1);
        expect(findFirst).toHaveBeenCalledTimes(1);
        expect(avisos).toHaveBeenCalledTimes(1);
        await leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS);
        expect(findFirst).toHaveBeenCalledTimes(2);
        expect(avisos).toHaveBeenCalledTimes(2);
      });

      it('dos lecturas simultáneas de una fila ilegible avisan una sola vez', async () => {
        const { prisma } = simulado('abc');
        await Promise.all([leerRetencionDias(prisma, T0), leerRetencionDias(prisma, T0)]);
        expect(avisos).toHaveBeenCalledTimes(1);
      });

      it('al corregir la fila vuelve a regir el número escrito, y ese pasa a ser el último válido', async () => {
        const findFirst = jest.fn(async () => ({ value: 'abc' }));
        const prisma = { systemSetting: { findFirst } } as LectorRetencion;
        await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: null, origen: 'invalido' });
        findFirst.mockResolvedValue({ value: '200' });
        await expect(leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS + 1)).resolves.toEqual({
          dias: 200,
          origen: 'configurado',
        });
        findFirst.mockResolvedValue({ value: '2 años' });
        await expect(leerRetencionDias(prisma, T0 + 2 * CACHE_RETENCION_MS + 2)).resolves.toEqual({
          dias: 200,
          origen: 'conservado',
        });
      });
    });

    it('lee CUALQUIER fila con la clave (la de empresa que escribe PUT /settings también) y manda la más reciente', async () => {
      const { prisma, findFirst } = simulado('120');
      await leerRetencionDias(prisma, T0);
      expect(findFirst).toHaveBeenCalledTimes(1);
      const args = findFirst.mock.calls[0]![0] as any;
      expect(args.where).toEqual({ key: 'audit.retencion_dias' });
      expect(args.where).not.toHaveProperty('companyId');
      expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    });

    it('la caché dura 5 minutos y después vuelve a preguntar', async () => {
      const { prisma, findFirst } = simulado('180');
      await leerRetencionDias(prisma, T0);
      await leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS - 1);
      expect(findFirst).toHaveBeenCalledTimes(1);
      await leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS);
      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('un cambio en la base se ve al vencer la caché', async () => {
      let valor = '180';
      const findFirst = jest.fn(async () => ({ value: valor }));
      const prisma = { systemSetting: { findFirst } } as LectorRetencion;
      await expect(leerRetencionDias(prisma, T0)).resolves.toMatchObject({ dias: 180 });
      valor = '365';
      await expect(leerRetencionDias(prisma, T0 + 1_000)).resolves.toMatchObject({ dias: 180 });
      await expect(leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS + 1)).resolves.toMatchObject({ dias: 365 });
    });

    it('la función de pruebas reinicia la caché y el último número válido', async () => {
      const { prisma, findFirst } = simulado('180');
      await leerRetencionDias(prisma, T0);
      reiniciarCacheRetencion();
      await leerRetencionDias(prisma, T0 + 1);
      expect(findFirst).toHaveBeenCalledTimes(2);

      reiniciarCacheRetencion();
      findFirst.mockResolvedValue({ value: 'abc' });
      await expect(leerRetencionDias(prisma, T0 + 2)).resolves.toEqual({ dias: null, origen: 'invalido' });
    });

    it('dos lecturas simultáneas comparten una sola consulta', async () => {
      const { prisma, findFirst } = simulado('180');
      const [a, b] = await Promise.all([leerRetencionDias(prisma, T0), leerRetencionDias(prisma, T0)]);
      expect([a.dias, b.dias]).toEqual([180, 180]);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    it('si la base lanza y nunca se leyó, devuelve 90 por omisión, avisa y no lanza', async () => {
      const { prisma } = simulado(new Error('base caída'));
      await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 90, origen: 'omision' });
      expect(avisos).toHaveBeenCalledTimes(1);
    });

    it('si la base lanza después de haber leído 365, conserva 365 (no borra de más)', async () => {
      let falla = false;
      const findFirst = jest.fn(async () => {
        if (falla) throw new Error('base caída');
        return { value: '365' };
      });
      const prisma = { systemSetting: { findFirst } } as LectorRetencion;
      await expect(leerRetencionDias(prisma, T0)).resolves.toEqual({ dias: 365, origen: 'configurado' });
      falla = true;
      await expect(leerRetencionDias(prisma, T0 + CACHE_RETENCION_MS + 1)).resolves.toEqual({
        dias: 365,
        origen: 'conservado',
      });
    });

    it('un cliente sin systemSetting tampoco lanza', async () => {
      await expect(leerRetencionDias({} as unknown as LectorRetencion, T0)).resolves.toEqual({
        dias: 90,
        origen: 'omision',
      });
    });
  });

  describe('describirOrigenRetencion', () => {
    it.each(['manual', 'omision', 'configurado', 'conservado', 'invalido'] as const)('%s tiene un texto en español', (origen) => {
      expect(describirOrigenRetencion(origen).length).toBeGreaterThan(10);
    });
  });
});

// ── La purga por lotes ─────────────────────────────────────────────────────────────────────────

/**
 * Prisma simulado con una bitácora de `vencidas` filas vencidas (`Infinity` = nunca se acaban) y la fila de
 * `system_settings` que se pida.
 */
function bitacora(vencidas: number, valorRetencion: string | null = null) {
  let restantes = vencidas;
  let siguienteId = 1;
  const findMany = jest.fn(async (args: { take: number }) => {
    const n = Math.min(restantes, args.take);
    return Array.from({ length: n }, () => ({ id: siguienteId++ }));
  });
  const deleteMany = jest.fn(async (args: { where: { id: { in: number[] } } }) => {
    const n = args.where.id.in.length;
    restantes -= n;
    return { count: n };
  });
  const findFirst = jest.fn(async () => (valorRetencion === null ? null : { value: valorRetencion }));
  const prisma = { auditLog: { findMany, deleteMany }, systemSetting: { findFirst } };
  const servicio = new AuditService(prisma as any);
  const pausar = jest.spyOn(servicio as any, 'pausar').mockResolvedValue(undefined);
  const log = jest.spyOn((servicio as any).logger, 'log').mockImplementation(() => undefined);
  jest.spyOn((servicio as any).logger, 'debug').mockImplementation(() => undefined);
  return { servicio, findMany, deleteMany, findFirst, pausar, log };
}

describe('AuditService.purgeOlderThan (una sola regla, por lotes)', () => {
  let reloj: jest.SpyInstance;
  let avisos: jest.SpyInstance;

  beforeEach(() => {
    reiniciarCacheRetencion();
    reloj = jest.spyOn(Date, 'now').mockReturnValue(T0);
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('12,001 filas vencidas → tres lotes (5000, 5000, 2001) y se detiene', async () => {
    const { servicio, findMany, deleteMany, pausar } = bitacora(12_001);
    const r = await servicio.purgeOlderThan();
    expect(r).toMatchObject({ deleted: 12_001, dias: 90, quedanMas: false });
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(deleteMany.mock.calls.map((c) => c[0].where.id.in.length)).toEqual([5000, 5000, 2001]);
    // Pausa de 200 ms entre lotes, no después del último.
    expect(pausar.mock.calls).toEqual([[PAUSA_ENTRE_LOTES_MS], [PAUSA_ENTRE_LOTES_MS]]);
    expect(PAUSA_ENTRE_LOTES_MS).toBe(200);
  });

  it('cada lote pide los 5,000 más viejos por el índice de createdAt, solo sus ids', async () => {
    const { servicio, findMany } = bitacora(10);
    await servicio.purgeOlderThan();
    const args = findMany.mock.calls[0]![0] as any;
    expect(args.where).toEqual({ createdAt: { lt: new Date(T0 - 90 * DIA_MS) } });
    expect(args.select).toEqual({ id: true });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
    expect(args.take).toBe(5000);
    expect(LOTE_PURGA).toBe(5000);
  });

  it('ninguna vencida → un solo findMany, ningún borrado, deleted 0', async () => {
    const { servicio, findMany, deleteMany, pausar } = bitacora(0);
    const r = await servicio.purgeOlderThan();
    expect(r.deleted).toBe(0);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(pausar).not.toHaveBeenCalled();
  });

  it('justo 5,000 vencidas: un lote, una vuelta más que sale vacía', async () => {
    const { servicio, findMany, deleteMany } = bitacora(5_000);
    const r = await servicio.purgeOlderThan();
    expect(r).toMatchObject({ deleted: 5_000, quedanMas: false });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('con una bitácora sin fondo se detiene a los 40 lotes y avisa que queda más', async () => {
    const { servicio, findMany, deleteMany, pausar, log } = bitacora(Number.POSITIVE_INFINITY);
    const r = await servicio.purgeOlderThan();
    expect(MAX_LOTES_PURGA).toBe(40);
    expect(findMany).toHaveBeenCalledTimes(40);
    expect(deleteMany).toHaveBeenCalledTimes(40);
    expect(pausar).toHaveBeenCalledTimes(39);
    expect(r).toMatchObject({ deleted: 200_000, quedanMas: true });
    expect(String(log.mock.calls[0]![0])).toContain('puede que queden más');
  });

  it('sin fila de retención el corte es de 90 días', async () => {
    const { servicio } = bitacora(3);
    const r = await servicio.purgeOlderThan();
    expect(r.dias).toBe(90);
    expect(r.cutoff).toBe(new Date(T0 - 90 * DIA_MS).toISOString());
  });

  it('el corte usa los días leídos de system_settings', async () => {
    const { servicio, findMany } = bitacora(3, '180');
    const r = await servicio.purgeOlderThan();
    expect(r.dias).toBe(180);
    expect(r.cutoff).toBe(new Date(T0 - 180 * DIA_MS).toISOString());
    expect((findMany.mock.calls[0]![0] as any).where.createdAt.lt).toEqual(new Date(T0 - 180 * DIA_MS));
  });

  it('un entero fuera de rango se lleva al piso o al techo, sin aviso: 5 → 30, 99999 → 3650', async () => {
    expect((await bitacora(1, '5').servicio.purgeOlderThan()).dias).toBe(30);
    reiniciarCacheRetencion();
    expect((await bitacora(1, '99999').servicio.purgeOlderThan()).dias).toBe(3650);
    expect(avisos).not.toHaveBeenCalled();
  });

  describe('fila de retención ilegible: no se adivina 90 sobre lo que Adam quiso distinto', () => {
    it.each(['abc', '', '1 año', '365 días', '36 5'])(
      '%j sin número válido anterior: no borra nada, responde 400 con la causa y deja un aviso',
      async (valor) => {
        const { servicio, findMany, deleteMany, log } = bitacora(100, valor);
        const error = await servicio.purgeOlderThan().catch((e) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(String(error.message)).toContain('No se borró nada de la bitácora');
        expect(String(error.message)).toContain(CLAVE_RETENCION_BITACORA);
        expect(findMany).not.toHaveBeenCalled();
        expect(deleteMany).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect(avisos).toHaveBeenCalledTimes(1);
      },
    );

    it('el error no copia el valor escrito', async () => {
      const { servicio } = bitacora(1, '1 año');
      const error = await servicio.purgeOlderThan().catch((e) => e);
      expect(String(error.message)).not.toContain('1 año');
    });

    it('con un número válido conocido (365) conserva ese número, avisa y lo dice en el log de la purga', async () => {
      const { servicio, findFirst, log } = bitacora(3, '365');
      expect((await servicio.purgeOlderThan()).dias).toBe(365);

      // Pasa la caché y alguien escribe mal la fila.
      reloj.mockReturnValue(T0 + CACHE_RETENCION_MS + 1);
      findFirst.mockResolvedValue({ value: '1 año' } as any);
      log.mockClear();
      const r = await servicio.purgeOlderThan();
      expect(r).toMatchObject({ dias: 365, origen: 'conservado' });
      expect(r.cutoff).toBe(new Date(T0 + CACHE_RETENCION_MS + 1 - 365 * DIA_MS).toISOString());
      expect(avisos).toHaveBeenCalledTimes(1);
      expect(String(avisos.mock.calls[0]![0])).toContain('Se conserva el último número válido: 365 días');
      expect(String(log.mock.calls[0]![0])).toContain('retención 365 días, ' + describirOrigenRetencion('conservado'));
    });

    it('una llamada manual con days no depende de la fila ilegible', async () => {
      const { servicio, findFirst } = bitacora(3, 'abc');
      const r = await servicio.purgeOlderThan(120);
      expect(r).toMatchObject({ deleted: 3, dias: 120, origen: 'manual' });
      expect(findFirst).not.toHaveBeenCalled();
      expect(avisos).not.toHaveBeenCalled();
    });

    it('el cron semanal con la fila ilegible no borra nada y la tarea queda como fallida (queda en el log de errores)', async () => {
      const { servicio, deleteMany } = bitacora(100, 'abc');
      const error = jest.spyOn((servicio as any).logger, 'error').mockImplementation(() => undefined);
      await expect(servicio.purgaProgramada()).resolves.toBeUndefined();
      expect(deleteMany).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]![0])).toContain('No se borró nada de la bitácora');
    });
  });

  it('un purgeOlderThan(10) manual se lleva a 30 días y no mira la configuración', async () => {
    const { servicio, findFirst } = bitacora(3, '365');
    const r = await servicio.purgeOlderThan(10);
    expect(r.dias).toBe(30);
    expect(r.cutoff).toBe(new Date(T0 - 30 * DIA_MS).toISOString());
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('un days explícito mayor al piso manda sobre la configuración (texto o número)', async () => {
    expect((await bitacora(1, '365').servicio.purgeOlderThan(120)).dias).toBe(120);
    expect((await bitacora(1, '365').servicio.purgeOlderThan('200')).dias).toBe(200);
  });

  it('un days que no es entero responde 400 y no toca la bitácora', async () => {
    const { servicio, findMany, deleteMany } = bitacora(100);
    await expect(servicio.purgeOlderThan('abc' as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.purgeOlderThan({} as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.purgeOlderThan(-5)).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deja una línea de log con «Bitácora:», la cuenta y la retención', async () => {
    const { servicio, log } = bitacora(7);
    await servicio.purgeOlderThan();
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0]![0]);
    expect(linea).toContain('Bitácora: 7 registros');
    expect(linea).toContain('retención 90 días');
  });

  it('la línea de log y el resultado dicen de dónde salió el número: omisión, configurado o manual', async () => {
    const omision = bitacora(1);
    const rOmision = await omision.servicio.purgeOlderThan();
    expect(rOmision.origen).toBe('omision');
    expect(String(omision.log.mock.calls[0]![0])).toContain('retención 90 días, ' + describirOrigenRetencion('omision'));

    reiniciarCacheRetencion();
    const configurado = bitacora(1, '180');
    const rConfigurado = await configurado.servicio.purgeOlderThan();
    expect(rConfigurado.origen).toBe('configurado');
    expect(String(configurado.log.mock.calls[0]![0])).toContain(
      'retención 180 días, ' + describirOrigenRetencion('configurado'),
    );

    const manual = bitacora(1, '180');
    const rManual = await manual.servicio.purgeOlderThan(60);
    expect(rManual.origen).toBe('manual');
    expect(String(manual.log.mock.calls[0]![0])).toContain('retención 60 días, ' + describirOrigenRetencion('manual'));
  });

  it('el cron semanal llama a la purga sin días (rige la regla configurada)', async () => {
    const { servicio } = bitacora(0);
    const purga = jest.spyOn(servicio, 'purgeOlderThan');
    await servicio.purgaProgramada();
    expect(purga).toHaveBeenCalledTimes(1);
    expect(purga).toHaveBeenCalledWith();
  });

  it('si la purga falla el cron no lanza (runScheduledJob lo atrapa)', async () => {
    const { servicio } = bitacora(0);
    jest.spyOn(servicio, 'purgeOlderThan').mockRejectedValue(new Error('base caída'));
    jest.spyOn((servicio as any).logger, 'error').mockImplementation(() => undefined);
    await expect(servicio.purgaProgramada()).resolves.toBeUndefined();
  });
});

// ── Una sola regla en todo el código ───────────────────────────────────────────────────────────

const RAIZ = resolve(__dirname, '..');

function archivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') && !nombre.endsWith('.d.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

const rel = (ruta: string) => relative(RAIZ, ruta).split(sep).join('/');

/** Cualquier forma de borrar filas de `audit_logs`: por Prisma o con SQL directo. */
const BORRA_BITACORA = [
  /\bauditLog\s*\.\s*(deleteMany|delete)\b/,
  /\bdelete\s+from\s+"?audit_logs"?/i,
  /\btruncate\s+(table\s+)?"?audit_logs"?/i,
];

/** Código sin comentarios: la historia de la purga vieja se puede contar en un comentario, no ejecutarse. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\r\n]*/g, '$1');

const borraBitacora = (src: string) => BORRA_BITACORA.some((r) => r.test(sinComentarios(src)));

describe('la bitácora tiene una sola regla de borrado', () => {
  it('el detector reconoce las formas de borrar y no se deja engañar por un comentario (la prueba de la prueba)', () => {
    expect(borraBitacora('// antes: this.prisma.auditLog.deleteMany({})')).toBe(false);
    expect(borraBitacora('/* DELETE FROM audit_logs */ const a = 1;')).toBe(false);
    expect(borraBitacora('await this.prisma.auditLog.deleteMany({})')).toBe(true);
    expect(borraBitacora('await tx.auditLog.delete({ where: { id } })')).toBe(true);
    expect(borraBitacora('await prisma.$executeRaw`DELETE FROM audit_logs WHERE 1=1`')).toBe(true);
    expect(borraBitacora('await prisma.$executeRawUnsafe(\'TRUNCATE TABLE "audit_logs"\')')).toBe(true);
    expect(borraBitacora('await this.prisma.auditLog.findMany({})')).toBe(false);
    expect(borraBitacora('await this.prisma.auditLog.create({ data })')).toBe(false);
  });

  it('solo audit/audit.service.ts borra de audit_logs', () => {
    const quienes = archivosTs(RAIZ)
      .filter((ruta) => borraBitacora(readFileSync(ruta, 'utf8')))
      .map(rel);
    expect(quienes).toEqual(['audit/audit.service.ts']);
  });

  it('la purga que se contradecía ya no existe: ni en el catálogo ni en el código', () => {
    expect(Object.keys(TAREAS_CATALOGO)).not.toContain('audit-cleanup');
    const quienes = archivosTs(RAIZ)
      .filter((ruta) =>
        /audit-cleanup|handleAuditCleanup|cronLimpiezaAuditoria/.test(sinComentarios(readFileSync(ruta, 'utf8'))),
      )
      .map(rel);
    expect(quienes).toEqual([]);
  });

  it('el catálogo dice que la purga corre los domingos 04:15 de México', () => {
    expect(TAREAS_CATALOGO['purga-bitacora']).toMatchObject({ cron: '15 4 * * 0', zona: 'MX' });
  });
});
