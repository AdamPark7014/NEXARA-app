import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { AccountingWorkspaceReportsService } from './workspace-reports.service.js';
import { AccountingWorkspaceReportsController } from './workspace-reports.controller.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Reportes de contabilidad y comparativo de presupuestos.
 *
 * Lo que se vigila aquí:
 *  a) el catálogo solo publica reportes que de verdad se pueden ejecutar;
 *  b) los totales de un reporte salen de los datos, no de la maqueta;
 *  c) la variación de presupuesto también es correcta cuando el real se pasa;
 *  d) toda consulta va acotada a la empresa activa (hubo cruce de datos);
 *  e) el contrato de autorización no se relaja sin que alguien lo note.
 */

const EMPRESA = 7;
const OTRA_EMPRESA = 9;

/** Prisma de mentira: registra cada `where` para poder auditar el aislamiento. */
function prismaFalso(over: Record<string, any> = {}) {
  const wheres: any[] = [];
  const captura = (valor: any) =>
    jest.fn((args: any = {}) => {
      wheres.push(args?.where ?? {});
      return Promise.resolve(typeof valor === 'function' ? valor(args) : valor);
    });

  const prisma: any = {
    __wheres: wheres,
    fiscalPeriod: { findMany: captura([{ id: 1, name: 'Ejercicio 2026' }]) },
    expense: {
      findMany: captura([]),
      groupBy: captura([]),
    },
    operationalProject: { findMany: captura([{ id: 3, title: 'Torre Norte' }]) },
    payment: { findMany: captura([]) },
    employeePayment: { findMany: captura([]) },
    invoice: { findMany: captura([]) },
    budget: { findMany: captura([]) },
    costCenter: { findMany: captura([]), findFirst: captura(null) },
    account: { findFirst: captura(null) },
    journalEntryLine: { findMany: captura([]) },
    ...over,
  };
  return prisma;
}

/** Motores contables reales sustituidos por valores conocidos. */
function accountingFalso(over: Record<string, any> = {}) {
  return {
    getIncomeStatement: jest.fn().mockResolvedValue({
      revenue: [],
      expenses: [],
      totalRevenue: 0,
      totalExpenses: 0,
      netIncome: 0,
    }),
    getTrialBalance: jest.fn().mockResolvedValue([]),
    getBalanceSheet: jest.fn().mockResolvedValue({
      assets: [],
      liabilities: [],
      equity: [],
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      balanceCheck: true,
    }),
    getBudgetVsActual: jest.fn().mockResolvedValue([]),
    ...over,
  } as any;
}

const build = (prismaOver: Record<string, any> = {}, accountingOver: Record<string, any> = {}) => {
  const prisma = prismaFalso(prismaOver);
  const accounting = accountingFalso(accountingOver);
  return {
    prisma,
    accounting,
    service: new AccountingWorkspaceReportsService(prisma, accounting),
  };
};

const PERIODO = { from: '2026-09-01', to: '2026-09-30' };

