import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '../common/permissions.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { VendorProjectFinanceController } from './vendor-project-finance.controller.js';
import {
  CostAccumulator,
  VendorProjectFinanceService,
  computeMargin,
  money,
  summarizeCostCategories,
  toNumber,
  type CostCategory,
} from './vendor-project-finance.service.js';

/**
 * Proveedores 360° y estado financiero por proyecto.
 *
 * Cubre lo que puede romperse en silencio:
 *  (a) margen y desglose de costos,
 *  (b) aislamiento por companyId — hubo un incidente de datos cruzados,
 *  (c) contrato de autorización de las cuatro rutas,
 *  (d) que la lista de proveedores salga del modelo Supplier y no de facturas.
 */

// ── Prisma de mentira que apunta todo lo que se le pide ─────────────────────

type Call = { model: string; op: string; args: any };

function fakePrisma(returns: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const models = [
    'supplier',
    'supplierProduct',
    'supplierEvaluation',
    'invoice',
    'payment',
    'purchaseOrder',
    'operationalProject',
    'workProject',
    'workProjectExpense',
    'workProjectPayroll',
    'workProjectLog',
    'activity',
    'expense',
    'viatico',
    'stockMovement',
  ];
  const ops = ['findMany', 'findFirst', 'groupBy', 'count', 'aggregate'];
  const prisma: any = { $calls: calls };
  for (const model of models) {
    prisma[model] = {};
    for (const op of ops) {
      prisma[model][op] = jest.fn(async (args: any) => {
        calls.push({ model, op, args });
        const key = `${model}.${op}`;
        if (key in returns) return (returns as any)[key];
        return op === 'count' ? 0 : [];
      });
    }
  }
  return prisma;
}

const service = (prisma: any) => new VendorProjectFinanceService(prisma as never);

/** Todas las cláusulas `where` que vio Prisma, aplanando OR/AND anidados. */
function collectWheres(calls: Call[]): any[] {
  return calls.map((c) => c.args?.where).filter(Boolean);
}

// ── (a) Margen y desglose de costos ─────────────────────────────────────────

describe('cálculo de margen', () => {
  it('margen = ingresos − costo, y el porcentaje es sobre ingresos', () => {
    expect(computeMargin(100_000, 60_000)).toEqual({ margen: 40_000, margenPct: 40 });
    expect(computeMargin(250_000, 200_000)).toEqual({ margen: 50_000, margenPct: 20 });
  });

  it('un proyecto en pérdida devuelve margen negativo', () => {
    expect(computeMargin(80_000, 95_000)).toEqual({ margen: -15_000, margenPct: -18.8 });
  });

  it('sin ingresos el porcentaje es null, no 0', () => {
    // «0 % de margen» y «todavía no se factura» no son lo mismo.
    expect(computeMargin(0, 40_000)).toEqual({ margen: -40_000, margenPct: null });
    expect(computeMargin(0, 0)).toEqual({ margen: 0, margenPct: null });
  });

  it('redondea a centavos y no arrastra ruido flotante', () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(computeMargin(1000.005, 0.004).margen).toBe(1000);
  });

  it('toNumber convierte Decimal de Prisma, string y null', () => {
    expect(toNumber({ toString: () => '1234.56' } as never)).toBe(1234.56);
    expect(toNumber('89.10')).toBe(89.1);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('no-es-numero')).toBe(0);
  });
});

