import { SettingsService } from '../../settings/settings.service.js';
import { conBaseDesechable } from './base-desechable';
import {
  CACHE_PILOTO_MS,
  CLAVES_PILOTO,
  interpretarModoPiloto,
  leerModoPiloto,
  reiniciarCachePiloto,
  type LectorSettings,
} from './interruptor-piloto';

const CLAVE = 'piloto.prueba.interruptor';
const T0 = 1_800_000_000_000;

/** Prisma simulado: `valor` es lo que contesta `findFirst` (null = sin fila). */
function simulado(valor: string | null | Error) {
  const findFirst = jest.fn(async (_args: unknown) => {
    if (valor instanceof Error) throw valor;
    return valor === null ? null : { value: valor };
  });
  return { prisma: { systemSetting: { findFirst } } as LectorSettings, findFirst };
}

describe('interruptor del Piloto', () => {
  beforeEach(() => reiniciarCachePiloto());

  describe('interpretarModoPiloto', () => {
    it.each(['activo', 'ACTIVO', ' Activo ', 'on', 'ON', 'true', 'True', '1', 'si', 'sí', 'Sí', 'SÍ ', 'encendido', 'prendido'])(
      '%j = activo',
      (valor) => expect(interpretarModoPiloto(valor)).toBe('activo'),
    );
    it.each(['observar', 'Observar', ' OBSERVAR ', 'observa', 'observación', 'observacion'])('%j = observar', (valor) =>
      expect(interpretarModoPiloto(valor)).toBe('observar'),
    );
    it.each(['apagado', 'Apagado', 'off', 'OFF', 'false', '0', 'no', 'desactivado', 'inactivo'])('%j = apagado', (valor) =>
      expect(interpretarModoPiloto(valor)).toBe('apagado'),
    );
    it.each(['', '   ', 'quizá', 'encender', '2', 'ona', 'activo!', 'null', 'undefined'])('%j no se entiende', (valor) =>
      expect(interpretarModoPiloto(valor)).toBeNull(),
    );
    it.each([null, undefined, 1, true, {}, []])('un valor que no es texto (%p) no se entiende', (valor) =>
      expect(interpretarModoPiloto(valor)).toBeNull(),
    );
  });

  describe('leerModoPiloto', () => {
    it('sin fila = apagado', async () => {
      const { prisma } = simulado(null);
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0)).toBe('apagado');
    });

    it('sin fila, quien llama puede pedir otro valor por omisión', async () => {
      const { prisma } = simulado(null);
      expect(await leerModoPiloto(prisma, CLAVE, 'observar', T0)).toBe('observar');
      // La lectura quedó en caché como «sin fila»: otro llamador con otra omisión recibe la suya, no la del primero.
      expect(await leerModoPiloto(prisma, CLAVE, 'activo', T0 + 1)).toBe('activo');
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 2)).toBe('apagado');
    });

    it.each(['on', '1', 'sí', 'si', 'true', 'activo'])('%j = activo', async (valor) => {
      const { prisma } = simulado(valor);
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0)).toBe('activo');
    });

    it('observar y activo se distinguen', async () => {
      expect(await leerModoPiloto(simulado('observar').prisma, 'piloto.a', undefined, T0)).toBe('observar');
      expect(await leerModoPiloto(simulado('activo').prisma, 'piloto.b', undefined, T0)).toBe('activo');
    });

    it('un valor mal escrito apaga siempre, aunque quien llama pida otra cosa por omisión', async () => {
      expect(await leerModoPiloto(simulado('quizá').prisma, 'piloto.a', undefined, T0)).toBe('apagado');
      expect(await leerModoPiloto(simulado('quizá').prisma, 'piloto.b', 'observar', T0)).toBe('apagado');
      // El caso que importa: un «actvo» con error de dedo no puede encender a quien tenga «activo» por omisión.
      expect(await leerModoPiloto(simulado('actvo').prisma, 'piloto.c', 'activo', T0)).toBe('apagado');
    });

    it('«apagado» escrito a propósito apaga aunque quien llama pida observar por omisión', async () => {
      const { prisma } = simulado('apagado');
      expect(await leerModoPiloto(prisma, CLAVE, 'observar', T0)).toBe('apagado');
    });

    it('busca la fila por clave SIN mirar la empresa y, si hay varias, toma la tocada más recientemente', async () => {
      const { prisma, findFirst } = simulado('activo');
      await leerModoPiloto(prisma, CLAVE, undefined, T0);
      expect(findFirst).toHaveBeenCalledTimes(1);
      const args = findFirst.mock.calls[0][0] as { where: Record<string, unknown>; orderBy: unknown };
      expect(args.where).toEqual({ key: CLAVE });
      expect(args.where).not.toHaveProperty('companyId');
      expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    });

    it('la segunda lectura dentro de 30 s no consulta la base; a los 30 s sí', async () => {
      const { prisma, findFirst } = simulado('activo');
      await leerModoPiloto(prisma, CLAVE, undefined, T0);
      await leerModoPiloto(prisma, CLAVE, undefined, T0 + 1);
      await leerModoPiloto(prisma, CLAVE, undefined, T0 + CACHE_PILOTO_MS - 1);
      expect(findFirst).toHaveBeenCalledTimes(1);
      await leerModoPiloto(prisma, CLAVE, undefined, T0 + CACHE_PILOTO_MS);
      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('la caché dura 30 s exactos', () => expect(CACHE_PILOTO_MS).toBe(30_000));

    it('un cambio en la base se ve a los 30 s, no antes', async () => {
      const findFirst = jest.fn().mockResolvedValueOnce({ value: 'apagado' }).mockResolvedValue({ value: 'activo' });
      const prisma = { systemSetting: { findFirst } };
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0)).toBe('apagado');
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 10_000)).toBe('apagado');
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 30_000)).toBe('activo');
    });

    it('cada clave tiene su propia caché', async () => {
      const findFirst = jest.fn(async (args: { where: { key: string } }) => ({
        value: args.where.key === 'piloto.a' ? 'activo' : 'observar',
      }));
      const prisma = { systemSetting: { findFirst } };
      expect(await leerModoPiloto(prisma, 'piloto.a', undefined, T0)).toBe('activo');
      expect(await leerModoPiloto(prisma, 'piloto.b', undefined, T0)).toBe('observar');
      expect(await leerModoPiloto(prisma, 'piloto.a', undefined, T0 + 1)).toBe('activo');
      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('si el reloj se atrasa no se queda pegado a una lectura «del futuro»', async () => {
      const { prisma, findFirst } = simulado('activo');
      await leerModoPiloto(prisma, CLAVE, undefined, T0);
      await leerModoPiloto(prisma, CLAVE, undefined, T0 - 5_000);
      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('lecturas simultáneas de la misma clave comparten una sola consulta', async () => {
      const { prisma, findFirst } = simulado('observar');
      const modos = await Promise.all([
        leerModoPiloto(prisma, CLAVE, undefined, T0),
        leerModoPiloto(prisma, CLAVE, undefined, T0),
        leerModoPiloto(prisma, CLAVE, undefined, T0),
      ]);
      expect(modos).toEqual(['observar', 'observar', 'observar']);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    describe('si la base falla', () => {
      it('devuelve el último valor leído', async () => {
        const findFirst = jest.fn().mockResolvedValueOnce({ value: 'activo' }).mockRejectedValue(new Error('conexión perdida'));
        const prisma = { systemSetting: { findFirst } };
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0)).toBe('activo');
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + CACHE_PILOTO_MS)).toBe('activo');
        expect(findFirst).toHaveBeenCalledTimes(2);
      });

      it('conserva también «observar»', async () => {
        const findFirst = jest.fn().mockResolvedValueOnce({ value: 'observar' }).mockRejectedValue(new Error('caída'));
        const prisma = { systemSetting: { findFirst } };
        await leerModoPiloto(prisma, CLAVE, undefined, T0);
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 60_000)).toBe('observar');
      });

      it('si nunca se había leído devuelve el valor por omisión, sin lanzar', async () => {
        const { prisma } = simulado(new Error('caída'));
        await expect(leerModoPiloto(prisma, CLAVE, undefined, T0)).resolves.toBe('apagado');
        await expect(leerModoPiloto(prisma, 'piloto.otra', 'observar', T0)).resolves.toBe('observar');
      });

      it('no martilla la base: tras un fallo espera otros 30 s antes de reintentar', async () => {
        const { prisma, findFirst } = simulado(new Error('caída'));
        await leerModoPiloto(prisma, CLAVE, undefined, T0);
        await leerModoPiloto(prisma, CLAVE, undefined, T0 + 1_000);
        await leerModoPiloto(prisma, CLAVE, undefined, T0 + 29_000);
        expect(findFirst).toHaveBeenCalledTimes(1);
        await leerModoPiloto(prisma, CLAVE, undefined, T0 + 30_000);
        expect(findFirst).toHaveBeenCalledTimes(2);
      });

      it('cuando la base vuelve, se ve el valor nuevo', async () => {
        const findFirst = jest
          .fn()
          .mockResolvedValueOnce({ value: 'activo' })
          .mockRejectedValueOnce(new Error('caída'))
          .mockResolvedValue({ value: 'apagado' });
        const prisma = { systemSetting: { findFirst } };
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0)).toBe('activo');
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 30_000)).toBe('activo');
        expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 60_000)).toBe('apagado');
      });

      it('un cliente sin systemSetting (pruebas, scripts) tampoco lanza', async () => {
        const prisma = {} as unknown as LectorSettings;
        await expect(leerModoPiloto(prisma, CLAVE, undefined, T0)).resolves.toBe('apagado');
      });
    });

    it('reiniciarCachePiloto limpia: la siguiente lectura vuelve a la base', async () => {
      const { prisma, findFirst } = simulado('activo');
      await leerModoPiloto(prisma, CLAVE, undefined, T0);
      reiniciarCachePiloto();
      await leerModoPiloto(prisma, CLAVE, undefined, T0 + 1);
      expect(findFirst).toHaveBeenCalledTimes(2);
    });

    it('reiniciarCachePiloto también olvida lo último leído (no queda un valor viejo para un fallo)', async () => {
      const findFirst = jest.fn().mockResolvedValueOnce({ value: 'activo' }).mockRejectedValue(new Error('caída'));
      const prisma = { systemSetting: { findFirst } };
      await leerModoPiloto(prisma, CLAVE, undefined, T0);
      reiniciarCachePiloto();
      expect(await leerModoPiloto(prisma, CLAVE, undefined, T0 + 1)).toBe('apagado');
    });
  });

  describe('CLAVES_PILOTO', () => {
    it('son únicas, bajo «piloto.» y sin espacios', () => {
      const claves = Object.values(CLAVES_PILOTO);
      expect(new Set(claves).size).toBe(claves.length);
      for (const clave of claves) expect(clave).toMatch(/^piloto\.[a-z_]+\.[a-z_]+$/);
      expect(claves).toEqual(
        expect.arrayContaining([
          'piloto.contratos.aviso_sin_responsable',
          'piloto.evidencias.escalada_ampliada',
          'piloto.contactos.avisos',
          'piloto.crm.recordatorios',
          'piloto.vehiculos.vencimientos',
        ]),
      );
    });
  });
});

