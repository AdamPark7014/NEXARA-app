import { CeoBriefService } from './ceo-brief.service.js';
import { CeoBriefCronService, CATEGORIA_RESUMEN_CEO } from './ceo-brief.cron.js';

const NOW = new Date('2026-09-16T14:00:00Z'); // 08:00 en México, día siguiente al corte del 15

type Over = {
  vencidas?: number;
  sumaVencidas?: { totalAmount: number; paidAmount: number };
  ocFilas?: any[];
  cotizaciones?: number;
  actividades?: number;
  nomina?: string | null;
  fallaFacturas?: boolean;
};

function prismaFalso(over: Over = {}) {
  const llamadas: Record<string, any[]> = { invoiceCount: [], cotizacion: [], activityCount: [], purchaseOrder: [] };
  const prisma: any = {
    invoice: {
      count: async (a: any) => {
        llamadas.invoiceCount.push(a);
        if (over.fallaFacturas) throw new Error('caída');
        return over.vencidas ?? 0;
      },
      aggregate: async () => ({ _sum: over.sumaVencidas ?? { totalAmount: 0, paidAmount: 0 } }),
      findFirst: async () => (over.vencidas ? { dueDate: new Date('2026-08-27T00:00:00Z') } : null),
    },
    purchaseOrder: {
      findMany: async (a: any) => {
        llamadas.purchaseOrder.push(a);
        return over.ocFilas ?? [];
      },
    },
    cotizacion: {
      aggregate: async (a: any) => {
        llamadas.cotizacion.push(a);
        return { _count: { _all: over.cotizaciones ?? 0 }, _sum: { total: (over.cotizaciones ?? 0) * 1000 } };
      },
    },
    activity: {
      count: async (a: any) => {
        llamadas.activityCount.push(a);
        return a.where.fechaEntregaEsperada ? over.actividades ?? 0 : 0;
      },
    },
    systemSetting: {
      findMany: async () => (over.nomina ? [{ companyId: 7, value: over.nomina }] : []),
    },
  };
  return { prisma, llamadas };
}

const workflowCon = (pendientes: any[]) => ({ listMyPending: jest.fn(async () => pendientes) }) as any;
const politica = (puede: boolean) => ({ puedeUsar: jest.fn(async () => puede) }) as any;

describe('CeoBriefService', () => {
  it('junta cobranza vencida (neta de lo cobrado), aprobaciones con importe y nómina recién cerrada', async () => {
    const { prisma, llamadas } = prismaFalso({
      vencidas: 2,
      sumaVencidas: { totalAmount: 10000, paidAmount: 2500 },
      cotizaciones: 1,
      actividades: 3,
      nomina: '{"frecuencia":"quincenal"}',
    });
    const pendientes = [
      { createdAt: '2026-09-12T15:00:00Z', resumen: { titulo: 'Orden de compra OC-1', detalle: 'CT', monto: 48250, moneda: 'MXN' } },
      { createdAt: '2026-09-15T15:00:00Z', resumen: { titulo: 'Gasto', detalle: null, monto: 5000, moneda: 'MXN' } },
      { createdAt: '2026-09-15T16:00:00Z', resumen: null },
    ];
    const s = new CeoBriefService(prisma, workflowCon(pendientes), politica(true));
    const r = await s.resumen(7, { id: 1, roleKey: 'ceo' }, NOW);

    expect(r.fecha).toBe('2026-09-16');
    expect(r.vacio).toBe(false);
    const claves = r.items.map((i) => i.clave);
    expect(claves).toEqual(['aprobaciones', 'cobranza', 'cotizaciones', 'operacion', 'nomina']);
    expect(r.items[0].texto).toBe('3 solicitudes por aprobar ($53,250), la más antigua lleva 3 días');
    expect(r.items[1].texto).toContain('2 facturas vencidas por cobrar ($7,500)');
    expect(r.items[1].texto).toContain('la más atrasada lleva 20 días');
    expect(r.items[4].texto).toContain('1.ª quincena de septiembre de 2026');
    expect(r.prioridad).toBe('alta'); // la aprobación más antigua lleva 3 días

    // Todo acotado a la empresa
    expect(llamadas.invoiceCount[0].where.companyId).toBe(7);
    expect(llamadas.invoiceCount[0].where.type).toBe('ACCOUNTS_RECEIVABLE');
    expect(llamadas.cotizacion[0].where.companyId).toBe(7);
    expect(llamadas.purchaseOrder[0].where.companyId).toBe(7);
  });

  it('la nómina solo aparece si quien lee ve «Pagos a personal»', async () => {
    const { prisma } = prismaFalso({ nomina: '{"frecuencia":"quincenal"}' });
    const s = new CeoBriefService(prisma, workflowCon([]), politica(false));
    const r = await s.resumen(7, { id: 2, roleKey: 'contabilidad' }, NOW);
    expect(r.items.map((i) => i.clave)).not.toContain('nomina');
    expect(r.vacio).toBe(true);
  });

  it('sin calendario de nómina configurado no se avisa de nómina', async () => {
    const { prisma } = prismaFalso({ nomina: null });
    const r = await new CeoBriefService(prisma, workflowCon([]), politica(true)).resumen(7, { id: 1 }, NOW);
    expect(r.vacio).toBe(true);
  });

  it('una consulta que falla no tumba el resumen: ese renglón simplemente no aparece', async () => {
    const { prisma } = prismaFalso({ fallaFacturas: true, cotizaciones: 2 });
    const r = await new CeoBriefService(prisma, workflowCon([]), politica(true)).resumen(7, { id: 1 }, NOW);
    expect(r.items.map((i) => i.clave)).toEqual(['cotizaciones']);
  });

  it('las compras atrasadas usan la misma regla que el aviso a compradores', async () => {
    const { prisma } = prismaFalso({
      ocFilas: [
        // Atrasada: prometida el 10, sin recibir.
        { id: 1, poNumber: 'OC-1', companyId: 7, status: 'CONFIRMED', expectedDate: new Date('2026-09-10T00:00:00Z'), createdById: 5, approvedById: null, items: [{ quantity: 4, receivedQty: 0 }] },
        // Ya recibida completa: no cuenta.
        { id: 2, poNumber: 'OC-2', companyId: 7, status: 'PARTIALLY_RECEIVED', expectedDate: new Date('2026-09-10T00:00:00Z'), createdById: 5, approvedById: null, items: [{ quantity: 4, receivedQty: 4 }] },
        // Sin responsable: igual está atrasada para el CEO.
        { id: 3, poNumber: 'OC-3', companyId: 7, status: 'SENT', expectedDate: new Date('2026-09-14T00:00:00Z'), createdById: null, approvedById: null, items: [{ quantity: 1, receivedQty: 0 }] },
      ],
    });
    const r = await new CeoBriefService(prisma, workflowCon([]), politica(true)).resumen(7, { id: 1 }, NOW);
    expect(r.items[0]).toMatchObject({ clave: 'compras', texto: '2 órdenes de compra atrasadas' });
  });
});

