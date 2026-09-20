import 'reflect-metadata';
import { AccountingService } from './accounting.service.js';
import { AccountingWorkspaceReportsService } from './workspace-reports.service.js';
import { VendorProjectFinanceService } from './vendor-project-finance.service.js';
import { WorkspaceArApService } from './workspace-ar-ap.service.js';
import {
  compararFilasLibro,
  csvCell,
  type LedgerRow,
} from './workspace-ledger.service.js';
import {
  DEFAULT_MATCH_CONFIG,
  classifyMovement,
  matchBankMovements,
  type BankMovementInput,
  type NexaraCandidateInput,
} from './reconciliation-match.service.js';

/**
 * QA adversarial del escritorio de la contadora.
 *
 * Nadie escribió estas pruebas mientras construía: son las que hacen fallar lo
 * que ya estaba "verde". Cada bloque documenta qué rompía y cómo.
 *
 * Sobre zonas horarias: el servidor de NEXARA corre en America/Mexico_City
 * (UTC−6) y las columnas `@db.Date` (issueDate, dueDate, transactionDate)
 * llegan de Prisma como medianoche **UTC**. Construir el límite del filtro con
 * `new Date("2026-09-01T00:00:00")` da las 06:00 UTC: la factura emitida ese
 * mismo día queda FUERA del rango. Estas pruebas fijan el límite en medianoche
 * UTC exacta, que es lo único que cuadra con la columna.
 */

const TENANT = 7;

// ═══════════════════════════════════════════════════════════════════════════
// (1) Cartera CxC/CxP — el rango de fechas pierde el primer día del mes
// ═══════════════════════════════════════════════════════════════════════════

