import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '../common/permissions.js';
import { WorkspaceArApController } from './workspace-ar-ap.controller.js';
import {
  AGING_BUCKETS,
  WorkspaceArApService,
  bucketDeAging,
  calcularAging,
  calcularTotales,
  diasVencido,
  estadoDe,
  pendienteDe,
} from './workspace-ar-ap.service.js';

/**
 * Cartera de la contadora (CxC / CxP).
 *
 * Tres cosas que no pueden romperse:
 *  1. El aislamiento por empresa. Hubo un incidente de datos cruzados: si un
 *     `where` sale sin `companyId`, la contadora de una empresa ve la cartera
 *     de otra.
 *  2. La antigüedad y los días vencidos. Son la razón de ser de la pantalla;
 *     un tramo mal calculado manda a cobrar lo que no toca.
 *  3. El contrato de autorización de los endpoints.
 */

// ── Fechas de prueba ───────────────────────────────────────────────────────
// Los vencimientos se construyen a medianoche UTC porque así llegan las
// columnas `@db.Date` de Prisma; "hoy" se construye en hora local porque así
// lo ve el servidor. Mezclarlos es justo el caso que corría un día los
// cálculos.
const HOY = new Date(2026, 8, 20, 15, 30, 0); // 20-sep-2026, hora local
const diaUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

type FilaPrueba = {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date | string | null;
  status?: string;
  isCancelled?: boolean;
};

const fila = (over: Partial<FilaPrueba> = {}): FilaPrueba => ({
  totalAmount: 1000,
  paidAmount: 0,
  dueDate: diaUtc(2026, 9, 20),
  status: 'SENT',
  isCancelled: false,
  ...over,
});

// ── (a) Aislamiento por empresa ────────────────────────────────────────────

function construir(over: Record<string, any> = {}) {
  const invoice = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    ...over,
  };
  const prisma = { invoice };
  const service = new WorkspaceArApService(prisma as any);
  return { service, invoice };
}

/** Todos los `where` que tocaron a Prisma en la llamada. */
const wheres = (invoice: { findMany: jest.Mock; findFirst: jest.Mock }) =>
  [...invoice.findMany.mock.calls, ...invoice.findFirst.mock.calls].map((c) => c[0].where);

