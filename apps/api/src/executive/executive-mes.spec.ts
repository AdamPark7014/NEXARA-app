import { ExecutiveService } from './executive.service';
import { SalesTargetsService } from '../sales-targets/sales-targets.service';

/**
 * «Este mes» en el tablero de dirección y en el desempeño contra metas.
 *
 * El mes se armaba con el reloj del servidor (UTC): el último día del mes, de las 18:00 en
 * adelante, el tablero ya contaba el mes siguiente (en ceros) y lo cerrado esa tarde se sumaba a
 * ese otro mes, comisiones incluidas. Ahora el mes es el de la empresa.
 */

// 30 de noviembre, 19:30 en México. En UTC ya es 1 de diciembre.
const TARDE_DEL_ULTIMO_DIA = new Date('2026-12-01T01:30:00.000Z');
const NOVIEMBRE = { gte: new Date('2026-11-01T06:00:00.000Z'), lte: new Date('2026-12-01T05:59:59.999Z') };
const OCTUBRE = { gte: new Date('2026-10-01T06:00:00.000Z'), lte: new Date('2026-11-01T05:59:59.999Z') };

/** Prisma de mentira que apunta cada consulta y responde vacío. */
function prismaQueApunta() {
  const llamadas: Array<{ modelo: string; metodo: string; args: any }> = [];
  const vacio = (metodo: string) => {
    if (metodo === 'aggregate') return { _sum: {}, _count: { _all: 0 } };
    if (metodo === 'count') return 0;
    if (metodo === 'findFirst' || metodo === 'findUnique') return null;
    return [];
  };
  const modelo = (nombre: string) =>
    new Proxy({}, {
      get: (_t, metodo: string) => (args: any) => {
        llamadas.push({ modelo: nombre, metodo, args });
        return Promise.resolve(vacio(metodo));
      },
    });
  const prisma: any = new Proxy(
    { $queryRaw: async () => [{ n: 0 }] },
    { get: (t: any, k: string) => (k in t ? t[k] : modelo(k)) },
  );
  const de = (nombre: string, metodo: string) =>
    llamadas.filter((l) => l.modelo === nombre && l.metodo === metodo).map((l) => l.args.where);
  return { prisma, de };
}

describe('el mes de la empresa en dirección y metas', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(TARDE_DEL_ULTIMO_DIA);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('tablero de dirección: la tarde del día 30 sigue contando noviembre', async () => {
    const { prisma, de } = prismaQueApunta();

    await new ExecutiveService(prisma).getCLevelDashboard(7);

    const ganadas = de('salesOpportunity', 'aggregate').filter((w) => w.stage === 'WON');
    // Ventas del mes, del mes anterior y del año.
    expect(ganadas[0].closedAt).toEqual(NOVIEMBRE);
    expect(ganadas[1].closedAt).toEqual(OCTUBRE);
    expect(ganadas[2].closedAt).toEqual({ gte: new Date('2026-01-01T06:00:00.000Z') });
    expect(de('salesOpportunity', 'count')[0].closedAt).toEqual(NOVIEMBRE);
    expect(de('salesOpportunity', 'groupBy')[0].closedAt).toEqual(NOVIEMBRE);

    // Actividades terminadas en el mes (órdenes y tickets).
    const terminadas = de('activity', 'count').filter((w) => w.fechaFinalizacion);
    expect(terminadas).toHaveLength(2);
    for (const w of terminadas) expect(w.fechaFinalizacion).toEqual(NOVIEMBRE);
  });

  it('tablero de dirección: lo facturado en el mes va por día calendario, del 1 al 30', async () => {
    const { prisma, de } = prismaQueApunta();

    await new ExecutiveService(prisma).getCLevelDashboard(7);

    // La fecha de la factura guarda solo el día (medianoche UTC): con el corte a las 06:00 el día 1 quedaría fuera.
    const facturado = de('invoice', 'aggregate').find((w) => w.issueDate);
    expect(facturado.issueDate).toEqual({
      gte: new Date('2026-11-01T00:00:00.000Z'),
      lte: new Date('2026-11-30T23:59:59.999Z'),
    });
  });

  it('metas: sin pedir mes, el desempeño es el de noviembre y busca la meta de noviembre', async () => {
    const { prisma, de } = prismaQueApunta();
    prisma.salesTarget = {
      findMany: async (args: any) => {
        // La meta se busca por el año y el mes de la empresa.
        expect(args.where).toMatchObject({ companyId: 7, period: 'MONTHLY', year: 2026, month: 11 });
        return [{ id: 1, ownerId: 21, revenueTarget: 100000, bonusThresholdPct: 100, baseCommissionPct: 2, bonusCommissionPct: 1 }];
      },
    };

    const desempeno: any = await new SalesTargetsService(prisma).getPerformance(undefined, undefined, 7);

    expect(de('salesOpportunity', 'aggregate')[0]).toMatchObject({ ownerId: 21, closedAt: NOVIEMBRE });
    expect(de('salesOpportunity', 'count')[0].createdAt).toEqual(NOVIEMBRE);
    expect(de('salesLead', 'count')[0].createdAt).toEqual(NOVIEMBRE);
    expect(desempeno).toMatchObject({ year: 2026, month: 11 });
    expect(desempeno.performance[0]).toMatchObject({ ownerId: 21, year: 2026, month: 11, hasQuota: true });
  });

  it('metas: un mes pedido por número cubre ese mes de la empresa', async () => {
    const { prisma, de } = prismaQueApunta();
    prisma.salesTarget = { findMany: async () => [{ id: 1, ownerId: 21, revenueTarget: 0 }] };

    await new SalesTargetsService(prisma).getPerformance(2026, 10, 7);

    expect(de('salesOpportunity', 'aggregate')[0].closedAt).toEqual(OCTUBRE);
  });
});