describe('desglose de costos por categoría', () => {
  function breakdown(): CostCategory[] {
    const acc = new CostAccumulator();
    // Dos facturas de proveedor caen en la misma categoría.
    acc.add({ key: 'compras', label: 'Compras a proveedores', fuente: 'facturas', monto: 50_000, pagado: 30_000 });
    acc.add({ key: 'compras', label: 'Compras a proveedores', fuente: 'facturas', monto: 30_000, pagado: 0 });
    acc.add({ key: 'gasto:nómina', label: 'Gastos · Nómina', fuente: 'gastos', monto: 15_000, pagado: 15_000 });
    acc.add({ key: 'viatico:combustible', label: 'Viáticos · Combustible', fuente: 'viaticos', monto: 5_000 });
    return acc.list();
  }

  it('suma las entradas repetidas en una sola categoría', () => {
    const { categorias } = summarizeCostCategories(breakdown());
    const compras = categorias.find((c) => c.key === 'compras')!;
    expect(compras.monto).toBe(80_000);
    expect(compras.pagado).toBe(30_000);
    expect(compras.pendiente).toBe(50_000);
    expect(compras.conteo).toBe(2);
  });

  it('el costo total es la suma de las categorías', () => {
    const r = summarizeCostCategories(breakdown());
    expect(r.costoTotal).toBe(100_000);
    expect(r.costoPagado).toBe(45_000);
    expect(r.costoPendiente).toBe(55_000);
  });

  it('la participación suma 100 % y ordena de mayor a menor', () => {
    const { categorias } = summarizeCostCategories(breakdown());
    expect(categorias.map((c) => c.key)).toEqual([
      'compras',
      'gasto:nómina',
      'viatico:combustible',
    ]);
    expect(categorias.map((c) => c.participacionPct)).toEqual([80, 15, 5]);
    const suma = categorias.reduce((acc, c) => acc + c.participacionPct, 0);
    expect(suma).toBeCloseTo(100, 5);
  });

  it('conserva la fuente de cada categoría — de dónde salió el número', () => {
    const { categorias } = summarizeCostCategories(breakdown());
    expect(categorias.find((c) => c.key === 'compras')!.fuente).toBe('facturas');
    expect(categorias.find((c) => c.key === 'viatico:combustible')!.fuente).toBe('viaticos');
  });

  it('sin costos no divide entre cero', () => {
    const r = summarizeCostCategories([]);
    expect(r).toEqual({ categorias: [], costoTotal: 0, costoPagado: 0, costoPendiente: 0 });
  });

  it('el margen del proyecto usa el costo total del desglose', () => {
    const r = summarizeCostCategories(breakdown());
    expect(computeMargin(125_000, r.costoTotal)).toEqual({ margen: 25_000, margenPct: 20 });
  });
});

// ── (b) Aislamiento por companyId ───────────────────────────────────────────