describe('aislamiento por empresa', () => {
  it('listar exige empresa activa — sin companyId no consulta nada', async () => {
    const { service, invoice } = construir();
    await expect(service.listar('cxc', null, {})).rejects.toThrow(ForbiddenException);
    await expect(service.listar('cxp', undefined, {})).rejects.toThrow(ForbiddenException);
    await expect(service.listar('cxc', 0, {})).rejects.toThrow(ForbiddenException);
    expect(invoice.findMany).not.toHaveBeenCalled();
  });

  it('calendario y detalle también exigen empresa activa', async () => {
    const { service, invoice } = construir();
    await expect(service.calendario('cxp', null, {})).rejects.toThrow(ForbiddenException);
    await expect(service.detalle('cxc', 1, null)).rejects.toThrow(ForbiddenException);
    await expect(service.xml('cxc', 1, null)).rejects.toThrow(ForbiddenException);
    expect(invoice.findMany).not.toHaveBeenCalled();
    expect(invoice.findFirst).not.toHaveBeenCalled();
  });

  it('cada consulta de la lista lleva el companyId de la sesión', async () => {
    const { service, invoice } = construir();
    await service.listar('cxc', 7, { q: 'ACME', estado: 'todas' });
    expect(invoice.findMany).toHaveBeenCalledTimes(2);
    for (const where of wheres(invoice)) {
      expect(where.companyId).toBe(7);
      expect(where.type).toBe('ACCOUNTS_RECEIVABLE');
      expect(where.deletedAt).toBeNull();
    }
  });

  it('el calendario de CxP filtra por empresa y por tipo', async () => {
    const { service, invoice } = construir();
    await service.calendario('cxp', 12, { dias: 60 });
    const where = invoice.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(12);
    expect(where.type).toBe('ACCOUNTS_PAYABLE');
    expect(where.isCancelled).toBe(false);
  });

  it('el detalle no se sirve por id suelto: el where lleva empresa y tipo', async () => {
    const { service, invoice } = construir({
      findFirst: jest.fn().mockResolvedValue({
        id: 5,
        companyId: 7,
        invoiceNumber: 'A-5',
        type: 'ACCOUNTS_RECEIVABLE',
        status: 'SENT',
        issueDate: diaUtc(2026, 9, 1),
        dueDate: diaUtc(2026, 9, 30),
        totalAmount: 100,
        paidAmount: 0,
        currency: 'MXN',
        isCancelled: false,
        createdAt: new Date('2026-09-01T10:00:00Z'),
        items: [],
        payments: [],
      }),
    });
    const res = await service.detalle('cxc', 5, 7);
    const where = invoice.findFirst.mock.calls[0][0].where;
    expect(where.companyId).toBe(7);
    expect(where.id).toBe(5);
    expect(where.type).toBe('ACCOUNTS_RECEIVABLE');
    expect(res.factura.folio).toBe('A-5');
  });

  it('una factura de otra empresa no existe para quien pregunta', async () => {
    // Segunda línea de defensa: aunque el `where` fallara, la fila ajena se
    // rechaza como 404 (no 403: no se confirma que exista).
    const { service } = construir({
      findFirst: jest.fn().mockResolvedValue({ id: 5, companyId: 99, invoiceNumber: 'A-5' }),
    });
    await expect(service.detalle('cxc', 5, 7)).rejects.toThrow(NotFoundException);
  });

  it('el XML sí propaga la empresa (el de /invoices/:id/xml no lo hacía)', async () => {
    const { service, invoice } = construir({
      findFirst: jest.fn().mockResolvedValue({
        id: 9,
        companyId: 3,
        invoiceNumber: 'B/9',
        cfdiXml: '<cfdi/>',
      }),
    });
    const res = await service.xml('cxp', 9, 3);
    expect(invoice.findFirst.mock.calls[0][0].where.companyId).toBe(3);
    expect(res.filename).toBe('B_9.xml');
    expect(res.body).toBe('<cfdi/>');
  });

  it('cartera inválida se rechaza antes de tocar la base', async () => {
    const { service, invoice } = construir();
    await expect(service.listar('otra' as any, 7, {})).rejects.toThrow(BadRequestException);
    expect(invoice.findMany).not.toHaveBeenCalled();
  });

  it('el filtro de estado no acepta valores inventados', async () => {
    const { service } = construir();
    await expect(service.listar('cxc', 7, { estado: 'loquesea' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.listar('cxc', 7, { aging: 'ayer' })).rejects.toThrow(BadRequestException);
  });

  it('"abiertas" excluye canceladas y borradores en el propio where', async () => {
    const { service, invoice } = construir();
    await service.listar('cxc', 7, {});
    const where = invoice.findMany.mock.calls[0][0].where;
    expect(where.isCancelled).toBe(false);
    expect(where.status).toEqual({ in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] });
  });
});

// ── (b) Antigüedad y días vencido ──────────────────────────────────────────

describe('días vencido', () => {
  it('cuenta los días transcurridos desde el vencimiento', () => {
    expect(diasVencido(diaUtc(2026, 9, 10), HOY)).toBe(10);
    expect(diasVencido(diaUtc(2026, 9, 19), HOY)).toBe(1);
  });

  it('vence hoy es 0, no "vencida"', () => {
    expect(diasVencido(diaUtc(2026, 9, 20), HOY)).toBe(0);
    expect(estadoDe(fila({ dueDate: diaUtc(2026, 9, 20) }), HOY).clave).toBe('hoy');
  });

  it('lo que aún no vence sale en negativo', () => {
    expect(diasVencido(diaUtc(2026, 9, 25), HOY)).toBe(-5);
  });

  it('sin fecha de vencimiento devuelve null, nunca 0', () => {
    // Un 0 se leería como "vence hoy" y mandaría a cobrar algo sin plazo.
    expect(diasVencido(null, HOY)).toBeNull();
    expect(diasVencido(undefined, HOY)).toBeNull();
    expect(diasVencido('', HOY)).toBeNull();
  });

  it('acepta la fecha como texto ISO sin correrse de día', () => {
    expect(diasVencido('2026-09-10', HOY)).toBe(10);
    expect(diasVencido('2026-09-20T00:00:00.000Z', HOY)).toBe(0);
  });

  it('la hora del día no altera la cuenta', () => {
    const madrugada = new Date(2026, 8, 20, 0, 1, 0);
    const casiMedianoche = new Date(2026, 8, 20, 23, 59, 0);
    expect(diasVencido(diaUtc(2026, 9, 15), madrugada)).toBe(5);
    expect(diasVencido(diaUtc(2026, 9, 15), casiMedianoche)).toBe(5);
  });
});

describe('tramos de antigüedad', () => {
  it('reparte por frontera exacta', () => {
    expect(bucketDeAging(diaUtc(2026, 9, 19), HOY)).toBe('vencido');
    expect(bucketDeAging(diaUtc(2026, 9, 20), HOY)).toBe('hoy');
    expect(bucketDeAging(diaUtc(2026, 9, 21), HOY)).toBe('proximos7');
    expect(bucketDeAging(diaUtc(2026, 9, 27), HOY)).toBe('proximos7'); // +7 exacto
    expect(bucketDeAging(diaUtc(2026, 9, 28), HOY)).toBe('proximos30'); // +8
    expect(bucketDeAging(diaUtc(2026, 10, 20), HOY)).toBe('proximos30'); // +30 exacto
    expect(bucketDeAging(diaUtc(2026, 10, 21), HOY)).toBe('mas30'); // +31
  });

  it('sin vencimiento tiene su propio tramo, no se cuela en "vencido"', () => {
    expect(bucketDeAging(null, HOY)).toBe('sinFecha');
  });

  it('los tramos publicados son los que consume la vista', () => {
    expect([...AGING_BUCKETS]).toEqual([
      'vencido',
      'hoy',
      'proximos7',
      'proximos30',
      'mas30',
      'sinFecha',
    ]);
  });
});

describe('saldo pendiente', () => {
  it('descuenta lo pagado', () => {
    expect(pendienteDe(1000, 400)).toBe(600);
  });

  it('un sobrepago no genera saldo negativo', () => {
    expect(pendienteDe(1000, 1200)).toBe(0);
  });

  it('tolera decimales sucios', () => {
    expect(pendienteDe(1000.1, 0.2)).toBe(999.9);
  });
});

describe('agregados de cartera', () => {
  it('suma solo lo que tiene saldo vivo en cada tramo', () => {
    const aging = calcularAging(
      [
        fila({ totalAmount: 1000, dueDate: diaUtc(2026, 9, 10) }), // vencida
        fila({ totalAmount: 500, dueDate: diaUtc(2026, 9, 20) }), // hoy
        fila({ totalAmount: 300, dueDate: diaUtc(2026, 9, 25) }), // 7 días
        fila({ totalAmount: 200, dueDate: diaUtc(2026, 10, 15) }), // 30 días
        fila({ totalAmount: 100, dueDate: diaUtc(2026, 12, 1) }), // más de 30
        fila({ totalAmount: 900, dueDate: null }), // sin fecha
      ],
      HOY,
    );
    expect(aging.vencido).toEqual({ monto: 1000, documentos: 1 });
    expect(aging.hoy).toEqual({ monto: 500, documentos: 1 });
    expect(aging.proximos7).toEqual({ monto: 300, documentos: 1 });
    expect(aging.proximos30).toEqual({ monto: 200, documentos: 1 });
    expect(aging.mas30).toEqual({ monto: 100, documentos: 1 });
    expect(aging.sinFecha).toEqual({ monto: 900, documentos: 1 });
  });

  it('una pagada parcial aporta solo el resto', () => {
    const aging = calcularAging(
      [fila({ totalAmount: 1000, paidAmount: 400, status: 'PARTIALLY_PAID', dueDate: diaUtc(2026, 9, 10) })],
      HOY,
    );
    expect(aging.vencido).toEqual({ monto: 600, documentos: 1 });
  });

  it('una pagada del todo no es cartera aunque su fecha haya pasado', () => {
    const aging = calcularAging(
      [fila({ totalAmount: 1000, paidAmount: 1000, status: 'PAID', dueDate: diaUtc(2026, 1, 5) })],
      HOY,
    );
    expect(aging.vencido).toEqual({ monto: 0, documentos: 0 });
  });

  it('una cancelada nunca cuenta, ni vencida ni pendiente', () => {
    const canceladas = [
      fila({ isCancelled: true, dueDate: diaUtc(2026, 9, 1) }),
      fila({ status: 'CANCELLED', dueDate: diaUtc(2026, 9, 1) }),
    ];
    const aging = calcularAging(canceladas, HOY);
    expect(aging.vencido.documentos).toBe(0);

    const totales = calcularTotales(canceladas, HOY);
    expect(totales.pendiente).toBe(0);
    expect(totales.vencido).toBe(0);
    expect(totales.documentos).toBe(2); // se listan, pero no suman saldo
  });

  it('los totales separan facturado, cobrado, pendiente y vencido', () => {
    const totales = calcularTotales(
      [
        fila({ totalAmount: 1000, paidAmount: 400, dueDate: diaUtc(2026, 9, 10) }), // vencida
        fila({ totalAmount: 500, paidAmount: 0, dueDate: diaUtc(2026, 10, 1) }), // por vencer
        fila({ totalAmount: 250, paidAmount: 250, status: 'PAID', dueDate: diaUtc(2026, 9, 1) }),
      ],
      HOY,
    );
    expect(totales.total).toBe(1750);
    expect(totales.pagado).toBe(650);
    expect(totales.pendiente).toBe(1100);
    expect(totales.vencido).toBe(600);
  });
});

describe('estado legible', () => {
  it('nombra los casos que la contadora distingue', () => {
    expect(estadoDe(fila({ dueDate: diaUtc(2026, 9, 10) }), HOY)).toMatchObject({
      clave: 'vencida',
      etiqueta: 'Vencida · 10 días',
      tono: 'bad',
    });
    expect(estadoDe(fila({ dueDate: diaUtc(2026, 9, 19) }), HOY).etiqueta).toBe('Vencida · 1 día');
    expect(estadoDe(fila({ paidAmount: 400, dueDate: diaUtc(2026, 10, 1) }), HOY).clave).toBe(
      'parcial',
    );
    expect(estadoDe(fila({ paidAmount: 1000, status: 'PAID' }), HOY).clave).toBe('pagada');
    expect(estadoDe(fila({ isCancelled: true }), HOY).clave).toBe('cancelada');
    expect(estadoDe(fila({ status: 'DRAFT' }), HOY).clave).toBe('borrador');
    expect(estadoDe(fila({ dueDate: null }), HOY).clave).toBe('pendiente');
  });

  it('cancelada gana sobre cualquier otra lectura', () => {
    // Una cancelada con fecha pasada no debe pintarse en rojo de "vencida".
    const f = fila({ isCancelled: true, dueDate: diaUtc(2025, 1, 1), paidAmount: 100 });
    expect(estadoDe(f, HOY)).toMatchObject({ clave: 'cancelada', tono: 'mute' });
  });
});

// ── Forma de la respuesta ──────────────────────────────────────────────────

/** Prisma recibe dos consultas: la ligera (select) para totales y la completa. */
function construirConDatos(filas: any[]) {
  const invoice = {
    findMany: jest.fn().mockImplementation((args: any) => {
      if (args.select) {
        return Promise.resolve(
          filas.map((f) => ({
            totalAmount: f.totalAmount,
            paidAmount: f.paidAmount,
            dueDate: f.dueDate,
            status: f.status,
            isCancelled: f.isCancelled,
          })),
        );
      }
      return Promise.resolve(filas);
    }),
    findFirst: jest.fn().mockResolvedValue(null),
  };
  return { service: new WorkspaceArApService({ invoice } as any), invoice };
}

const facturaCxc = (over: any = {}) => ({
  id: 1,
  invoiceNumber: 'A-1',
  type: 'ACCOUNTS_RECEIVABLE',
  status: 'SENT',
  issueDate: diaUtc(2026, 9, 1),
  dueDate: diaUtc(2026, 9, 10),
  totalAmount: 1000,
  paidAmount: 0,
  currency: 'MXN',
  cfdiUuid: null,
  cfdiXml: null,
  pdfUrl: null,
  isCancelled: false,
  notes: null,
  client: { id: 4, name: 'ACME', taxId: 'AAA010101AAA' },
  supplier: null,
  salesProjectOrder: { id: 2, orderId: 'OP-2', project: { id: 8, name: 'Torre Norte' } },
  ...over,
});

describe('lista de cartera', () => {
  it('traduce la factura a la fila que lee la contadora', async () => {
    const { service } = construirConDatos([facturaCxc()]);
    const res = await service.listar('cxc', 7, {});
    const fila0 = res.rows[0];
    expect(fila0).toMatchObject({
      folio: 'A-1',
      emision: '2026-09-01',
      vencimiento: '2026-09-10',
      monto: 1000,
      pendiente: 1000,
      estado: 'vencida',
      aging: 'vencido',
    });
    expect(fila0.contraparte).toMatchObject({ tipo: 'cliente', id: 4, nombre: 'ACME' });
    expect(fila0.proyecto).toMatchObject({ id: 8, nombre: 'Torre Norte', origen: 'proyecto' });
    expect(typeof fila0.diasVencido).toBe('number');
  });

  it('cae al nombre del CFDI cuando no hay cliente dado de alta', async () => {
    const { service } = construirConDatos([
      facturaCxc({ client: null, receptorName: 'Cliente mostrador', receptorRfc: 'XAXX010101000' }),
    ]);
    const res = await service.listar('cxc', 7, {});
    expect(res.rows[0].contraparte).toMatchObject({
      id: null,
      nombre: 'Cliente mostrador',
      rfc: 'XAXX010101000',
    });
  });

  it('los totales y los tramos describen todo el filtro, no la página', async () => {
    const { service } = construirConDatos([
      facturaCxc({ id: 1, totalAmount: 1000, paidAmount: 250, dueDate: diaUtc(2026, 1, 1) }),
      facturaCxc({ id: 2, totalAmount: 500, paidAmount: 0, dueDate: diaUtc(2030, 1, 1) }),
    ]);
    const res = await service.listar('cxc', 7, { limit: 1 });
    expect(res.rows).toHaveLength(1); // solo una cabe en la página
    expect(res.totales.documentos).toBe(2);
    expect(res.totales.pendiente).toBe(1250);
    expect(res.aging.vencido.monto).toBe(750);
    expect(res.aging.mas30.monto).toBe(500);
  });

  it('ofrece contrapartes y proyectos como opciones de filtro', async () => {
    const { service } = construirConDatos([facturaCxc()]);
    const res = await service.listar('cxc', 7, {});
    expect(res.filtros.contrapartes).toEqual([{ id: 4, nombre: 'ACME' }]);
    expect(res.filtros.proyectos).toEqual([{ id: 8, nombre: 'Torre Norte' }]);
  });
});

describe('calendario de obligaciones', () => {
  const proveedor = (nombre: string) => ({ id: null, name: nombre, rfc: null });
  const cuenta = (over: any) => ({
    ...facturaCxc({
      type: 'ACCOUNTS_PAYABLE',
      client: null,
      salesProjectOrder: null,
      ...over,
    }),
  });

  function calendarioCon(filas: any[]) {
    const invoice = {
      findMany: jest.fn().mockResolvedValue(filas),
      findFirst: jest.fn(),
    };
    return new WorkspaceArApService({ invoice } as any).calendario('cxp', 7, { dias: 30 });
  }

  it('aparta lo vencido y agrupa lo próximo por día y por semana', async () => {
    const hoyIdx = Math.floor(Date.now() / 86_400_000);
    const enDias = (n: number) => new Date((hoyIdx + n) * 86_400_000);

    const res = await calendarioCon([
      cuenta({ id: 1, totalAmount: 900, dueDate: enDias(-5), supplier: proveedor('Cables SA') }),
      cuenta({ id: 2, totalAmount: 400, dueDate: enDias(0), supplier: proveedor('Cables SA') }),
      cuenta({ id: 3, totalAmount: 600, dueDate: enDias(3), supplier: proveedor('Tornillos MX') }),
      cuenta({ id: 4, totalAmount: 700, dueDate: enDias(12), supplier: proveedor('Cables SA') }),
      cuenta({ id: 5, totalAmount: 150, dueDate: enDias(200), supplier: proveedor('Lejano SA') }),
    ]);

    expect(res.vencido.monto).toBe(900);
    expect(res.vencido.contrapartes[0]).toMatchObject({ nombre: 'Cables SA', monto: 900 });
    expect(res.resumen.hoy).toBe(400);
    expect(res.resumen.proximos7).toBe(1000); // hoy + día 3
    expect(res.resumen.proximos30).toBe(1700);
    expect(res.resumen.fueraDeVentana).toBe(150);

    const semana0 = res.semanas.find((s) => s.semana === 0);
    expect(semana0).toMatchObject({ etiqueta: 'Esta semana', monto: 1000, documentos: 2 });
    const semana1 = res.semanas.find((s) => s.semana === 1);
    expect(semana1).toMatchObject({ etiqueta: 'Próxima semana', monto: 700 });

    // Un día por vencimiento, ordenados de hoy hacia adelante.
    expect(res.dias.map((d) => d.enDias)).toEqual([0, 3, 12]);
  });

  it('lo ya pagado y lo que no tiene fecha no ensucian el calendario', async () => {
    const hoyIdx = Math.floor(Date.now() / 86_400_000);
    const res = await calendarioCon([
      cuenta({ id: 1, totalAmount: 500, paidAmount: 500, dueDate: new Date(hoyIdx * 86_400_000) }),
      cuenta({ id: 2, totalAmount: 300, dueDate: null, supplier: proveedor('Sin plazo SA') }),
    ]);
    expect(res.dias).toHaveLength(0);
    expect(res.resumen.sinFecha).toBe(300);
    expect(res.resumen.enVentana).toBe(0);
  });
});

// ── (c) Contrato de autorización ───────────────────────────────────────────

describe('autorización de la cartera', () => {
  // Mismo contrato que el dashboard del workspace: contabilidad, facturación
  // o consola. Un rol de campo no entra.
  const permitidos = new Set<string>([
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.INVOICING_VIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ]);
  const puedeVer = (perms: string[]) => perms.some((p) => permitidos.has(p));

  it('la contadora entra', () => {
    expect(puedeVer([PERMISSIONS.CONTABILIDAD_VIEW])).toBe(true);
  });

  it('facturación y consola también', () => {
    expect(puedeVer([PERMISSIONS.INVOICING_VIEW])).toBe(true);
    expect(puedeVer([PERMISSIONS.CONSOLE_ADMIN])).toBe(true);
  });

  it('un ingeniero de campo no ve la cartera', () => {
    expect(puedeVer(['ops.view', 'activities.view'])).toBe(false);
    expect(puedeVer([])).toBe(false);
  });

  it('los endpoints declaran los permisos y las guardas esperadas', () => {
    const proto = WorkspaceArApController.prototype as any;
    const metodos = ['listarCxc', 'detalleCxc', 'xmlCxc', 'listarCxp', 'calendarioCxp', 'detalleCxp', 'xmlCxp'];

    for (const metodo of metodos) {
      expect(typeof proto[metodo]).toBe('function');
      const rbac = Reflect.getMetadata('rbac', proto[metodo]);
      expect(rbac).toBeDefined();
      expect(rbac.anyPermissions).toEqual([
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.INVOICING_VIEW,
        PERMISSIONS.CONSOLE_ADMIN,
      ]);
      // Sin RbacGuard el decorador @RBAC sería decorativo.
      const guards = Reflect.getMetadata('__guards__', proto[metodo]) ?? [];
      expect(guards.map((g: any) => g.name)).toContain('RbacGuard');
    }

    const guardasControlador = Reflect.getMetadata('__guards__', WorkspaceArApController) ?? [];
    expect(guardasControlador.map((g: any) => g.name)).toContain('UrlAccessGuard');
  });
});