describe('cartera · el rango de emisión se compara contra una columna @db.Date', () => {
  function construir() {
    const invoice = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    return { service: new WorkspaceArApService({ invoice } as never), invoice };
  }

  it('el límite inferior es medianoche UTC del día pedido, no del huso del servidor', async () => {
    const { service, invoice } = construir();
    await service.listar('cxc', TENANT, { from: '2026-09-01', to: '2026-09-30' });

    const where = invoice.findMany.mock.calls[0][0].where;
    const gte = where.issueDate.gte as Date;

    // Una factura emitida el 1 de septiembre vive en 2026-09-01T00:00:00Z.
    // Con el límite en hora local (06:00Z en UTC−6) quedaba excluida del mes.
    expect(gte.getTime()).toBe(Date.UTC(2026, 8, 1));
  });

  it('el límite superior no se come el primer día del mes siguiente', async () => {
    const { service, invoice } = construir();
    await service.listar('cxp', TENANT, { from: '2026-09-01', to: '2026-09-30' });

    const where = invoice.findMany.mock.calls[0][0].where;
    const lte = where.issueDate.lte as Date;

    // 2026-09-30T23:59:59 local son las 2026-10-01T05:59:59Z: las facturas
    // emitidas el 1 de octubre (00:00Z) se colaban en el mes de septiembre.
    expect(lte.getTime()).toBeLessThan(Date.UTC(2026, 9, 1));
    expect(lte.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 8, 30));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) Panel de la contadora — antigüedad corrida un día y mes incompleto
// ═══════════════════════════════════════════════════════════════════════════

describe('panel de la contadora · antigüedad y rango del periodo', () => {
  /** Día calendario como `@db.Date`: medianoche UTC. */
  const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  function construir(hoy: Date, cxc: Array<Record<string, unknown>>) {
    const prisma = {
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(async (args: { where: { type: string } }) =>
          args.where.type === 'ACCOUNTS_RECEIVABLE' ? cxc : [],
        ),
      },
      employeePayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      bankReconciliation: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AccountingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    (service as unknown as Record<string, unknown>).getFinancialDashboard = jest
      .fn()
      .mockResolvedValue({
        cash: { totalBalance: 0 },
        accountsReceivable: { pending: 0 },
        accountsPayable: { pending: 0 },
        profitAndLoss: { month: { revenue: 0, expenses: 0 } },
      });
    jest.useFakeTimers().setSystemTime(hoy);
    return { service, prisma };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('una factura que vence HOY no es cartera vencida', async () => {
    // 20-sep-2026 a las 20:00 hora de la Ciudad de México = 21-sep 02:00 UTC.
    const { service } = construir(new Date('2026-09-21T02:00:00.000Z'), [
      { totalAmount: 1000, paidAmount: 0, dueDate: dia(2026, 9, 20) },
    ]);

    const panel = await service.getWorkspaceDashboard(TENANT);

    expect(panel.agingReceivable.overdue).toBe(0);
    expect(panel.agingReceivable.dueToday).toBe(1000);
  });

  it('«vence hoy» no puede ser siempre cero', async () => {
    // Mediodía local, sin ambigüedad de huso.
    const { service } = construir(new Date('2026-09-20T18:00:00.000Z'), [
      { totalAmount: 500, paidAmount: 100, dueDate: dia(2026, 9, 20) },
      { totalAmount: 300, paidAmount: 0, dueDate: dia(2026, 9, 19) },
    ]);

    const panel = await service.getWorkspaceDashboard(TENANT);

    expect(panel.agingReceivable.dueToday).toBe(400);
    expect(panel.agingReceivable.overdue).toBe(300);
  });

  it('el conteo de facturas del mes incluye el día 1', async () => {
    const { service, prisma } = construir(new Date('2026-09-20T18:00:00.000Z'), []);

    await service.getWorkspaceDashboard(TENANT, '2026-09-01', '2026-09-30');

    const where = prisma.invoice.count.mock.calls[0][0].where;
    expect((where.issueDate.gte as Date).getTime()).toBe(Date.UTC(2026, 8, 1));
    expect((where.issueDate.lte as Date).getTime()).toBeLessThan(Date.UTC(2026, 9, 1));
  });

  it('el periodo que reporta no salta al día siguiente por la tarde', async () => {
    // 20-sep 20:00 en la Ciudad de México: `now.toISOString()` ya dice 21-sep.
    const { service } = construir(new Date('2026-09-21T02:00:00.000Z'), []);

    const panel = await service.getWorkspaceDashboard(TENANT);

    expect(panel.period.to).toBe('2026-09-20');
    expect(panel.period.from).toBe('2026-09-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) Libro de movimientos — la paginación duplicaba y perdía filas
// ═══════════════════════════════════════════════════════════════════════════

describe('libro de movimientos · orden estable de la mezcla', () => {
  const fila = (tabla: LedgerRow['origen']['tabla'], id: number, fecha: string): LedgerRow =>
    ({
      id: `${tabla}:${id}`,
      fecha,
      origen: { tabla, id, href: null },
    }) as LedgerRow;

  it('empata por id descendente, igual que el orden con el que se traen', () => {
    // Cada fuente pide a Prisma `orderBy: [fecha desc, id desc]` y se queda con
    // su top-K. Si la mezcla desempata al revés, el recorte de cada fuente deja
    // de coincidir con el orden global: la página 1 y la 2 salen idénticas y las
    // filas de en medio no aparecen nunca.
    const filas = [
      fila('invoices', 9, '2026-09-15'),
      fila('invoices', 100, '2026-09-15'),
      fila('invoices', 10, '2026-09-15'),
    ];
    const ordenadas = [...filas].sort(compararFilasLibro).map((f) => f.origen.id);
    expect(ordenadas).toEqual([100, 10, 9]);
  });

  it('la fecha manda sobre el id', () => {
    const filas = [
      fila('payments', 1, '2026-09-10'),
      fila('invoices', 999, '2026-09-01'),
      fila('expenses', 5, '2026-09-20'),
    ];
    expect([...filas].sort(compararFilasLibro).map((f) => f.fecha)).toEqual([
      '2026-09-20',
      '2026-09-10',
      '2026-09-01',
    ]);
  });

  it('dos fuentes distintas con el mismo id y la misma fecha no se pisan', () => {
    const a = fila('payments', 4, '2026-09-10');
    const b = fila('invoices', 4, '2026-09-10');
    expect(compararFilasLibro(a, b)).not.toBe(0);
    expect(compararFilasLibro(a, b)).toBe(-compararFilasLibro(b, a));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) Exportación CSV — fórmulas de Excel embebidas en el concepto
// ═══════════════════════════════════════════════════════════════════════════

describe('exportación CSV · no ejecuta fórmulas al abrirse en Excel', () => {
  it('neutraliza una celda que empieza por = + - @ o tabulador', () => {
    // La contadora abre el CSV en Excel. Si el concepto de un gasto que
    // cualquier usuario escribió empieza por `=`, Excel lo evalúa.
    for (const veneno of [
      '=1+1',
      '+1234',
      '-2+3',
      '@SUM(A1)',
      '=HYPERLINK("http://x","clic")',
    ]) {
      const celda = csvCell(veneno);
      expect(celda.replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('un texto normal no se toca', () => {
    expect(csvCell('Pago de factura F-182')).toBe('Pago de factura F-182');
    expect(csvCell('Compra, urgente')).toBe('"Compra, urgente"');
    expect(csvCell(1250.5)).toBe('1250.5');
    expect(csvCell(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Conciliación — un cargo no puede "pagar" una cuenta por cobrar
// ═══════════════════════════════════════════════════════════════════════════

describe('conciliación · el sentido del dinero', () => {
  const movimiento: BankMovementInput = {
    id: 1,
    date: '2026-09-15',
    amount: 11600,
    isDebit: true, // salió dinero de la cuenta
    description: 'SPEI ENVIADO ACME',
    speiTrackingKey: 'ABC123456789',
    reference: 'REF-9001',
  };

  /** Factura por COBRAR: el dinero debería ENTRAR, no salir. */
  const cobroAlReves: NexaraCandidateInput = {
    id: 55,
    kind: 'INVOICE',
    folio: 'F-182',
    date: '2026-09-15',
    amount: 11600,
    direction: 'IN',
    speiTrackingKey: 'ABC123456789',
    reference: 'REF-9001',
  };

  it('nunca lo marca como sugerencia de alta confianza', () => {
    const [match] = matchBankMovements([movimiento], [cobroAlReves]);

    // Monto exacto (55) + mismo día (25) + SPEI (25) + referencia (12) − 18
    // pasaba de 80 y salía en verde para que la contadora le diera un clic.
    expect(match.candidates[0].score).toBeGreaterThan(0);
    expect(match.state).not.toBe('SUGERENCIA_ALTA');
  });

  it('el mismo candidato en el sentido correcto sí es alta confianza', () => {
    const cobro = { ...movimiento, isDebit: false };
    const [match] = matchBankMovements([cobro], [cobroAlReves]);
    expect(match.state).toBe('SUGERENCIA_ALTA');
  });

  it('classifyMovement degrada el sentido invertido aunque el score sea perfecto', () => {
    const state = classifyMovement(
      movimiento,
      [
        {
          candidate: cobroAlReves,
          score: 100,
          reasons: [],
          amountDelta: 0,
          dayDelta: 0,
          exactAmount: true,
        },
      ],
      DEFAULT_MATCH_CONFIG,
    );
    expect(state).not.toBe('SUGERENCIA_ALTA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (6) Proveedores — la antigüedad saltaba un día a las 6 de la tarde
// ═══════════════════════════════════════════════════════════════════════════

describe('proveedores · «hoy» es el día del servidor, no el día UTC', () => {
  const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  function construir(facturas: Array<Record<string, unknown>>) {
    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 3, name: 'ACME', companyId: TENANT }),
        findMany: jest.fn().mockResolvedValue([{ id: 3, name: 'ACME' }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue(facturas),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      purchaseOrder: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      supplierEvaluation: { findMany: jest.fn().mockResolvedValue([]) },
      supplierProduct: { count: jest.fn().mockResolvedValue(0) },
    };
    return { service: new VendorProjectFinanceService(prisma as never), prisma };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a las 8 de la noche del 20-sep, una factura que vence el 20-sep no está vencida', async () => {
    // 2026-09-21T02:00Z = 20-sep 20:00 en la Ciudad de México. Tomando el día
    // UTC, «hoy» ya era 21 y la factura salía con 1 día de retraso: la misma
    // factura decía «al corriente» en CxP y «vencida» aquí.
    const { service } = construir([
      {
        id: 1,
        invoiceNumber: 'F-1',
        type: 'ACCOUNTS_PAYABLE',
        status: 'SENT',
        issueDate: dia(2026, 9, 1),
        dueDate: dia(2026, 9, 20),
        totalAmount: 1000,
        paidAmount: 0,
        isCancelled: false,
      },
    ]);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T02:00:00.000Z'));

    const detalle = await service.getVendorDetail(TENANT, 3);

    expect(detalle.cuentasPorPagar.facturas[0].diasVencido).toBe(0);
    expect(detalle.resumen.vencido).toBe(0);
    expect(detalle.resumen.porVencer).toBe(1000);
  });

  it('el corte de «vencidas» del listado también usa el día del servidor', async () => {
    const { service, prisma } = construir([]);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T02:00:00.000Z'));

    await service.listVendors(TENANT, {});

    const vencidas = prisma.invoice.groupBy.mock.calls
      .map((c) => c[0].where)
      .find((w: Record<string, any>) => w.dueDate?.lt);
    expect((vencidas.dueDate.lt as Date).getTime()).toBe(Date.UTC(2026, 8, 20));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (7) Presupuestos — «0 %» donde no hay porcentaje que dar
// ═══════════════════════════════════════════════════════════════════════════

describe('presupuestos · un presupuesto en cero no da 0 % de variación', () => {
  function construir(filas: Array<Record<string, unknown>>) {
    const prisma = {
      budget: { findMany: jest.fn().mockResolvedValue([{ costCenterId: 4, year: 2026 }]) },
      costCenter: {
        findMany: jest.fn().mockResolvedValue([{ id: 4, code: 'CC-01', name: 'Instalaciones' }]),
        findFirst: jest.fn(),
      },
    };
    const accounting = { getBudgetVsActual: jest.fn().mockResolvedValue(filas) };
    return new AccountingWorkspaceReportsService(prisma as never, accounting as never);
  }

  it('gastar 50 000 contra un presupuesto de 0 no es «0 % de variación»', async () => {
    // `computeMargin` ya hace lo correcto en proyectos: sin base, null. Aquí
    // salía 0, que en la tabla se lee como «clavado al presupuesto» justo
    // cuando el gasto no tiene presupuesto que lo respalde.
    const service = construir([
      {
        id: 51,
        name: 'Sin presupuesto',
        costCenterId: 4,
        year: 2026,
        month: 9,
        plannedAmount: 0,
        actualAmount: 50000,
        variance: -50000,
        variancePercent: 0,
      },
    ]);

    const res = await service.comparativoPresupuestos({ from: '2026-09-01', to: '2026-09-30' }, TENANT);

    expect(res.lineas[0].variacion).toBe(-50000);
    expect(res.lineas[0].variacionPct).toBeNull();
    expect(res.porCentro[0].variacionPct).toBeNull();
    expect(res.totales.variacionPct).toBeNull();
  });

  it('con presupuesto real el porcentaje sigue saliendo', async () => {
    const service = construir([
      {
        id: 52,
        name: 'Operación',
        costCenterId: 4,
        year: 2026,
        month: 9,
        plannedAmount: 10000,
        actualAmount: 13500,
        variance: -3500,
        variancePercent: -35,
      },
    ]);

    const res = await service.comparativoPresupuestos({ from: '2026-09-01', to: '2026-09-30' }, TENANT);

    expect(res.lineas[0].variacionPct).toBe(-35);
    expect(res.totales.variacionPct).toBe(-35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (8) Reportes — el mismo desfase de un día en flujo, auxiliar y antigüedad
// ═══════════════════════════════════════════════════════════════════════════

describe('reportes · los límites contra columnas @db.Date van en UTC', () => {
  function construir(over: Record<string, any> = {}) {
    const wheres: any[] = [];
    const captura = (valor: any) =>
      jest.fn((args: any = {}) => {
        wheres.push(args?.where ?? {});
        return Promise.resolve(valor);
      });
    const prisma: any = {
      payment: { findMany: captura([]) },
      expense: { findMany: captura([]), groupBy: captura([]) },
      employeePayment: { findMany: captura([]) },
      invoice: { findMany: captura([]) },
      account: { findFirst: captura({ id: 5, code: '401.01', name: 'Ventas' }) },
      journalEntryLine: { findMany: captura([]) },
      fiscalPeriod: { findMany: captura([]) },
      operationalProject: { findMany: captura([]) },
      budget: { findMany: captura([]) },
      costCenter: { findMany: captura([]), findFirst: captura(null) },
      __wheres: wheres,
    };
    const accounting = {
      getIncomeStatement: jest.fn().mockResolvedValue({
        revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0,
      }),
      getTrialBalance: jest.fn().mockResolvedValue([]),
      getBalanceSheet: jest.fn().mockResolvedValue({
        assets: [], liabilities: [], equity: [],
        totalAssets: 0, totalLiabilities: 0, totalEquity: 0, balanceCheck: true,
      }),
      getBudgetVsActual: jest.fn().mockResolvedValue([]),
    };
    return {
      service: new AccountingWorkspaceReportsService(prisma, accounting as never),
      prisma,
      ...over,
    };
  }

  it('el flujo de efectivo no pierde los cobros del día 1 (paymentDate es @db.Date)', async () => {
    const { service, prisma } = construir();
    await service.ejecutar('flujo-efectivo', { from: '2026-09-01', to: '2026-09-30' }, TENANT);

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect((where.paymentDate.gte as Date).getTime()).toBe(Date.UTC(2026, 8, 1));
    expect((where.paymentDate.lte as Date).getTime()).toBeLessThan(Date.UTC(2026, 9, 1));
  });

  it('el auxiliar de una cuenta no arrastra pólizas del mes siguiente (date es @db.Date)', async () => {
    const { service, prisma } = construir();
    await service.detalle(
      'estado-resultados',
      'cuenta:401.01',
      { from: '2026-09-01', to: '2026-09-30' },
      TENANT,
    );

    const where = prisma.journalEntryLine.findMany.mock.calls[0][0].where;
    const rango = where.journalEntry.date;
    expect((rango.gte as Date).getTime()).toBe(Date.UTC(2026, 8, 1));
    expect((rango.lte as Date).getTime()).toBeLessThan(Date.UTC(2026, 9, 1));
  });

  it('una factura que vence el día del corte tiene 0 días de atraso', async () => {
    const vence = new Date(Date.UTC(2026, 8, 20));
    const { service } = construir();
    const prisma = (service as unknown as { prisma: any }).prisma;
    prisma.invoice.findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        invoiceNumber: 'F-1',
        totalAmount: 1000,
        paidAmount: 0,
        dueDate: vence,
        issueDate: vence,
        clientId: 3,
        client: { name: 'ACME' },
        supplierId: null,
        supplier: null,
      },
    ]);

    const res = await service.ejecutar(
      'aging-cxc',
      { from: '2026-09-01', to: '2026-09-30', asOf: '2026-09-20' },
      TENANT,
    );

    // El corte en hora local (2026-09-21T05:59:59Z) daba 1 día de atraso a una
    // factura que vence justo el día del corte: pasaba del tramo «por vencer»
    // al de «1 a 30 días» sin que hubiera vencido nada.
    const fila = res.filas[0] as Record<string, number>;
    expect(fila.porVencer).toBe(1000);
    expect(fila.d30).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (9) Cierre de periodo — cerrar dos veces a la vez
// ═══════════════════════════════════════════════════════════════════════════

describe('cierre de periodo · no se puede cerrar dos veces', () => {
  function construir(yaCerrado: boolean) {
    const periodo = {
      id: 3,
      name: 'Septiembre 2026',
      companyId: TENANT,
      isClosed: yaCerrado,
      closedAt: yaCerrado ? new Date('2026-09-30T12:00:00.000Z') : null,
      closedById: yaCerrado ? 11 : null,
    };
    const fiscalPeriod = {
      findFirst: jest.fn().mockResolvedValue(periodo),
      findFirstOrThrow: jest.fn().mockResolvedValue({ ...periodo, isClosed: true }),
      // `updateMany` con la condición dentro del `where` es el compare-and-swap:
      // si otro ya lo cerró, no toca ninguna fila.
      updateMany: jest.fn().mockResolvedValue({ count: yaCerrado ? 0 : 1 }),
      update: jest.fn().mockResolvedValue({ ...periodo, isClosed: true }),
    };
    const service = new AccountingService(
      { fiscalPeriod } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, fiscalPeriod };
  }

  it('el candado va en el WHERE, no en un if leído antes', async () => {
    const { service, fiscalPeriod } = construir(false);
    await service.closeFiscalPeriod(3, 42, TENANT);

    expect(fiscalPeriod.updateMany).toHaveBeenCalledTimes(1);
    const where = fiscalPeriod.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 3, isClosed: false, companyId: TENANT });
  });

  it('si otra petición ganó la carrera, la segunda falla en vez de pisar el cierre', async () => {
    // Antes: las dos leían `isClosed: false` y las dos escribían. La segunda
    // machacaba `closedAt`/`closedById` y dejaba dos cierres en la bitácora.
    const { service } = construir(true);
    await expect(service.closeFiscalPeriod(3, 42, TENANT)).rejects.toThrow(/ya está cerrado/i);
  });
});
