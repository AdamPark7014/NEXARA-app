import { ExecutiveService, saldoPendiente } from './executive.service.js';

/** Prisma de mentira: cualquier consulta devuelve «vacío»; se captura lo que interesa. */
function prismaFalso(over: { invoiceCount?: number; invoiceSums?: Record<string, any>; stock?: number } = {}) {
  const llamadas: Record<string, any[]> = { invoiceCount: [], invoiceAggregate: [], activityCount: [], raw: [] };
  const vacio = (metodo: string) => {
    if (metodo === 'aggregate') return { _sum: {}, _count: { _all: 0 } };
    if (metodo === 'count') return 0;
    return [];
  };
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_t, metodo: string) => async (args: any) => {
          if (nombre === 'invoice' && metodo === 'count') {
            llamadas.invoiceCount.push(args);
            return over.invoiceCount ?? 0;
          }
          if (nombre === 'invoice' && metodo === 'aggregate') {
            llamadas.invoiceAggregate.push(args);
            return { _sum: over.invoiceSums?.[args.where.type] ?? {}, _count: { _all: 0 } };
          }
          if (nombre === 'activity' && metodo === 'count') llamadas.activityCount.push(args);
          return vacio(metodo);
        },
      },
    );
  const prisma: any = new Proxy(
    {
      $queryRaw: async (...args: any[]) => {
        llamadas.raw.push(args);
        return [{ n: over.stock ?? 0 }];
      },
    },
    { get: (t: any, k: string) => (k in t ? t[k] : modelo(k)) },
  );
  return { prisma, llamadas };
}

describe('saldoPendiente', () => {
  it('resta lo ya cobrado al importe', () => {
    expect(saldoPendiente({ totalAmount: '1160.00', paidAmount: '500.50' })).toBe(659.5);
  });
  it('sin datos o pagado de más no da negativos ni NaN', () => {
    expect(saldoPendiente(null)).toBe(0);
    expect(saldoPendiente({ totalAmount: 100, paidAmount: 250 })).toBe(0);
    expect(saldoPendiente({})).toBe(0);
  });
});

describe('ExecutiveService.getCLevelDashboard · indicadores de cobranza, saldos y stock', () => {
  it('facturas vencidas se cuentan por fecha, solo cobranza y con saldo (no por el estado OVERDUE)', async () => {
    const { prisma, llamadas } = prismaFalso({ invoiceCount: 4 });
    const r = await new ExecutiveService(prisma).getCLevelDashboard(7);
    expect(r.finance.overdueInvoices).toBe(4);

    const where = llamadas.invoiceCount[0].where;
    expect(where.type).toBe('ACCOUNTS_RECEIVABLE');
    expect(where.status.in).toEqual(expect.arrayContaining(['SENT', 'PARTIALLY_PAID']));
    expect(where.status.in).not.toContain('PAID');
    expect(where.dueDate.lt).toBeInstanceOf(Date);
    expect(where.deletedAt).toBeNull();
  });

  it('por cobrar y por pagar restan lo ya pagado', async () => {
    const { prisma, llamadas } = prismaFalso({
      invoiceSums: {
        ACCOUNTS_RECEIVABLE: { totalAmount: 10000, paidAmount: 2500 },
        ACCOUNTS_PAYABLE: { totalAmount: 4000, paidAmount: 1000 },
      },
    });
    const r = await new ExecutiveService(prisma).getCLevelDashboard(7);
    expect(r.headlineKpis.arOutstanding).toBe(7500);
    expect(r.headlineKpis.apOutstanding).toBe(3000);
    expect(r.headlineKpis.workingCapital).toBe(4500);
    // Los dos agregados piden también lo pagado.
    const pedidos = llamadas.invoiceAggregate.filter((a) => a.where.type && a.where.status?.in);
    expect(pedidos.length).toBeGreaterThanOrEqual(2);
    expect(pedidos.every((a) => a._sum.paidAmount === true)).toBe(true);
  });

  it('el stock bajo sale de las existencias reales de la empresa (consulta acotada por empresa)', async () => {
    const { prisma, llamadas } = prismaFalso({ stock: 6 });
    const r = await new ExecutiveService(prisma).getCLevelDashboard(7);
    expect(r.procurement.lowStockItems).toBe(6);
    expect(r.alerts.some((a: any) => a.title === 'Stock bajo')).toBe(true);
    const [plantilla, ...valores] = llamadas.raw[0];
    expect(String(plantilla.join('?'))).toContain('stock_levels');
    expect(valores).toContain(7);
  });

  it('las actividades abiertas incluyen «Asignada» y su grafía vieja «Asignado»', async () => {
    const { prisma, llamadas } = prismaFalso();
    await new ExecutiveService(prisma).getCLevelDashboard(7);
    const abiertas = llamadas.activityCount.find((a) => a.where?.estatus?.in?.includes('Pendiente'));
    expect(abiertas.where.estatus.in).toEqual(expect.arrayContaining(['Pendiente', 'En Proceso', 'Asignada', 'Asignado']));
  });
});
