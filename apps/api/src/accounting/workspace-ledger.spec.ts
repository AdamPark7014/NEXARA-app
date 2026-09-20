import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  AccountingWorkspaceLedgerService,
  buildLedgerCsv,
  csvCell,
  type LedgerRow,
} from './workspace-ledger.service.js';
import { AccountingWorkspaceLedgerController } from './workspace-ledger.controller.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Libro de movimientos de la contadora.
 *
 * Tres cosas que no se pueden romper:
 *   (a) aislamiento por empresa — hubo un incidente de datos cruzados,
 *   (b) los totales del filtro completo, que es lo que ella cuadra,
 *   (c) el contrato de autorización del endpoint.
 */

const TENANT = 7;
const OTRO_TENANT = 99;

/** Recolecta todos los valores de `companyId` que aparezcan a cualquier nivel. */
function collectCompanyIds(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const item of node) collectCompanyIds(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'companyId') out.push(value);
      else collectCompanyIds(value, out);
    }
  }
  return out;
}

/** Busca el primer valor asociado a `key` dentro de un `where` anidado. */
function findInWhere(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findInWhere(item, key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) return v;
      const hit = findInWhere(v, key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

type Agg = { monto: number; conteo: number };

const agg = (field: string, { monto, conteo }: Agg) => ({
  _sum: { [field]: monto },
  _count: { _all: conteo },
});

/**
 * Prisma de mentira. Cada `aggregate` devuelve el total que le toca a ese
 * bucket; los `findMany` devuelven vacío porque aquí se mide el cálculo de
 * totales y el `where`, no el mapeo de filas.
 */
function buildPrisma() {
  const wheres: { model: string; op: string; where: unknown }[] = [];

  const record = (model: string, op: string, args: any) => {
    wheres.push({ model, op, where: args?.where });
  };

  const bankTxTotals = (where: any): Agg => {
    const isDebit = findInWhere(where, 'isDebit');
    const clabe = findInWhere(where, 'counterpartyClabe');
    // `{ in: [...] }` sólo aparece en los buckets de traspaso.
    const esTraspaso = !!clabe && typeof clabe === 'object' && 'in' in (clabe as object);
    if (esTraspaso) return { monto: isDebit ? 4_000 : 4_000, conteo: 1 };
    return isDebit ? { monto: 300, conteo: 2 } : { monto: 500, conteo: 1 };
  };

  const invoiceTotals = (where: any): Agg => {
    const type = findInWhere(where, 'type');
    if (type === 'ACCOUNTS_RECEIVABLE') return { monto: 2_000, conteo: 4 };
    if (type === 'ACCOUNTS_PAYABLE') return { monto: 700, conteo: 3 };
    return { monto: 5_000, conteo: 2 }; // ajustes (canceladas / nota de crédito)
  };

  const paymentTotals = (where: any): Agg => {
    const type = findInWhere(where, 'type');
    return type === 'ACCOUNTS_RECEIVABLE'
      ? { monto: 1_000, conteo: 2 }
      : { monto: 400, conteo: 1 };
  };

  return {
    wheres,
    prisma: {
      bankAccount: {
        findMany: jest.fn(async (args: any) => {
          record('bankAccount', 'findMany', args);
          return [
            {
              id: 1,
              name: 'Operativa',
              bankName: 'Banorte',
              clabe: '072000000000000001',
              accountNumber: '0001',
            },
          ];
        }),
      },
      payment: {
        findMany: jest.fn(async (args: any) => {
          record('payment', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('payment', 'aggregate', args);
          return agg('amount', paymentTotals(args.where));
        }),
      },
      expense: {
        findMany: jest.fn(async (args: any) => {
          record('expense', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('expense', 'aggregate', args);
          return agg('montoSolicitado', { monto: 250, conteo: 3 });
        }),
      },
      workProjectExpense: {
        findMany: jest.fn(async (args: any) => {
          record('workProjectExpense', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('workProjectExpense', 'aggregate', args);
          return agg('amount', { monto: 100, conteo: 1 });
        }),
      },
      bankTransaction: {
        findMany: jest.fn(async (args: any) => {
          record('bankTransaction', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('bankTransaction', 'aggregate', args);
          return agg('amount', bankTxTotals(args.where));
        }),
      },
      employeePayment: {
        findMany: jest.fn(async (args: any) => {
          record('employeePayment', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('employeePayment', 'aggregate', args);
          return agg('amount', { monto: 900, conteo: 2 });
        }),
      },
      invoice: {
        findMany: jest.fn(async (args: any) => {
          record('invoice', 'findMany', args);
          return [];
        }),
        aggregate: jest.fn(async (args: any) => {
          record('invoice', 'aggregate', args);
          return agg('totalAmount', invoiceTotals(args.where));
        }),
      },
    },
  };
}

function build() {
  const { prisma, wheres } = buildPrisma();
  return {
    service: new AccountingWorkspaceLedgerService(prisma as any),
    prisma,
    wheres,
  };
}

// ───────────────────────── (a) aislamiento por empresa ─────────────────────────

describe('libro de movimientos · aislamiento por empresa', () => {
  it('sin empresa activa no devuelve nada: lanza 403', async () => {
    const { service, prisma } = build();
    await expect(service.listMovements(null, {})).rejects.toThrow(ForbiddenException);
    await expect(service.listMovements(undefined, {})).rejects.toThrow(ForbiddenException);
    await expect(service.listMovements(0, {})).rejects.toThrow(ForbiddenException);
    // Ni siquiera llegó a consultar: fail-closed antes de tocar la base.
    expect(prisma.bankAccount.findMany).not.toHaveBeenCalled();
  });

  it('la exportación CSV exige empresa igual que el listado', async () => {
    const { service } = build();
    await expect(service.exportMovements(null, {})).rejects.toThrow(ForbiddenException);
  });

  it('toda consulta lleva el companyId activo — ninguna sin sellar', async () => {
    const { service, wheres } = build();
    await service.listMovements(TENANT, {});

    expect(wheres.length).toBeGreaterThan(0);
    for (const entry of wheres) {
      const ids = collectCompanyIds(entry.where);
      expect({ model: entry.model, op: entry.op, ids }).toEqual({
        model: entry.model,
        op: entry.op,
        ids: expect.arrayContaining([TENANT]),
      });
      // Y nunca el de otra empresa.
      expect(ids.every((id) => id === TENANT)).toBe(true);
    }
  });

  it('las relaciones también se sellan: la factura no sirve de puente a otro tenant', async () => {
    const { service, wheres } = build();
    await service.listMovements(TENANT, {});

    const pagos = wheres.filter((w) => w.model === 'payment');
    expect(pagos.length).toBeGreaterThan(0);
    for (const entry of pagos) {
      const invoice: any = findInWhere(entry.where, 'invoice');
      expect(invoice?.is?.companyId).toBe(TENANT);
    }
  });

  it('un filtro con ids de otra empresa sigue acotado a la empresa activa', async () => {
    const { service, wheres } = build();
    await service.listMovements(TENANT, { clienteId: String(OTRO_TENANT) });

    for (const entry of wheres) {
      const ids = collectCompanyIds(entry.where);
      expect(ids.every((id) => id === TENANT)).toBe(true);
    }
  });
});

// ───────────────────────── (b) totales ─────────────────────────

describe('libro de movimientos · totales del filtro completo', () => {
  it('suma ingresos, egresos y neto sobre todo el filtro, no sobre la página', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, { pageSize: 10 });

    // Ingresos: cobros 1 000 (efectivo) + banco 500 (efectivo) + facturas emitidas 2 000 (devengado)
    expect(res.totals.ingresos).toBe(3_500);
    // Egresos: pagos 400 + banco 300 (efectivo) + gastos 250 + obra 100 + nómina 900 + facturas recibidas 700
    expect(res.totals.egresos).toBe(2_650);
    expect(res.totals.neto).toBe(850);
  });

  it('separa efectivo de devengado para no contar dos veces el mismo peso', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, {});

    expect(res.totals.efectivo).toEqual({
      ingresos: 1_500, // cobros + banco
      egresos: 700, // pagos a proveedor + banco
      neto: 800,
      conteo: 6,
    });
    expect(res.totals.devengado).toEqual({
      ingresos: 2_000, // facturas emitidas
      egresos: 1_950, // gastos + obra + nómina + facturas recibidas
      neto: 50,
      // 3 gastos + 1 obra + 2 nómina + 4 facturas emitidas + 3 recibidas.
      // Los 2 ajustes no entran al bloque: no suman.
      conteo: 13,
    });
    // Efectivo + devengado = el total general.
    expect(res.totals.efectivo.ingresos + res.totals.devengado.ingresos).toBe(res.totals.ingresos);
    expect(res.totals.efectivo.egresos + res.totals.devengado.egresos).toBe(res.totals.egresos);
  });

  it('un traspaso entre cuentas propias no es ingreso ni egreso', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, {});

    expect(res.totals.transferencias).toEqual({ monto: 8_000, conteo: 2 });
    // 8 000 de traspasos y aun así el neto no se movió.
    expect(res.totals.neto).toBe(850);
  });

  it('una factura cancelada o con nota de crédito se ve pero no suma', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, {});

    expect(res.totals.ajustes).toEqual({ monto: 5_000, conteo: 2 });
    expect(res.totals.ingresos).toBe(3_500);
  });

  it('el conteo incluye toda fila listada, también traspasos y ajustes', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, {});

    // 2+1 pagos, 3 gastos, 1 obra, 1+2 banco, 2 traspasos, 2 nómina, 4+3+2 facturas
    expect(res.total).toBe(23);
    expect(res.totals.conteo).toBe(23);
  });

  it('filtrar por tipo deja fuera las fuentes que no aplican', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, { tipo: 'INGRESO' });

    expect(res.totals.egresos).toBe(0);
    expect(res.totals.ingresos).toBe(3_500);
    expect(res.totals.transferencias.conteo).toBe(0);
  });

  it('filtrar por método de pago sólo deja los pagos: un gasto no tiene método', async () => {
    const { service, wheres } = build();
    await service.listMovements(TENANT, { metodoPago: 'spei' });

    const modelos = new Set(wheres.filter((w) => w.op !== 'findMany' || w.model !== 'bankAccount').map((w) => w.model));
    expect(modelos.has('payment')).toBe(true);
    expect(modelos.has('expense')).toBe(false);
    expect(modelos.has('employeePayment')).toBe(false);
  });
});