// ─────────────────────────────────────────────────────────────────────
// (a) El catálogo solo publica reportes ejecutables
// ─────────────────────────────────────────────────────────────────────
describe('catálogo de reportes', () => {
  it('cada reporte publicado tiene ejecutor: ninguno responde «no tiene ejecutor»', async () => {
    const { service } = build();
    const { reportes } = await service.getCatalogo(EMPRESA);
    expect(reportes.length).toBeGreaterThan(0);

    for (const reporte of reportes) {
      const resultado = await service.ejecutar(reporte.id, PERIODO, EMPRESA);
      expect(resultado.id).toBe(reporte.id);
      expect(Array.isArray(resultado.columnas)).toBe(true);
      expect(resultado.columnas.length).toBeGreaterThan(0);
      expect(Array.isArray(resultado.filas)).toBe(true);
    }
  });

  it('no publica los reportes cuyo dato no existe en la base', async () => {
    const { service } = build();
    const { reportes } = await service.getCatalogo(EMPRESA);
    const ids = reportes.map((r) => r.id);

    // Flujo proyectado: no hay compromisos de pago con fecha programada.
    expect(ids).not.toContain('flujo-efectivo-proyectado');
    // Presupuesto por proyecto: Budget solo se liga a centro de costo.
    expect(ids).not.toContain('presupuesto-por-proyecto');

    // Y siguen registrados con su motivo, no borrados en silencio.
    expect(AccountingWorkspaceReportsService.definicion('presupuesto-por-proyecto')?.motivoNoDisponible)
      .toMatch(/centro de costo/i);
  });

  it('un reporte no publicado no se puede ejecutar por la puerta de atrás', async () => {
    const { service } = build();
    await expect(service.ejecutar('flujo-efectivo-proyectado', PERIODO, EMPRESA)).rejects.toThrow(
      /no existe o no está disponible/,
    );
  });

  it('el que se anuncia comparable compara sobre una columna que existe', async () => {
    const { service } = build();
    const { reportes } = await service.getCatalogo(EMPRESA);

    for (const reporte of reportes) {
      const def = AccountingWorkspaceReportsService.definicion(reporte.id)!;
      const r = await service.ejecutar(reporte.id, { ...PERIODO, comparar: true }, EMPRESA);
      if (!reporte.comparable) {
        // Pedir comparación a quien no la soporta no debe inventar columnas.
        expect(r.comparativo).toBeNull();
        expect(r.columnas.map((c) => c.clave)).not.toContain('_variacion');
        continue;
      }
      expect(def.columnaComparable).toBeTruthy();
      expect(r.columnas.map((c) => c.clave)).toContain(def.columnaComparable!);
      expect(r.comparativo?.columnaComparada).toBe(def.columnaComparable);
    }
  });

  it('los filtros de selección llegan con opciones reales, no vacías a mano', async () => {
    const { service } = build();
    const { reportes } = await service.getCatalogo(EMPRESA);
    const gastosProyecto = reportes.find((r) => r.id === 'gastos-proyecto')!;
    const filtroProyecto = gastosProyecto.filtros.find((f) => f.clave === 'projectId')!;
    expect(filtroProyecto.tipo).toBe('seleccion');
    expect(filtroProyecto.opciones).toEqual([{ valor: '3', etiqueta: 'Torre Norte' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// (b) Totales correctos con datos de prueba
// ─────────────────────────────────────────────────────────────────────
describe('totales de los reportes', () => {
  it('estado de resultados: gastos en negativo y el total es la utilidad', async () => {
    const { service, accounting } = build(
      {},
      {
        getIncomeStatement: jest.fn().mockResolvedValue({
          revenue: [{ code: '4000', name: 'Ventas', amount: 150000 }],
          expenses: [
            { code: '5000', name: 'Sueldos', amount: 90000 },
            { code: '5100', name: 'Renta', amount: 20000 },
          ],
          totalRevenue: 150000,
          totalExpenses: 110000,
          netIncome: 40000,
        }),
      },
    );

    const r = await service.ejecutar('estado-resultados', PERIODO, EMPRESA);

    // Reutiliza el motor existente, no recalcula.
    expect(accounting.getIncomeStatement).toHaveBeenCalledWith('2026-09-01', '2026-09-30', EMPRESA);
    expect(r.filas).toHaveLength(3);
    expect(r.filas.find((f) => f.clave === 'cuenta:4000')!.importe).toBe(150000);
    expect(r.filas.find((f) => f.clave === 'cuenta:5000')!.importe).toBe(-90000);
    expect(r.totales).toEqual({ importe: 40000 });
    // La columna suma exactamente el total declarado.
    const suma = r.filas.reduce((s, f) => s + Number(f.importe), 0);
    expect(suma).toBe(r.totales!.importe);
    expect(r.resumen).toEqual([
      { etiqueta: 'Ingresos', valor: 150000, tipo: 'moneda' },
      { etiqueta: 'Gastos', valor: 110000, tipo: 'moneda' },
      { etiqueta: 'Utilidad', valor: 40000, tipo: 'moneda' },
    ]);
  });

  it('gastos por categoría: importes y conteos cuadran con el total', async () => {
    const { service } = build({
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { categoria: 'Renta', _sum: { montoSolicitado: 18000 }, _count: { _all: 2 } },
          { categoria: 'Material', _sum: { montoSolicitado: 4250.55 }, _count: { _all: 5 } },
          { categoria: null, _sum: { montoSolicitado: 300 }, _count: { _all: 1 } },
        ]),
      },
    });

    const r = await service.ejecutar('gastos-categoria', PERIODO, EMPRESA);

    expect(r.filas.map((f) => f.categoria)).toEqual(['Renta', 'Material', 'Sin categoría']);
    expect(r.totales).toEqual({ numero: 8, importe: 22550.55 });
    expect(r.resumen[0]).toEqual({ etiqueta: 'Total gastado', valor: 22550.55, tipo: 'moneda' });
  });

  it('antigüedad CxC: reparte por días de atraso y el saldo total cuadra', async () => {
    const corte = '2026-09-30';
    const { service } = build({
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          // Vence después del corte → por vencer.
          { totalAmount: 1000, paidAmount: 0, dueDate: new Date('2026-10-15T00:00:00'), clientId: 1, supplierId: null, client: { name: 'Acme' }, supplier: null },
          // 20 días de atraso → cubo 1-30.
          { totalAmount: 2000, paidAmount: 500, dueDate: new Date('2026-09-10T00:00:00'), clientId: 1, supplierId: null, client: { name: 'Acme' }, supplier: null },
          // Más de 90 días.
          { totalAmount: 5000, paidAmount: 0, dueDate: new Date('2026-01-01T00:00:00'), clientId: 2, supplierId: null, client: { name: 'Beta' }, supplier: null },
          // Saldada: no debe aparecer.
          { totalAmount: 900, paidAmount: 900, dueDate: new Date('2026-08-01T00:00:00'), clientId: 2, supplierId: null, client: { name: 'Beta' }, supplier: null },
        ]),
      },
    });

    const r = await service.ejecutar('aging-cxc', { asOf: corte }, EMPRESA);

    expect(r.filas).toHaveLength(2);
    const acme = r.filas.find((f) => f.clave === 'contraparte:1')!;
    expect(acme.porVencer).toBe(1000);
    expect(acme.d30).toBe(1500);
    expect(acme.total).toBe(2500);
    const beta = r.filas.find((f) => f.clave === 'contraparte:2')!;
    expect(beta.d90mas).toBe(5000);
    expect(beta.total).toBe(5000);
    expect(r.totales!.total).toBe(7500);
    // Vencido = todo menos lo que aún no vence.
    expect(r.resumen.find((x) => x.etiqueta === 'Vencido')!.valor).toBe(6500);
  });

  it('flujo de efectivo: entradas, salidas y neto por mes', async () => {
    const { service } = build({
      payment: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 12000, paymentDate: new Date(2026, 8, 5), invoice: { type: 'ACCOUNTS_RECEIVABLE' } },
          { amount: 3000, paymentDate: new Date(2026, 8, 20), invoice: { type: 'ACCOUNTS_PAYABLE' } },
        ]),
      },
      expense: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ montoSolicitado: 1500, fechaGasto: new Date(2026, 8, 10), fechaSolicitud: new Date(2026, 8, 10) }]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      employeePayment: {
        findMany: jest.fn().mockResolvedValue([{ amount: 2500, paidAt: new Date(2026, 8, 28) }]),
      },
    });

    const r = await service.ejecutar('flujo-efectivo', PERIODO, EMPRESA);

    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].entradas).toBe(12000);
    expect(r.filas[0].salidas).toBe(7000);
    expect(r.filas[0].neto).toBe(5000);
    expect(r.totales).toEqual({ entradas: 12000, salidas: 7000, neto: 5000 });
  });

  it('comparación con el periodo anterior: toma el rango inmediato del mismo largo', async () => {
    const getIncomeStatement = jest
      .fn()
      .mockResolvedValueOnce({
        revenue: [{ code: '4000', name: 'Ventas', amount: 100 }],
        expenses: [],
        totalRevenue: 100,
        totalExpenses: 0,
        netIncome: 100,
      })
      .mockResolvedValueOnce({
        revenue: [{ code: '4000', name: 'Ventas', amount: 60 }],
        expenses: [],
        totalRevenue: 60,
        totalExpenses: 0,
        netIncome: 60,
      });
    const { service } = build({}, { getIncomeStatement });

    const r = await service.ejecutar(
      'estado-resultados',
      { ...PERIODO, comparar: true },
      EMPRESA,
    );

    expect(r.comparativo).toEqual({
      periodo: { from: '2026-08-02', to: '2026-08-31' },
      columnaComparada: 'importe',
    });
    expect(getIncomeStatement).toHaveBeenNthCalledWith(2, '2026-08-02', '2026-08-31', EMPRESA);
    expect(r.filas[0]._anterior).toBe(60);
    expect(r.filas[0]._variacion).toBe(40);
    expect(r.columnas.map((c) => c.clave)).toContain('_variacion');
  });

  it('CSV: cabecera, filas y renglón de totales', async () => {
    const { service } = build({
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ categoria: 'Renta', _sum: { montoSolicitado: 100 }, _count: { _all: 1 } }]),
      },
    });
    const r = await service.ejecutar('gastos-categoria', PERIODO, EMPRESA);
    const csv = service.aCsv(r);
    const lineas = csv.split('\r\n');
    expect(lineas[0]).toBe('"Categoría","Gastos","Importe"');
    expect(lineas[1]).toBe('"Renta","1","100"');
    expect(lineas[2]).toBe('"TOTAL","1","100"');
  });
});