/**
 * Contra Postgres de verdad (se salta sin `NEXARA_PRUEBAS_URL`): lo que `PUT /api/settings` guarda con la empresa de
 * quien llama lo ve un timer que no tiene empresa.
 */
conBaseDesechable('interruptor del Piloto contra Postgres', (base) => {
  beforeEach(() => reiniciarCachePiloto());

  const crearEmpresa = (rfc: string) => base.prisma.companyProfile.create({ data: { legalName: `Empresa ${rfc}`, rfc } });
  /** Lo mismo que hace PUT /api/settings: `SettingsService.upsert` con la empresa de quien llama. */
  const ajustes = () => new SettingsService(base.prisma as never);

  it('sin fila = apagado', async () => {
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('apagado');
  });

  it('la fila que guarda PUT /settings con la empresa de Adam se ve desde un timer sin empresa', async () => {
    const empresa = await crearEmpresa('AAA010101AAA');
    await ajustes().upsert(CLAVE, 'activo', 'piloto', 'Prueba', empresa.id);

    // Lo que habría visto un lector «de plataforma»: nada.
    expect(await ajustes().getValue(CLAVE, null)).toBeNull();
    // El interruptor del Piloto, sin empresa ni petición:
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('activo');
  });

  it('observar y apagado también llegan desde la fila de una empresa', async () => {
    const empresa = await crearEmpresa('BBB020202BBB');
    await ajustes().upsert(CLAVE, 'observar', 'piloto', undefined, empresa.id);
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('observar');
    await ajustes().upsert(CLAVE, 'apagado', 'piloto', undefined, empresa.id);
    reiniciarCachePiloto();
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('apagado');
  });

  it('la fila de plataforma (sin empresa) también cuenta', async () => {
    await ajustes().upsert(CLAVE, 'si', 'piloto', undefined, null);
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('activo');
  });

  it('con una fila de plataforma y otra de empresa manda la tocada más recientemente (también para apagar)', async () => {
    const empresa = await crearEmpresa('CCC030303CCC');
    // Las migraciones dejan además un índice único viejo solo sobre `key` (`system_settings_key_key`: la migración
    // 20260725260000 solo lo quita si fuera una restricción, y nació como índice), que impide dos filas con la misma
    // clave. El esquema de Prisma declara (key, companyId): se prueba el lector contra ESE esquema.
    await base.prisma.$executeRawUnsafe('drop index if exists "system_settings_key_key"');
    await ajustes().upsert(CLAVE, 'activo', 'piloto', undefined, null);
    await new Promise((r) => setTimeout(r, 20));
    await ajustes().upsert(CLAVE, 'apagado', 'piloto', undefined, empresa.id);
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('apagado');

    await new Promise((r) => setTimeout(r, 20));
    await ajustes().upsert(CLAVE, 'observar', 'piloto', undefined, null);
    reiniciarCachePiloto();
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('observar');
  });

  it('una clave no se confunde con otra parecida', async () => {
    const empresa = await crearEmpresa('DDD040404DDD');
    await ajustes().upsert(`${CLAVE}.otra`, 'activo', 'piloto', undefined, empresa.id);
    expect(await leerModoPiloto(base.prisma as never, CLAVE)).toBe('apagado');
  });
});