// ───────────────────────── filtros y paginación ─────────────────────────

describe('libro de movimientos · filtros y paginación', () => {
  it('rechaza un rango de fechas al revés', async () => {
    const { service } = build();
    await expect(
      service.listMovements(TENANT, { from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza tipos y métodos que no existen en el catálogo', async () => {
    const { service } = build();
    await expect(service.listMovements(TENANT, { tipo: 'DONATIVO' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.listMovements(TENANT, { metodoPago: 'BITCOIN' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('el tamaño de página se topa en 200', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, { pageSize: 5_000 });
    expect(res.pageSize).toBe(200);
  });

  it('no pagina más allá del tope: lo dice en vez de devolver filas incompletas', async () => {
    const { service } = build();
    await expect(service.listMovements(TENANT, { page: 500, pageSize: 200 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('sin rango explícito toma el mes en curso', async () => {
    const { service } = build();
    const res = await service.listMovements(TENANT, {});
    expect(res.period.from.slice(8)).toBe('01');
    expect(res.period.from.slice(0, 7)).toBe(res.period.to.slice(0, 7));
  });

  it('el proyecto se pide como `obra:<id>` o `op:<id>`', async () => {
    const { service } = build();
    const obra = await service.listMovements(TENANT, { proyectoId: 'obra:12' });
    expect(obra.filters.proyectoId).toBe('obra:12');

    const op = await service.listMovements(TENANT, { proyectoId: '5' });
    expect(op.filters.proyectoId).toBe('op:5');

    await expect(service.listMovements(TENANT, { proyectoId: 'obra:x' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ───────────────────────── CSV ─────────────────────────

describe('libro de movimientos · exportación CSV', () => {
  const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
    id: 'payments:1',
    fecha: '2026-09-15',
    tipo: 'INGRESO',
    naturaleza: 'EFECTIVO',
    concepto: 'Cobro de factura A-1',
    categoria: 'Cobro',
    cuenta: { id: 1, nombre: 'Operativa · Banorte' },
    contraparte: { tipo: 'cliente', id: 3, nombre: 'ACME, S.A. de C.V.' },
    proyecto: null,
    referencia: 'SPEI-99',
    ingreso: 1234.5,
    egreso: 0,
    monto: 1234.5,
    estado: 'Registrado',
    metodoPago: 'SPEI',
    registradoPor: 'Elisa',
    origen: { tabla: 'payments', id: 1, href: null },
    comprobanteUrl: null,
    ...over,
  });

  it('entrecomilla lo que llevaría coma o salto de línea', () => {
    expect(csvCell('ACME, S.A. de C.V.')).toBe('"ACME, S.A. de C.V."');
    expect(csvCell('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvCell(null)).toBe('');
  });

  it('el encabezado y la fila cuadran en número de columnas', () => {
    // Sin comas dentro de los datos, para que contar por comas sea válido.
    const csv = buildLedgerCsv([row({ contraparte: { tipo: 'cliente', id: 3, nombre: 'ACME SA' } })]);
    const [head, body] = csv.split('\r\n');
    const count = (line: string) => line.split(',').length;
    expect(count(head)).toBe(16);
    expect(count(body)).toBe(16);
  });

  it('traduce el método de pago y deja el importe contrario en blanco', () => {
    const csv = buildLedgerCsv([row()]);
    expect(csv).toContain('1234.50');
    expect(csv).toContain('SPEI');
    expect(csv.split('\r\n')[1]).toContain(',,'); // egreso vacío
  });

  it('exporta respetando los mismos filtros y nombra el archivo con el rango', async () => {
    const { service } = build();
    const out = await service.exportMovements(TENANT, { from: '2026-09-01', to: '2026-09-30' });
    expect(out.filename).toBe('movimientos-2026-09-01-a-2026-09-30.csv');
    expect(out.csv.split('\r\n')[0]).toContain('Fecha');
  });
});

// ───────────────────────── (c) contrato de autorización ─────────────────────────

describe('libro de movimientos · contrato de autorización', () => {
  const permisos = (method: string) =>
    Reflect.getMetadata(
      'rbac',
      (AccountingWorkspaceLedgerController.prototype as any)[method],
    ) as { anyPermissions?: string[] } | undefined;

  it('el listado exige contabilidad, facturación o consola', () => {
    expect(permisos('movimientos')?.anyPermissions).toEqual([
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ]);
  });

  it('la exportación exige exactamente los mismos permisos que el listado', () => {
    expect(permisos('exportMovimientos')?.anyPermissions).toEqual(
      permisos('movimientos')?.anyPermissions,
    );
  });

  it('un rol de campo sin permisos de finanzas queda fuera', () => {
    const allowed = new Set(permisos('movimientos')?.anyPermissions ?? []);
    const puede = (perms: string[]) => perms.some((p) => allowed.has(p));

    expect(puede([PERMISSIONS.CONTABILIDAD_VIEW])).toBe(true);
    expect(puede(['ops.view', 'activities.view'])).toBe(false);
    expect(puede([])).toBe(false);
  });

  it('ambos endpoints pasan por RbacGuard además de la whitelist de URL', () => {
    const guards = (method: string) =>
      (Reflect.getMetadata(
        '__guards__',
        (AccountingWorkspaceLedgerController.prototype as any)[method],
      ) ?? []) as Array<{ name?: string }>;

    for (const method of ['movimientos', 'exportMovimientos']) {
      expect(guards(method).map((g) => g?.name)).toContain('RbacGuard');
    }
    const classGuards = (Reflect.getMetadata('__guards__', AccountingWorkspaceLedgerController) ??
      []) as Array<{ name?: string }>;
    expect(classGuards.map((g) => g?.name)).toContain('UrlAccessGuard');
  });
});

// ───────────────────────── mezcla y paginación de filas ─────────────────────────

describe('libro de movimientos · mezcla de fuentes', () => {
  /** Prisma con filas reales en pagos y facturas, para probar el merge. */
  function buildConFilas() {
    const { prisma } = buildPrisma();

    prisma.payment.findMany = jest.fn(async () => [
      {
        id: 1,
        amount: 100,
        paymentDate: new Date('2026-09-10T00:00:00.000Z'),
        method: 'SPEI',
        reference: 'REF-1',
        speiTrackingKey: null,
        operationNumber: null,
        notes: null,
        bankAccountId: 1,
        bankAccount: { id: 1, name: 'Operativa', bankName: 'Banorte' },
        createdBy: { nombre: 'Elisa' },
        invoice: {
          id: 5,
          invoiceNumber: 'A-5',
          pdfUrl: null,
          clientId: 2,
          supplierId: null,
          client: { id: 2, name: 'ACME' },
          supplier: null,
          receptorName: null,
          emisorName: null,
          activity: null,
        },
      },
    ]) as any;

    prisma.invoice.findMany = jest.fn(async () => [
      {
        id: 9,
        invoiceNumber: 'A-9',
        type: 'ACCOUNTS_RECEIVABLE',
        status: 'SENT',
        issueDate: new Date('2026-09-20T00:00:00.000Z'),
        totalAmount: 500,
        cfdiUuid: null,
        pdfUrl: 'https://cdn/x.pdf',
        notes: null,
        isCancelled: false,
        receptorName: null,
        emisorName: null,
        client: { id: 2, name: 'ACME' },
        supplier: null,
        createdBy: { nombre: 'Elisa' },
        activity: null,
      },
    ]) as any;

    return new AccountingWorkspaceLedgerService(prisma as any);
  }

  it('ordena por fecha descendente aunque las filas vengan de tablas distintas', async () => {
    const service = buildConFilas();
    const res = await service.listMovements(TENANT, { pageSize: 50 });

    const fechas = res.items.map((r) => r.fecha);
    expect(fechas).toEqual([...fechas].sort().reverse());
    expect(res.items[0].fecha).toBe('2026-09-20');
  });

  it('cada fila trae su origen para poder abrir el documento', async () => {
    const service = buildConFilas();
    const res = await service.listMovements(TENANT, {});

    const pago = res.items.find((r) => r.origen.tabla === 'payments');
    expect(pago).toMatchObject({
      id: 'payments:1',
      tipo: 'INGRESO',
      naturaleza: 'EFECTIVO',
      ingreso: 100,
      egreso: 0,
      contraparte: { tipo: 'cliente', id: 2, nombre: 'ACME' },
      cuenta: { id: 1, nombre: 'Operativa · Banorte' },
      registradoPor: 'Elisa',
    });

    const factura = res.items.find((r) => r.origen.tabla === 'invoices');
    expect(factura).toMatchObject({
      id: 'invoices:9',
      naturaleza: 'DEVENGADO',
      estado: 'Enviada',
      comprobanteUrl: 'https://cdn/x.pdf',
    });
  });

  it('una fecha @db.Date no se corre un día por la zona horaria', async () => {
    const service = buildConFilas();
    const res = await service.listMovements(TENANT, {});
    // Medianoche UTC del 10 de septiembre debe leerse 10, no 9.
    expect(res.items.find((r) => r.id === 'payments:1')?.fecha).toBe('2026-09-10');
  });

  it('la página recorta la mezcla, pero el total sigue siendo el del filtro', async () => {
    const service = buildConFilas();
    const res = await service.listMovements(TENANT, { pageSize: 1 });

    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('invoices:9'); // la más reciente
    expect(res.total).toBe(23); // total del filtro, no de la página
    expect(res.totalPages).toBe(23);
  });
});
