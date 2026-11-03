/**
 * «Válida hasta el 18» incluye todo el 18 en México. La regla está en `estado-cotizacion.ts`; aquí, que
 * las consultas digan lo mismo: el último día sigue en los avisos de «por vencer» y todavía no es vencida.
 */
import { ActivityFeedService } from '../activity-feed/activity-feed.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { workDateColumn } from '../common/time/workday.js';
import { CeoBriefService } from '../executive/ceo-brief.service.js';
import { DireccionService } from '../me/direccion.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CotizacionesCoreService } from './cotizaciones-core.service.js';
import { SeguimientoCotizacionService } from './seguimiento-cotizacion.service.js';

const DIA = 24 * 60 * 60 * 1000;
// 08:00 en México: en UTC, el día 18 ya lleva horas y su medianoche quedó atrás.
const NOW = new Date('2026-11-18T14:00:00Z');
const HOY = new Date('2026-11-18');

/** Un Prisma que responde vacío a todo y guarda lo que se le pide a `cotizacion`. */
function prismaVacio() {
  const consultas: any[] = [];
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_o, metodo) => async (args: any) => {
          if (nombre === 'cotizacion') consultas.push(args);
          if (metodo === 'count') return 0;
          if (metodo === 'aggregate') return { _count: { _all: 0 }, _sum: { total: 0 } };
          if (metodo === 'findFirst' || metodo === 'findUnique') return null;
          return [];
        },
      },
    );
  const prisma = new Proxy({}, { get: (_o, nombre) => (typeof nombre === 'string' && nombre !== 'then' ? modelo(nombre) : undefined) });
  const conVigencia = () => consultas.map((c) => c?.where).filter((w) => w?.validUntil && typeof w.validUntil === 'object');
  return { prisma: prisma as any, conVigencia };
}

describe('las consultas cuentan el último día de vigencia', () => {
  it('el resumen de dirección la sigue contando como por vencer', async () => {
    const { prisma, conVigencia } = prismaVacio();
    const servicio = new CeoBriefService(prisma, { listMyPending: async () => [] } as any, { puedeUsar: async () => false } as any);
    await servicio.datos(7, { id: 1, roleKey: 'ceo' } as any, NOW);
    const [filtro] = conVigencia().filter((w) => w.status === 'SENT');
    expect(HOY.getTime()).toBeGreaterThanOrEqual(filtro.validUntil.gte.getTime());
    expect(new Date(HOY.getTime() - DIA).getTime()).toBeLessThan(filtro.validUntil.gte.getTime());
  });

  it('«Mi día» de dirección también', async () => {
    const { prisma, conVigencia } = prismaVacio();
    const servicio = new DireccionService(prisma, { getEquipo: async () => ({ personas: [] }) } as any);
    await servicio.hoy({ id: 1, roleKey: 'ceo' } as any, 7, NOW);
    const [filtro] = conVigencia();
    expect(HOY.getTime()).toBeGreaterThanOrEqual(filtro.validUntil.gte.getTime());
  });

  it('el feed la avisa como por expirar', async () => {
    const { prisma, conVigencia } = prismaVacio();
    await new ActivityFeedService(prisma).getFeed(1, 7, [PERMISSIONS.SALES_VIEW]);
    const [filtro] = conVigencia().filter((w) => w.status === 'SENT');
    expect(workDateColumn(new Date()).getTime()).toBeGreaterThanOrEqual(filtro.validUntil.gte.getTime());
  });

  it('a un borrador en su último día se le sigue preguntando si ya salió', async () => {
    const findMany = jest.fn(async (_a: any) => []);
    const servicio = new SeguimientoCotizacionService({ cotizacion: { findMany } } as any, {} as any);
    await (servicio as any).preguntarSiLaMando(NOW);
    const vigente = findMany.mock.calls[0]![0].where.OR.find((o: any) => o.validUntil);
    expect(HOY.getTime()).toBeGreaterThanOrEqual(vigente.validUntil.gte.getTime());
  });

  it('a un borrador no se le avisa «vencida» hasta que termine su último día', async () => {
    const findMany = jest.fn(async (_a: any) => []);
    const servicio = new NotificationsService({ cotizacion: { findMany } } as any, {} as any);
    await servicio.checkExpiredQuotes();
    const { lt } = findMany.mock.calls[0]![0].where.validUntil;
    const hoy = workDateColumn(new Date());
    expect(hoy.getTime()).not.toBeLessThan(lt.getTime());
    expect(hoy.getTime() - DIA).toBeLessThan(lt.getTime());
  });
});

describe('la tarea de las 6 am', () => {
  const candidata = (id: number, validUntil: string) => ({ id, quoteNumber: `NEX-${id}`, validUntil: new Date(validUntil), createdById: 9, companyId: 7, status: 'SENT' });

  it('deja viva la del último día y vence la de ayer', async () => {
    const update = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => [candidata(1, '2026-11-18'), candidata(2, '2026-11-17')]);
    const servicio = new (CotizacionesCoreService as any)({ cotizacion: { findMany, update } });
    const avisar = jest.spyOn(servicio, 'avisar').mockResolvedValue(undefined);
    // 06:00 en México del día 18.
    expect(await servicio.marcarVencidas(new Date('2026-11-18T12:00:00Z'))).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls as any[][])[0]![0]).toMatchObject({ where: { id: 2 }, data: { status: 'EXPIRED' } });
    expect(avisar).toHaveBeenCalledTimes(1);
  });
});
