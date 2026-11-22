import { CrmActivitiesService } from '../crm-activities/crm-activities.service';
import { MobileCrmController } from './mobile-crm.controller';

/**
 * `GET mobile/crm/home`: el resumen del vendedor en el teléfono.
 *
 * Pedía la agenda sin la empresa y `getMyAgenda` la exige: la ruta respondía 403
 * «Empresa requerida» siempre, aunque la petición sí traía empresa.
 */
describe('mobile/crm/home', () => {
  const EMPRESA = 7;
  const vendedor = { id: 21 };

  function prismaDeVentas() {
    return {
      salesLead: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Prospecto Demo' }]) },
      salesOpportunity: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { value: 150000 }, _count: { _all: 2 } }),
      },
      salesTarget: { findFirst: jest.fn().mockResolvedValue({ revenueTarget: 300000 }) },
    };
  }

  it('pide la agenda con la empresa de la petición y arma los indicadores', async () => {
    const getMyAgenda = jest.fn().mockResolvedValue({ pendingToday: [{ id: 1 }, { id: 2 }], overdue: [{ id: 3 }] });
    const ctrl = new MobileCrmController(prismaDeVentas() as any, { getMyAgenda } as any);

    const inicio = await ctrl.home(vendedor, EMPRESA);

    expect(getMyAgenda).toHaveBeenCalledWith(21, EMPRESA);
    expect(inicio.kpis).toMatchObject({
      pendingToday: 2,
      overdue: 1,
      hotLeads: 1,
      revenueAchieved: 150000,
      revenueTarget: 300000,
      attainmentPct: 50,
      wonThisMonth: 2,
    });
  });

  it('con la agenda de verdad ya no responde 403: sus consultas van filtradas por la empresa', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const agenda = Object.create(CrmActivitiesService.prototype) as any;
    agenda.prisma = { crmActivity: { findMany, groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const ctrl = new MobileCrmController(prismaDeVentas() as any, agenda);

    const inicio = await ctrl.home(vendedor, EMPRESA);

    expect(inicio.kpis.pendingToday).toBe(0);
    expect(findMany).toHaveBeenCalled();
    for (const [args] of findMany.mock.calls) {
      expect(args.where).toMatchObject({ companyId: EMPRESA, ownerId: 21 });
    }
  });

  it('«este mes» es el de la empresa: la tarde del día 30 sigue siendo noviembre', async () => {
    // 30 de noviembre, 19:30 en México; en el reloj del servidor (UTC) ya es 1 de diciembre.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-12-01T01:30:00.000Z'));
    try {
      const prisma = prismaDeVentas();
      const ctrl = new MobileCrmController(prisma as any, { getMyAgenda: jest.fn().mockResolvedValue({ pendingToday: [], overdue: [] }) } as any);

      await ctrl.home(vendedor, EMPRESA);

      expect(prisma.salesOpportunity.aggregate.mock.calls[0][0].where.closedAt).toEqual({
        gte: new Date('2026-11-01T06:00:00.000Z'),
        lte: new Date('2026-12-01T05:59:59.999Z'),
      });
      expect(prisma.salesTarget.findFirst.mock.calls[0][0].where).toMatchObject({ year: 2026, month: 11 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('sin empresa en la petición sigue negando el acceso', async () => {
    const ctrl = new MobileCrmController(prismaDeVentas() as any, { getMyAgenda: jest.fn() } as any);
    await expect(ctrl.home(vendedor, null)).rejects.toThrow('Empresa requerida');
  });
});