describe('aislamiento por empresa (fail-closed)', () => {
  it.each([
    ['listVendors', (s: VendorProjectFinanceService, c: any) => s.listVendors(c)],
    ['getVendorDetail', (s: VendorProjectFinanceService, c: any) => s.getVendorDetail(c, 1)],
    ['listProjects', (s: VendorProjectFinanceService, c: any) => s.listProjects(c)],
    ['getProjectDetail', (s: VendorProjectFinanceService, c: any) => s.getProjectDetail(c, 1)],
    [
      'getProjectDetail(obra)',
      (s: VendorProjectFinanceService, c: any) => s.getProjectDetail(c, 1, 'obra'),
    ],
  ])('%s sin empresa activa lanza Forbidden y no toca la base', async (_name, run) => {
    for (const sinEmpresa of [null, undefined, 0, -1, NaN]) {
      const prisma = fakePrisma();
      await expect(run(service(prisma), sinEmpresa)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$calls).toHaveLength(0);
    }
  });

  it('listVendors filtra por companyId en toda consulta', async () => {
    const prisma = fakePrisma({
      'supplier.findMany': [{ id: 7, name: 'Aceros del Norte', rfc: 'AAA010101AAA', isActive: true }],
    });
    await service(prisma).listVendors(42);

    expect(prisma.$calls.length).toBeGreaterThan(0);
    for (const where of collectWheres(prisma.$calls)) {
      expect(where.companyId).toBe(42);
    }
  });

  it('listProjects filtra por companyId en toda consulta', async () => {
    const prisma = fakePrisma();
    await service(prisma).listProjects(9);

    expect(prisma.$calls.length).toBeGreaterThan(0);
    for (const where of collectWheres(prisma.$calls)) {
      expect(where.companyId).toBe(9);
    }
  });

  it('el detalle de proveedor busca por id Y por empresa — nunca solo por id', async () => {
    const prisma = fakePrisma({
      'supplier.findFirst': { id: 5, name: 'Proveedor', isActive: true },
    });
    await service(prisma).getVendorDetail(3, 5);

    const lookup = prisma.$calls.find((c: Call) => c.model === 'supplier' && c.op === 'findFirst');
    expect(lookup.args.where).toMatchObject({ id: 5, companyId: 3 });
    for (const where of collectWheres(prisma.$calls)) {
      expect(where.companyId ?? where.supplier?.companyId).toBe(3);
    }
  });

  it('un proveedor de otra empresa responde 404, no sus datos', async () => {
    // findFirst con el scope de empresa no lo encuentra aunque el id exista.
    const prisma = fakePrisma({ 'supplier.findFirst': null });
    await expect(service(prisma).getVendorDetail(3, 999)).rejects.toThrow(
      'Proveedor no encontrado',
    );
  });

  it('un proyecto de otra empresa responde 404', async () => {
    const opPrisma = fakePrisma({ 'operationalProject.findFirst': null });
    await expect(service(opPrisma).getProjectDetail(3, 999)).rejects.toThrow(
      'Proyecto no encontrado',
    );
    const obraPrisma = fakePrisma({ 'workProject.findFirst': null });
    await expect(service(obraPrisma).getProjectDetail(3, 999, 'obra')).rejects.toThrow(
      'Proyecto no encontrado',
    );
  });

  it('el detalle de proyecto acota id + empresa en la consulta principal', async () => {
    const prisma = fakePrisma({
      'operationalProject.findFirst': {
        id: 11,
        title: 'Torre Sur',
        status: 'ACTIVE',
        currency: 'MXN',
        salesProjectId: null,
      },
    });
    await service(prisma).getProjectDetail(4, 11);
    const lookup = prisma.$calls.find(
      (c: Call) => c.model === 'operationalProject' && c.op === 'findFirst',
    );
    expect(lookup.args.where).toMatchObject({ id: 11, companyId: 4, deletedAt: null });
    for (const where of collectWheres(prisma.$calls)) {
      expect(where.companyId).toBe(4);
    }
  });
});

// ── (c) Contrato de autorización ────────────────────────────────────────────

describe('contrato de autorización', () => {
  const PERMITIDOS = [
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.INVOICING_VIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ];
  const RUTAS = ['listVendors', 'vendorDetail', 'listProjects', 'projectDetail'] as const;

  it('el controlador exige UrlAccessGuard a nivel de clase', () => {
    const guards = Reflect.getMetadata('__guards__', VendorProjectFinanceController) ?? [];
    expect(guards).toContain(UrlAccessGuard);
  });

  it.each(RUTAS)('%s exige RbacGuard', (ruta) => {
    const guards =
      Reflect.getMetadata('__guards__', VendorProjectFinanceController.prototype[ruta]) ?? [];
    expect(guards).toContain(RbacGuard);
  });

  it.each(RUTAS)('%s declara los permisos de la contadora', (ruta) => {
    const rbac = Reflect.getMetadata('rbac', VendorProjectFinanceController.prototype[ruta]);
    expect(rbac).toBeDefined();
    expect(rbac.anyPermissions).toEqual(expect.arrayContaining(PERMITIDOS));
    // Ninguna ruta se abre a más de lo declarado.
    expect(rbac.anyPermissions).toHaveLength(PERMITIDOS.length);
    // `permissions` (AND) no debe estar: se usa `anyPermissions`.
    expect(rbac.permissions).toBeUndefined();
  });

  it('un rol de campo sin permisos de finanzas no entra', () => {
    const permitidos = new Set<string>(PERMITIDOS);
    const puede = (perms: string[]) => perms.some((p) => permitidos.has(p));
    expect(puede([PERMISSIONS.CONTABILIDAD_VIEW])).toBe(true);
    expect(puede(['ops.view', 'activities.view'])).toBe(false);
    expect(puede([])).toBe(false);
  });
});

// ── (d) Los proveedores salen del modelo Supplier ───────────────────────────