describe('CeoBriefCronService', () => {
  function crear(opciones: { destinatarios?: any[]; yaRecibieron?: any[]; vacio?: boolean } = {}) {
    const usuarios = opciones.destinatarios ?? [{ id: 1, roleKey: 'ceo' }];
    const userFindMany = jest.fn(async () => usuarios);
    const prisma: any = {
      companyProfile: { findMany: async () => [{ id: 7 }, { id: 9 }] },
      user: { findMany: userFindMany },
      notification: { findMany: async () => opciones.yaRecibieron ?? [] },
    };
    const brief = {
      resumen: jest.fn(async () =>
        opciones.vacio
          ? { vacio: true, titulo: 'Todo al día', mensaje: '', prioridad: 'normal', items: [], fecha: '2026-09-16' }
          : { vacio: false, titulo: 'Tu día: 3 por aprobar', mensaje: '3 solicitudes por aprobar', prioridad: 'alta', items: [{ url: '/erp/approvals' }], fecha: '2026-09-16' },
      ),
    } as any;
    const createNotification = jest.fn(async () => ({}));
    const cron = new CeoBriefCronService(prisma, brief, { createNotification } as any);
    return { cron, userFindMany, brief, createNotification };
  }

  it('manda un aviso por empresa al CEO, con prioridad alta cuando hay algo grave', async () => {
    const { cron, createNotification } = crear();
    expect(await cron.enviar(NOW)).toBe(2);
    const arg = (createNotification.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({
      userId: 1,
      category: CATEGORIA_RESUMEN_CEO,
      companyId: 7,
      priority: 'high',
      relatedUrl: '/erp/approvals',
      dedupeSeconds: 0,
    });
    expect((createNotification.mock.calls[1] as any[])[0].companyId).toBe(9);
  });

  it('busca al CEO por rol o por ser el dueño, solo miembros activos de esa empresa', async () => {
    const { cron, userFindMany } = crear();
    await cron.enviar(NOW);
    const where = (userFindMany.mock.calls[0] as any[])[0].where;
    expect(where.isActive).toBe(true);
    expect(where.companyMemberships).toEqual({ some: { companyId: 7 } });
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ roleKey: 'ceo' });
  });

  it('no manda nada si no hay pendientes ni repite el mismo día', async () => {
    const vacio = crear({ vacio: true });
    expect(await vacio.cron.enviar(NOW)).toBe(0);
    expect(vacio.createNotification).not.toHaveBeenCalled();

    const repetido = crear({ yaRecibieron: [{ userId: 1 }] });
    expect(await repetido.cron.enviar(NOW)).toBe(0);
    expect(repetido.brief.resumen).not.toHaveBeenCalled();
  });

  it('un fallo con un destinatario no detiene a los demás', async () => {
    const { cron, brief, createNotification } = crear({ destinatarios: [{ id: 1, roleKey: 'ceo' }, { id: 2, roleKey: 'ceo' }] });
    brief.resumen.mockRejectedValueOnce(new Error('boom'));
    const enviados = await cron.enviar(NOW);
    expect(enviados).toBe(3); // 2 empresas × 2 CEO, menos el que falló
    expect(createNotification).toHaveBeenCalledTimes(3);
  });
});
