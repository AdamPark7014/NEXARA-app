import { PorFacturarService } from './por-facturar.service.js';

/**
 * La bandeja con una base de mentira: lo que importa es el armado (qué entra, qué no se duplica
 * y qué acción toca), no las consultas en sí.
 */

const cliente = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Cliente ${id}`,
  legalName: `CLIENTE ${id}`,
  taxId: 'CMO0903155K2',
  fiscalZipCode: '72810',
  fiscalRegime: '603',
  billingEmail: null,
  ...extra,
});

function crear(datos: {
  actividades?: unknown[];
  cotizaciones?: unknown[];
  pedidos?: unknown[];
  pagos?: unknown[];
  descartes?: unknown[];
}) {
  const prisma = {
    porFacturarDescarte: { findMany: jest.fn().mockResolvedValue(datos.descartes ?? []), upsert: jest.fn() },
    activity: { findMany: jest.fn().mockResolvedValue(datos.actividades ?? []) },
    cotizacion: { findMany: jest.fn().mockResolvedValue(datos.cotizaciones ?? []) },
    salesProjectOrder: { findMany: jest.fn().mockResolvedValue(datos.pedidos ?? []) },
    payment: { findMany: jest.fn().mockResolvedValue(datos.pagos ?? []) },
    invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 }, _count: { _all: 0 } }) },
  };
  const pac = { provider: 'mock', isProduction: true };
  return new PorFacturarService(prisma as never, {} as never, pac as never);
}

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

describe('PorFacturarService.listar', () => {
  it('un servicio con cotización se factura desde el servicio, no dos veces', async () => {
    const cot = { id: 79, quoteNumber: 'COT-NX-0079', folioEnviado: null, status: 'APPROVED', total: 18560, salesClient: cliente(1), facturas: [] };
    const svc = crear({
      actividades: [
        { id: 412, anNumber: 'AN-0412', titulo: 'Mantenimiento CCTV', fechaFinalizacion: hace(6), responsable: null, client: null, cotizacion: cot, invoices: [] },
      ],
      cotizaciones: [
        { ...cot, projectName: 'Mantenimiento', trabajo: null, clientCompany: null, clientName: null, signedAt: hace(10), updatedAt: hace(10), depositPercent: 0, subtotal: 16000, discountTotal: 0, taxTotal: 2560 },
      ],
    });
    const r = await svc.listar(1);
    expect(r.items.map((i) => i.clave)).toEqual(['SERVICIO:412']);
    expect(r.items[0]).toMatchObject({ importe: 18560, accion: 'PREPARAR', pendientes: [] });
  });

  it('con anticipo pactado sale primero el anticipo, y la final después con «menos anticipo»', async () => {
    const base = {
      id: 91, quoteNumber: 'COT-NX-0091', folioEnviado: null, projectName: 'Red bodega norte', trabajo: null, clientCompany: null, clientName: null,
      signedAt: hace(1), updatedAt: hace(1), depositPercent: 50, subtotal: 60000, discountTotal: 0, taxTotal: 9600, total: 69600, salesClient: cliente(2),
    };
    const sinAnticipo = await crear({ cotizaciones: [{ ...base, facturas: [] }] }).listar(1);
    expect(sinAnticipo.items.map((i) => [i.origen, i.importe])).toEqual([['ANTICIPO', 34800]]);

    const anticipo = { id: 118, status: 'SENT', esAnticipo: true, isCancelled: false, deletedAt: null, invoiceNumber: 'F-118', cfdiSerie: 'A', cfdiFolio: '118', cfdiUuid: 'U', totalAmount: 34800, subtotal: 30000 };
    const conAnticipo = await crear({ cotizaciones: [{ ...base, facturas: [anticipo] }] }).listar(1);
    expect(conAnticipo.items[0]).toMatchObject({
      origen: 'COTIZACION',
      importe: 69600,
      menos: { etiqueta: 'menos anticipo', importe: 34800 },
      nota: 'Se relaciona con el anticipo A-118 (07)',
    });
    expect(conAnticipo.resumen.importe).toBe(34800);
  });

  it('a un cliente sin código postal lo manda a completarlo', async () => {
    const r = await crear({
      cotizaciones: [
        {
          id: 5, quoteNumber: 'COT-5', folioEnviado: null, projectName: 'X', trabajo: null, clientCompany: null, clientName: null, signedAt: hace(1), updatedAt: hace(1),
          depositPercent: 0, subtotal: 100, discountTotal: 0, taxTotal: 16, total: 116, salesClient: cliente(3, { fiscalZipCode: null }), facturas: [],
        },
      ],
    }).listar(1);
    expect(r.items[0]).toMatchObject({ accion: 'COMPLETAR_CLIENTE', folioHref: '/erp/clientes/3' });
    expect(r.items[0].pendientes[0].texto).toBe('Falta el código postal fiscal del cliente');
  });

  it('lo descartado no aparece, y en producción con mock el timbrado no está conectado', async () => {
    const r = await crear({
      actividades: [{ id: 7, anNumber: 'AN-0007', titulo: 'Garantía', fechaFinalizacion: hace(2), responsable: null, client: { name: 'C', salesClients: [cliente(4)] }, cotizacion: null, invoices: [] }],
      descartes: [{ origen: 'SERVICIO', origenId: 7 }],
    }).listar(1);
    expect(r.items).toEqual([]);
    expect(r.timbrado.conectado).toBe(false);
  });

  it('un servicio sin cotización se prepara con el precio pendiente', async () => {
    const r = await crear({
      actividades: [{ id: 398, anNumber: 'AN-0398', titulo: 'Reubicación', fechaFinalizacion: hace(8), responsable: { nombre: 'Carolina M.' }, client: { name: 'C', salesClients: [cliente(5)] }, cotizacion: null, invoices: [] }],
    }).listar(1);
    expect(r.items[0]).toMatchObject({ importe: null, accion: 'PREPARAR', semaforo: 'tarde' });
    expect(r.items[0].pendientes.map((p) => p.clave)).toEqual(['precio']);
    expect(r.items[0].detalle).toContain('Carolina M.');
  });
});