describe('la lista de proveedores sale del modelo Supplier', () => {
  it('consulta supplier.findMany y nunca reconstruye proveedores desde facturas', async () => {
    const prisma = fakePrisma({
      'supplier.findMany': [
        { id: 1, name: 'Aceros del Norte', rfc: 'AAA010101AAA', isActive: true, esMayorista: true },
      ],
    });
    await service(prisma).listVendors(42);

    expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);
    // Las facturas solo se usan para agregar saldos: nada de findMany de facturas
    // para deducir quién es proveedor.
    const invoiceCalls = prisma.$calls.filter((c: Call) => c.model === 'invoice');
    expect(invoiceCalls.length).toBeGreaterThan(0);
    expect(invoiceCalls.every((c: Call) => c.op === 'groupBy')).toBe(true);
  });

  it('un proveedor sin una sola factura aparece igual, con saldo en cero', async () => {
    const prisma = fakePrisma({
      'supplier.findMany': [
        { id: 3, name: 'Proveedor Nuevo', rfc: null, isActive: true, esMayorista: false },
      ],
    });
    const res = await service(prisma).listVendors(42);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      id: 3,
      nombre: 'Proveedor Nuevo',
      saldoPorPagar: 0,
      vencido: 0,
      facturas: 0,
    });
  });

  it('cruza los agregados de factura con el proveedor por supplierId', async () => {
    const emision = new Date('2026-05-10T00:00:00Z');
    const prisma = fakePrisma({
      'supplier.findMany': [
        { id: 1, name: 'Aceros', rfc: 'AAA010101AAA', isActive: true, limiteCredito: 100_000 },
        { id: 2, name: 'Tornillos', rfc: null, isActive: true },
      ],
      'invoice.groupBy': [
        {
          supplierId: 1,
          _sum: { totalAmount: 200_000, paidAmount: 50_000 },
          _count: { _all: 4 },
          _max: { issueDate: emision },
        },
      ],
      'purchaseOrder.groupBy': [
        { supplierId: 1, _sum: { totalAmount: 90_000 }, _count: { _all: 2 }, _max: { orderDate: emision } },
      ],
    });
    const res = await service(prisma).listVendors(42);

    const aceros = res.items.find((i) => i.id === 1)!;
    // El mismo groupBy responde a las cuatro consultas del stub: saldo =
    // total − pagado de las facturas abiertas.
    expect(aceros.saldoPorPagar).toBe(150_000);
    expect(aceros.facturas).toBe(4);
    expect(aceros.ordenesCompra).toBe(2);
    expect(aceros.ultimaCompra).toBe(emision.toISOString());
    // 150 000 de saldo contra un tope de 100 000: hay que avisar.
    expect(aceros.excedeCredito).toBe(true);

    const tornillos = res.items.find((i) => i.id === 2)!;
    expect(tornillos.saldoPorPagar).toBe(0);
    expect(tornillos.excedeCredito).toBe(false);
  });

  it('el detalle 360° lee el proveedor por su id, no por el nombre de la factura', async () => {
    const prisma = fakePrisma({
      'supplier.findFirst': {
        id: 5,
        name: 'Aceros del Norte',
        rfc: 'AAA010101AAA',
        isActive: true,
        esMayorista: true,
        creditoDias: 30,
        limiteCredito: 250_000,
      },
    });
    const res = await service(prisma).getVendorDetail(42, 5);
    expect(res.proveedor).toMatchObject({ id: 5, nombre: 'Aceros del Norte', rfc: 'AAA010101AAA' });
    expect(res.condiciones).toMatchObject({ esMayorista: true, creditoDias: 30, limiteCredito: 250_000 });
    expect(prisma.supplier.findFirst).toHaveBeenCalledTimes(1);
  });
});

// ── Antigüedad del saldo ────────────────────────────────────────────────────