// ─────────────────────────────────────────────────────────────────────
// (c) Variación de presupuesto
// ─────────────────────────────────────────────────────────────────────
describe('comparativo de presupuestos', () => {
  const centros = [{ id: 4, code: 'CC-01', name: 'Instalaciones' }];

  function conPresupuestos(filas: any[]) {
    return build(
      {
        budget: { findMany: jest.fn().mockResolvedValue([{ costCenterId: 4, year: 2026 }]) },
        costCenter: { findMany: jest.fn().mockResolvedValue(centros), findFirst: jest.fn() },
      },
      { getBudgetVsActual: jest.fn().mockResolvedValue(filas) },
    );
  }

  it('reutiliza getBudgetVsActual y suma planeado, real y variación', async () => {
    const { service, accounting } = conPresupuestos([
      {
        id: 11, name: 'Operación', costCenterId: 4, year: 2026, month: 9,
        plannedAmount: 50000, actualAmount: 42000, variance: 8000, variancePercent: 16,
      },
      {
        id: 12, name: 'Operación', costCenterId: 4, year: 2026, month: 8,
        plannedAmount: 30000, actualAmount: 30000, variance: 0, variancePercent: 0,
      },
    ]);

    const r = await service.comparativoPresupuestos({ from: '2026-08-01', to: '2026-09-30' }, EMPRESA);

    expect(accounting.getBudgetVsActual).toHaveBeenCalledWith(4, 2026, EMPRESA);
    expect(r.lineas).toHaveLength(2);
    expect(r.totales).toEqual({ planeado: 80000, real: 72000, variacion: 8000, variacionPct: 10 });
    expect(r.porCentro[0]).toMatchObject({ centro: 'CC-01 · Instalaciones', planeado: 80000, real: 72000, variacion: 8000 });
  });

  it('real por encima del presupuesto: variación negativa, no un cero maquillado', async () => {
    const { service } = conPresupuestos([
      {
        id: 21, name: 'Material', costCenterId: 4, year: 2026, month: 9,
        plannedAmount: 10000, actualAmount: 13500, variance: -3500, variancePercent: -35,
      },
    ]);

    const r = await service.comparativoPresupuestos({ from: '2026-09-01', to: '2026-09-30' }, EMPRESA);

    expect(r.lineas[0].variacion).toBe(-3500);
    expect(r.lineas[0].variacionPct).toBe(-35);
    expect(r.totales.variacion).toBe(-3500);
    expect(r.totales.variacionPct).toBe(-35);
    expect(r.porCentro[0].variacion).toBe(-3500);
  });

  it('deja fuera las líneas de meses ajenos al periodo y conserva el presupuesto anual', async () => {
    const { service } = conPresupuestos([
      { id: 31, name: 'Anual', costCenterId: 4, year: 2026, month: null, plannedAmount: 1000, actualAmount: 400, variance: 600, variancePercent: 60 },
      { id: 32, name: 'Marzo', costCenterId: 4, year: 2026, month: 3, plannedAmount: 500, actualAmount: 100, variance: 400, variancePercent: 80 },
      { id: 33, name: 'Septiembre', costCenterId: 4, year: 2026, month: 9, plannedAmount: 700, actualAmount: 200, variance: 500, variancePercent: 71.43 },
    ]);

    const r = await service.comparativoPresupuestos({ from: '2026-09-01', to: '2026-09-30' }, EMPRESA);

    expect(r.lineas.map((l) => l.clave).sort()).toEqual(['presupuesto:31', 'presupuesto:33']);
    expect(r.lineas.find((l) => l.clave === 'presupuesto:31')!.periodo).toBe('Anual 2026');
    expect(r.lineas.find((l) => l.clave === 'presupuesto:33')!.periodo).toBe('septiembre 2026');
  });

  it('CSV del comparativo lleva el renglón de totales', async () => {
    const { service } = conPresupuestos([
      { id: 41, name: 'Operación', costCenterId: 4, year: 2026, month: 9, plannedAmount: 100, actualAmount: 140, variance: -40, variancePercent: -40 },
    ]);
    const data = await service.comparativoPresupuestos({ from: '2026-09-01', to: '2026-09-30' }, EMPRESA);
    const csv = service.csvComparativoPresupuestos(data);
    expect(csv.split('\r\n').pop()).toBe('"TOTAL","","","100","140","-40","-40"');
  });
});

