import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CronService } from './cron.service';
import {
  ACTIVITY_STATUS,
  isClosedStatus,
  normalizeActivityStatus,
} from '../../activities/activity-status';

/**
 * kpi-snapshot guardaba `activeActivities = 0` en las 1,515 filas de producción porque contaba el
 * estatus 'EN_PROGRESO', que ningún camino escribe (el real es 'En Proceso'). Estas pruebas comparan
 * el KPI contra un conteo independiente sobre filas en memoria, para que no vuelva a pasar.
 */

type FilaActividad = { id: number; estatus: string; deletedAt: Date | null };

const FILAS: FilaActividad[] = [
  { id: 1, estatus: 'En Proceso', deletedAt: null },
  { id: 2, estatus: 'En Progreso', deletedAt: null },
  { id: 3, estatus: 'EN_PROGRESO', deletedAt: null },
  { id: 4, estatus: 'Pendiente', deletedAt: null },
  { id: 5, estatus: 'Finalizada', deletedAt: null },
  { id: 6, estatus: 'Por Validar', deletedAt: null },
  // Borrada con borrado lógico: no cuenta en ningún KPI.
  { id: 7, estatus: 'En Proceso', deletedAt: new Date('2026-11-01T12:00:00.000Z') },
  // Cerradas con otras grafías: tampoco son «abiertas».
  { id: 8, estatus: 'Finalizado', deletedAt: null },
  { id: 9, estatus: 'No cumplida', deletedAt: null },
  { id: 10, estatus: 'Cancelada', deletedAt: null },
];

/**
 * Implementa de verdad `estatus.in`, `estatus.notIn` y `deletedAt`. Cualquier otra condición
 * lanza: así la prueba no pasa por accidente si el `where` cambia de forma sin que el falso lo note.
 */
function contarFilas(rows: FilaActividad[], where: any): number {
  const claves = Object.keys(where ?? {});
  const permitidas = ['estatus', 'deletedAt'];
  const raras = claves.filter((k) => !permitidas.includes(k));
  if (raras.length) throw new Error(`where no soportado por el falso: ${raras.join(', ')}`);

  const estatus = where?.estatus;
  if (estatus !== undefined && (typeof estatus !== 'object' || estatus === null)) {
    throw new Error('El falso solo entiende estatus como { in } o { notIn }');
  }
  const opcionesEstatus = Object.keys(estatus ?? {});
  const extra = opcionesEstatus.filter((k) => !['in', 'notIn'].includes(k));
  if (extra.length) throw new Error(`estatus no soportado por el falso: ${extra.join(', ')}`);

  return rows.filter((row) => {
    if (where.deletedAt === null && row.deletedAt) return false;
    if (estatus?.in && !estatus.in.includes(row.estatus)) return false;
    if (estatus?.notIn && estatus.notIn.includes(row.estatus)) return false;
    return true;
  }).length;
}

function build(rows: FilaActividad[] = FILAS) {
  const creados: any[] = [];
  const prisma = {
    activity: { count: jest.fn(async ({ where }: any) => contarFilas(rows, where)) },
    purchaseOrder: { count: jest.fn().mockResolvedValue(0) },
    invoice: { count: jest.fn().mockResolvedValue(0) },
    kpiSnapshot: {
      create: jest.fn(async (args: any) => {
        creados.push(args);
        return args.data;
      }),
    },
  };

  const service = new CronService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    undefined,
  );
  return { service, prisma, creados };
}