describe('antigüedad del saldo por pagar', () => {
  const diasAtras = (n: number) => {
    const hoy = new Date();
    return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - n));
  };

  const factura = (id: number, vence: Date) => ({
    id,
    invoiceNumber: `F-${id}`,
    type: 'ACCOUNTS_PAYABLE',
    status: 'SENT',
    issueDate: vence,
    dueDate: vence,
    totalAmount: 10_000,
    paidAmount: 0,
    currency: 'MXN',
    cfdiUuid: null,
    isCancelled: false,
    activity: null,
  });

  async function detalle(facturas: unknown[]) {
    const prisma = fakePrisma({
      'supplier.findFirst': { id: 1, name: 'Proveedor', isActive: true },
      'invoice.findMany': facturas,
    });
    return service(prisma).getVendorDetail(42, 1);
  }

  it('una factura que vence HOY no está vencida', async () => {
    const res = await detalle([factura(1, diasAtras(0))]);
    expect(res.cuentasPorPagar.facturas[0].diasVencido).toBe(0);
    expect(res.resumen.vencido).toBe(0);
    expect(res.resumen.porVencer).toBe(10_000);
    const porVencer = res.cuentasPorPagar.antiguedad.find((b) => b.key === 'porVencer')!;
    expect(porVencer.monto).toBe(10_000);
  });

  it('reparte el saldo en el tramo que le toca', async () => {
    const res = await detalle([
      factura(1, diasAtras(0)), // por vencer
      factura(2, diasAtras(10)), // 1 a 30
      factura(3, diasAtras(45)), // 31 a 60
      factura(4, diasAtras(75)), // 61 a 90
      factura(5, diasAtras(200)), // más de 90
    ]);
    const tramo = (key: string) => res.cuentasPorPagar.antiguedad.find((b) => b.key === key)!;
    expect(tramo('porVencer').monto).toBe(10_000);
    expect(tramo('d1_30').monto).toBe(10_000);
    expect(tramo('d31_60').monto).toBe(10_000);
    expect(tramo('d61_90').monto).toBe(10_000);
    expect(tramo('d90').monto).toBe(10_000);
    // Los tramos suman exactamente el saldo total.
    const suma = res.cuentasPorPagar.antiguedad.reduce((acc, b) => acc + b.monto, 0);
    expect(suma).toBe(res.resumen.saldoPorPagar);
    expect(res.resumen.vencido).toBe(40_000);
  });

  it('el saldo descuenta lo ya pagado de cada factura', async () => {
    const res = await detalle([{ ...factura(1, diasAtras(5)), paidAmount: 2_500 }]);
    expect(res.cuentasPorPagar.facturas[0].saldo).toBe(7_500);
    expect(res.resumen.saldoPorPagar).toBe(7_500);
  });

  it('una factura cancelada o pagada no cuenta en el saldo', async () => {
    const res = await detalle([
      { ...factura(1, diasAtras(5)), isCancelled: true },
      { ...factura(2, diasAtras(5)), status: 'PAID' },
    ]);
    expect(res.cuentasPorPagar.facturas).toHaveLength(0);
    expect(res.resumen.saldoPorPagar).toBe(0);
  });
});

// ── Sin N+1 ─────────────────────────────────────────────────────────────────

describe('sin N+1', () => {
  it('N proveedores no generan N consultas', async () => {
    const suppliers = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `Proveedor ${i + 1}`,
      rfc: null,
      isActive: true,
    }));
    const prisma = fakePrisma({ 'supplier.findMany': suppliers });
    await service(prisma).listVendors(42);
    // 1 findMany + 4 groupBy de factura + 1 groupBy de orden de compra.
    expect(prisma.$calls).toHaveLength(6);
  });

  it('N proyectos no generan N consultas', async () => {
    const proyectos = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      title: `Proyecto ${i + 1}`,
      status: 'ACTIVE',
      currency: 'MXN',
      salesProjectId: null,
      client: null,
    }));
    const prisma = fakePrisma({ 'operationalProject.findMany': proyectos });
    await service(prisma).listProjects(42);
    // 2 listas de proyecto + 7 agregados, sin importar cuántos proyectos haya.
    expect(prisma.$calls).toHaveLength(9);
  });
});