// ─────────────────────────────────────────────────────────────────────
// (d) Aislamiento por empresa
// ─────────────────────────────────────────────────────────────────────
describe('aislamiento por empresa', () => {
  it('sin empresa activa no se consulta nada: 403 antes de tocar Prisma', async () => {
    const { service, prisma } = build();

    await expect(service.getCatalogo(null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.ejecutar('estado-resultados', PERIODO, null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.comparativoPresupuestos({}, null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.detalle('gastos-categoria', 'categoria:Renta', {}, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.detallePresupuesto({ costCenterId: 4, year: 2026 }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.__wheres).toHaveLength(0);
  });

  it('todo where enviado a Prisma lleva la empresa activa', async () => {
    const { service, prisma } = build({
      expense: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    });

    await service.getCatalogo(EMPRESA);
    for (const id of AccountingWorkspaceReportsService.idsPublicados()) {
      await service.ejecutar(id, PERIODO, EMPRESA);
    }
    await service.comparativoPresupuestos(PERIODO, EMPRESA);

    expect(prisma.__wheres.length).toBeGreaterThan(0);
    for (const where of prisma.__wheres) {
      const propio = where?.companyId === EMPRESA;
      // Consultas sobre tablas hijas: la empresa va en la relación padre.
      const heredado = where?.journalEntry?.companyId === EMPRESA;
      expect(propio || heredado).toBe(true);
      expect(JSON.stringify(where)).not.toContain(`"companyId":${OTRA_EMPRESA}`);
    }
  });

  it('los motores contables se llaman siempre con la empresa activa', async () => {
    const { service, accounting } = build();
    await service.ejecutar('estado-resultados', PERIODO, EMPRESA);
    await service.ejecutar('balanza-comprobacion', {}, EMPRESA);
    await service.ejecutar('balance-general', { asOf: '2026-09-30' }, EMPRESA);

    expect(accounting.getIncomeStatement).toHaveBeenCalledWith(expect.any(String), expect.any(String), EMPRESA);
    expect(accounting.getTrialBalance).toHaveBeenCalledWith(undefined, EMPRESA);
    expect(accounting.getBalanceSheet).toHaveBeenCalledWith('2026-09-30', EMPRESA);
  });

  it('la balanza muestra naturaleza en español, no el enum ASSET/LIABILITY', async () => {
    const { service } = build(
      {},
      {
        getTrialBalance: jest.fn().mockResolvedValue([
          { code: '102.01', name: 'Bancos', type: 'ASSET', debit: 1000, credit: 0 },
          { code: '201.01', name: 'Proveedores', type: 'LIABILITY', debit: 0, credit: 400 },
          { code: '401.01', name: 'Ingresos', type: 'REVENUE', debit: 0, credit: 600 },
        ]),
      },
    );

    const r = await service.ejecutar('balanza-comprobacion', {}, EMPRESA);
    expect(r.filas.map((f) => f.tipo)).toEqual(['Activo', 'Pasivo', 'Ingreso']);
  });

  it('el detalle de «Sin categoría» filtra por NULL, no devuelve todos los gastos', async () => {
    const { service, prisma } = build({
      expense: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    });

    await service.detalle('gastos-categoria', 'categoria:', PERIODO, EMPRESA);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.categoria).toBeNull();
    expect(where.companyId).toBe(EMPRESA);
  });

  it('el detalle de una cuenta de otra empresa responde «no encontrada», no sus movimientos', async () => {
    const { service, prisma } = build({
      account: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.detalle('estado-resultados', 'cuenta:4000', PERIODO, EMPRESA),
    ).rejects.toThrow(/Cuenta no encontrada/);
    expect(prisma.journalEntryLine.findMany).not.toHaveBeenCalled();
  });

  it('el detalle de un centro de costo ajeno no filtra pólizas', async () => {
    const { service, prisma } = build({
      costCenter: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.detallePresupuesto({ costCenterId: 99, year: 2026, month: 9 }, EMPRESA),
    ).rejects.toThrow(/Centro de costo no encontrado/);
    expect(prisma.journalEntryLine.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// (e) Contrato de autorización
// ─────────────────────────────────────────────────────────────────────
describe('contrato de autorización', () => {
  const RUTAS: Array<keyof AccountingWorkspaceReportsController> = [
    'catalogo',
    'ejecutar',
    'detalle',
    'exportReporte',
    'comparativoPresupuestos',
    'detallePresupuesto',
    'exportComparativo',
  ];

  const permisosDe = (metodo: string): string[] => {
    const handler = (AccountingWorkspaceReportsController.prototype as any)[metodo];
    const rbac = Reflect.getMetadata('rbac', handler) as { anyPermissions?: string[] } | undefined;
    return rbac?.anyPermissions ?? [];
  };

  it('toda ruta exige permiso de lectura de contabilidad', () => {
    for (const ruta of RUTAS) {
      expect(permisosDe(ruta as string)).toEqual([
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.ACCOUNTING_VIEW,
        PERMISSIONS.CONSOLE_ADMIN,
      ]);
    }
  });

  it('un rol de campo sin permisos de finanzas queda fuera', () => {
    const permitidos = new Set(permisosDe('catalogo'));
    const puede = (perms: string[]) => perms.some((p) => permitidos.has(p));

    expect(puede([PERMISSIONS.CONTABILIDAD_VIEW])).toBe(true);
    expect(puede([PERMISSIONS.ACCOUNTING_VIEW])).toBe(true);
    expect(puede([PERMISSIONS.CONSOLE_ADMIN])).toBe(true);
    expect(puede(['ops.view', 'activities.view'])).toBe(false);
    expect(puede([])).toBe(false);
  });

  it('ninguna ruta del módulo escribe: todas son GET', () => {
    for (const ruta of RUTAS) {
      const handler = (AccountingWorkspaceReportsController.prototype as any)[ruta];
      expect(Reflect.getMetadata('method', handler)).toBe(0); // RequestMethod.GET
    }
  });
});
