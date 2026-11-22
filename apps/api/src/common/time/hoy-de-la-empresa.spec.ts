import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AccountingService } from '../../accounting/accounting.service';
import { ProcurementService } from '../../procurement/procurement.service';
import { CotizacionGanadaService } from '../../projects/cotizacion-ganada.service';

/**
 * «Hoy» para lo que se guarda con fecha: pólizas, facturas, órdenes de compra, proyectos.
 *
 * El servidor corre en UTC. `new Date().toISOString().slice(0, 10)` da su día, y de las 18:00 de
 * México en adelante ese día ya es mañana: una póliza de las 7 de la tarde quedaba fechada al día
 * siguiente, igual que la factura generada desde una orden o la orden de compra adjudicada.
 */

// 21 de noviembre, 19:30 en México. En el reloj del servidor ya es día 22.
const TARDE = new Date('2026-11-22T01:30:00.000Z');
const ALTO = new Error('alto: hasta aquí llega la prueba');

describe('hoy es el día de la empresa', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(TARDE);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function contabilidad() {
    const svc = Object.create(AccountingService.prototype) as any;
    svc.getAccountByCode = jest.fn().mockResolvedValue({ id: 1 });
    svc.createAndPostAutoJournal = jest.fn().mockResolvedValue({ id: 99 });
    return svc;
  }
  const fechaDePoliza = (svc: any) => svc.createAndPostAutoJournal.mock.calls[0][2];

  it('la póliza de un pago operativo sin fecha se fecha hoy, no mañana', async () => {
    const svc = contabilidad();
    await svc.postOperationalDisbursement({ kind: 'expense', entityId: 5, amount: 100, description: 'Gasto', userId: 1, companyId: 7 });
    expect(fechaDePoliza(svc)).toBe('2026-11-21');
  });

  it('con el instante del pago, la póliza cae en el día de la empresa', async () => {
    const svc = contabilidad();
    await svc.postOperationalDisbursement({ kind: 'viatic', entityId: 5, amount: 100, date: TARDE, description: 'Viático', userId: 1, companyId: 7 });
    expect(fechaDePoliza(svc)).toBe('2026-11-21');
  });

  it('una fecha capturada sin hora se respeta', async () => {
    const svc = contabilidad();
    await svc.postOperationalDisbursement({ kind: 'payroll', entityId: 5, amount: 100, date: '2026-11-15', description: 'Nómina', userId: 1, companyId: 7 });
    expect(fechaDePoliza(svc)).toBe('2026-11-15');
  });

  it('el costo de una salida de almacén de la tarde se fecha el mismo día', async () => {
    const svc = contabilidad();
    await svc.postInventoryIssueCogs({ stockMovementId: 8, amount: 250, date: TARDE, description: 'Salida', userId: 1, companyId: 7 });
    expect(fechaDePoliza(svc)).toBe('2026-11-21');
  });

  it('la factura generada desde una orden se emite hoy y vence a 30 días de hoy', async () => {
    const svc = Object.create(AccountingService.prototype) as any;
    svc.prisma = {
      salesProject: { findFirst: jest.fn().mockResolvedValue({ id: 4, companyId: 7 }) },
      salesProjectOrder: {
        findUnique: jest.fn().mockResolvedValue({
          orderId: 'OV-0001',
          lines: [{ id: 1, name: 'Cámara', qty: 1, unitPrice: 1000, tax: 16, discount: 0, invoiceItem: null }],
          invoices: [],
          project: { name: 'Proyecto Demo', opportunity: { client: { id: 3, name: 'Cliente Demo', fiscalZipCode: '72000' } } },
        }),
      },
    };
    svc.createInvoice = jest.fn().mockRejectedValue(ALTO);

    await expect(svc.createInvoiceFromSalesProject(4, 1, undefined, 7)).rejects.toBe(ALTO);

    expect(svc.createInvoice.mock.calls[0][0]).toMatchObject({ issueDate: '2026-11-21', dueDate: '2026-12-21' });
  });

  it('la orden de compra de una cotización adjudicada lleva la fecha de hoy', async () => {
    const svc = Object.create(ProcurementService.prototype) as any;
    svc.getRfq = jest.fn().mockResolvedValue({
      status: 'OPEN',
      rfqNumber: 'RFQ-0001',
      requisitionId: 2,
      lines: [{ supplierId: 9, unitPrice: 50, quantity: 2, description: 'Cable', productId: null }],
    });
    svc.createPurchaseOrder = jest.fn().mockRejectedValue(ALTO);

    await expect(svc.awardRfq(1, 9, 1, 7)).rejects.toBe(ALTO);

    expect(svc.createPurchaseOrder.mock.calls[0][0].orderDate).toBe('2026-11-21');
  });

  it('el proyecto de una cotización ganada sin fecha de inicio empieza hoy', async () => {
    const crear = jest.fn().mockResolvedValue({ id: 1, title: 'Proyecto Demo' });
    const svc = new CotizacionGanadaService(
      {} as any,
      {} as any,
      { crear } as any,
      { ensureServiceClientForProject: jest.fn().mockResolvedValue(3) } as any,
    );

    await (svc as any).crearProyecto(
      { id: 12, quoteNumber: 'COT-0012', projectName: 'Proyecto Demo', salesClient: { id: 3 }, items: [], subtotal: 0, createdById: 1 },
      1,
      null,
      { id: 1 },
      7,
    );

    expect(crear.mock.calls[0][0]).toMatchObject({ startDate: '2026-11-21', endDate: '2026-11-21' });
  });
});

describe('candado: nadie vuelve a sacar «hoy» del reloj del servidor', () => {
  const RAIZ = join(__dirname, '..', '..');
  // Lo que sí puede usar el día UTC: llaves internas que no ve nadie ni se guardan como fecha de un documento.
  const PERMITIDOS = new Set([
    'ai/claude/claude.service.ts', // llave del tope diario de gasto de IA
    'ai/eval/comun.ts', // nombre de la corrida de evaluación
    'common/maps/static-map-cache.ts', // llave de caché
    'common/time/workday.ts', // solo nombra el patrón en un comentario, para explicar qué reemplaza
    'vehicle-gps/vehicle-gps.controller.ts', // de otro hilo (vehículos); anotado en el relevo
  ]);
  const PATRON = /new Date\(\)\s*\.toISOString\(\)\s*\.(slice\(0,\s*10\)|split\(['"]T['"]\)\[0\]|substring\(0,\s*10\))/;

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts') ? [ruta] : [];
    });
  }

  it('`new Date().toISOString().slice(0, 10)` no aparece fuera de la lista', () => {
    const culpables = archivos(RAIZ)
      .map((ruta) => relative(RAIZ, ruta).replace(/\\/g, '/'))
      .filter((rel) => !PERMITIDOS.has(rel) && PATRON.test(readFileSync(join(RAIZ, rel), 'utf8')));
    expect(culpables).toEqual([]);
  });
});