describe('kpi-snapshot: actividades contra el conteo real', () => {
  it('activeActivities cuenta las «En Proceso» con todas sus grafías y sin las borradas', async () => {
    const { service, creados } = build();
    await service.handleKpiSnapshot();

    expect(creados).toHaveLength(1);
    const { data } = creados[0];
    expect(data.kpiName).toBe('hourly_summary');

    // Conteo independiente: no usa los `where` de producción, solo el normalizador de estatus.
    const esperado = FILAS.filter(
      (r) => normalizeActivityStatus(r.estatus) === ACTIVITY_STATUS.EN_PROCESO && !r.deletedAt,
    ).length;
    expect(esperado).toBe(3);
    expect(data.metadata.activeActivities).toBe(esperado);
  });

  it('openActivities cuenta todo lo no cerrado (incluye «Por Validar») y sin las borradas', async () => {
    const { service, creados } = build();
    await service.handleKpiSnapshot();

    const { metadata } = creados[0].data;
    const esperado = FILAS.filter((r) => !r.deletedAt && !isClosedStatus(r.estatus)).length;
    expect(esperado).toBe(5);
    expect(metadata.openActivities).toBe(esperado);
    // Lo «en proceso» siempre es un subconjunto de lo abierto.
    expect(metadata.openActivities).toBeGreaterThanOrEqual(metadata.activeActivities);
  });

  it('marca las filas nuevas con version 2 y conserva los demás campos', async () => {
    const { service, creados } = build();
    await service.handleKpiSnapshot();

    const { data } = creados[0];
    expect(data.metadata.version).toBe(2);
    expect(data.metadata.pendingPOs).toBe(0);
    expect(data.metadata.overdueInvoices).toBe(0);
    expect(typeof data.metadata.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(data.metadata.timestamp))).toBe(false);
    expect(data.kpiCategory).toBe('operations');
  });

  it('con una tabla sin actividades en proceso guarda 0 de verdad (no por error de estatus)', async () => {
    const soloCerradas: FilaActividad[] = [
      { id: 1, estatus: 'Finalizada', deletedAt: null },
      { id: 2, estatus: 'Pendiente', deletedAt: null },
    ];
    const { service, creados } = build(soloCerradas);
    await service.handleKpiSnapshot();

    expect(creados[0].data.metadata.activeActivities).toBe(0);
    expect(creados[0].data.metadata.openActivities).toBe(1);
  });

  it('el falso rechaza un filtro con un estatus suelto (no deja pasar el error viejo)', () => {
    expect(() => contarFilas(FILAS, { estatus: 'EN_PROGRESO' })).toThrow();
  });
});

describe('regresión: nadie filtra Activity por el estatus inexistente EN_PROGRESO', () => {
  // Los momentos de evidencia ANTES / EN_PROGRESO / DESPUES son otra cosa y no usan `estatus:`.
  const PATRON = /estatus\s*:\s*['"`]EN_PROGRESO['"`]/;

  function archivosTs(dir: string, acumulado: string[] = []): string[] {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules') continue;
      const ruta = join(dir, nombre);
      const info = statSync(ruta);
      if (info.isDirectory()) archivosTs(ruta, acumulado);
      else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) acumulado.push(ruta);
    }
    return acumulado;
  }

  it('el patrón detecta el error viejo y deja pasar los momentos de evidencia', () => {
    expect(PATRON.test("count({ where: { estatus: 'EN_PROGRESO' } })")).toBe(true);
    expect(PATRON.test('where: { estatus : "EN_PROGRESO" }')).toBe(true);
    expect(PATRON.test("export const MOMENTOS = ['ANTES', 'EN_PROGRESO', 'DESPUES']")).toBe(false);
    expect(PATRON.test("type MomentoEvidencia = 'ANTES' | 'EN_PROGRESO' | 'DESPUES'")).toBe(false);
  });

  it('ningún archivo de apps/api/src (sin pruebas) usa estatus: EN_PROGRESO', () => {
    const raiz = resolve(__dirname, '..', '..');
    const archivos = archivosTs(raiz);
    // Si el recorrido no ve el código, la prueba pasaría vacía: exigimos un mínimo razonable.
    expect(archivos.length).toBeGreaterThan(100);

    const infractores = archivos
      .filter((ruta) => PATRON.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.slice(raiz.length + 1).replace(/\\/g, '/'));
    expect(infractores).toEqual([]);
  });
});
