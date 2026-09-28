import { armarResumen, claveEntidad, resumenDe, resumirEntidades } from './entity-summary.js';

describe('armarResumen', () => {
  it('cotización: folio, cliente · proyecto y total con su moneda', () => {
    expect(
      armarResumen('COTIZACION', { id: 4, quoteNumber: 'NEX-LJ-0007', clientCompany: 'Cliente SA', projectName: 'CCTV Planta', total: '58000.5', currency: 'USD' }),
    ).toEqual({ titulo: 'Cotización NEX-LJ-0007', detalle: 'Cliente SA · CCTV Planta', monto: 58000.5, moneda: 'USD' });
  });

  it('orden de compra: número, proveedor y total', () => {
    expect(armarResumen('PURCHASE_ORDER', { id: 9, poNumber: 'OC-0012', totalAmount: 48250, supplier: { name: 'CT' } })).toEqual({
      titulo: 'Orden de compra OC-0012',
      detalle: 'CT',
      monto: 48250,
      moneda: 'MXN',
    });
  });

  it('gasto y viático usan el concepto/motivo como título y el monto solicitado', () => {
    expect(armarResumen('EXPENSE', { id: 1, concepto: 'Caseta y gasolina', categoria: 'Transporte', montoSolicitado: 5400 })).toMatchObject({
      titulo: 'Caseta y gasolina',
      monto: 5400,
    });
    expect(armarResumen('VIATICS', { id: 2, motivo: 'Instalación Cancún', montoSolicitado: 3200 })).toMatchObject({
      titulo: 'Instalación Cancún',
      monto: 3200,
    });
  });

  it('cierre de actividad no tiene importe', () => {
    expect(armarResumen('ACTIVITY_CLOSURE', { id: 5, anNumber: 'AN-0031', titulo: 'Rack sala 2' })).toEqual({
      titulo: 'AN-0031 · Rack sala 2',
      detalle: 'Cierre de actividad',
      monto: null,
      moneda: 'MXN',
    });
  });

  it('sin datos cae a un título con el folio y sin inventar importes; tipo desconocido = null', () => {
    expect(armarResumen('EXPENSE', { id: 8, montoSolicitado: null })).toMatchObject({ titulo: 'Gasto #8', monto: null });
    expect(armarResumen('HIRING', { id: 1 })).toBeNull();
  });
});

describe('resumirEntidades', () => {
  function prismaConFilas() {
    const llamadas: Record<string, any> = {};
    const modelo = (nombre: string, filas: any[]) => ({
      findMany: jest.fn(async (args: any) => {
        llamadas[nombre] = args;
        return filas.filter((f) => args.where.id.in.includes(f.id));
      }),
    });
    const prisma = {
      purchaseOrder: modelo('purchaseOrder', [{ id: 9, poNumber: 'OC-0012', totalAmount: 100, supplier: { name: 'CT' } }]),
      expense: modelo('expense', [{ id: 1, concepto: 'Gasolina', montoSolicitado: 700 }]),
      cotizacion: { findMany: jest.fn(async () => { throw new Error('caída'); }) },
    };
    return { prisma, llamadas };
  }

  it('una consulta por tipo, acotada a la empresa, y tolera un tipo que falla', async () => {
    const { prisma, llamadas } = prismaConFilas();
    const mapa = await resumirEntidades(
      prisma,
      [
        { entityType: 'PURCHASE_ORDER', entityId: 9 },
        { entityType: 'PURCHASE_ORDER', entityId: 10 },
        { entityType: 'EXPENSE', entityId: 1 },
        { entityType: 'COTIZACION', entityId: 3 },
        { entityType: 'HIRING', entityId: 1 },
      ],
      7,
    );
    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledTimes(1);
    expect(llamadas.purchaseOrder.where.id.in.sort((a: number, b: number) => a - b)).toEqual([9, 10]);
    expect(llamadas.purchaseOrder.where.companyId).toBe(7);
    expect(mapa.get(claveEntidad('PURCHASE_ORDER', 9))?.titulo).toBe('Orden de compra OC-0012');
    expect(mapa.has(claveEntidad('PURCHASE_ORDER', 10))).toBe(false);
    expect(mapa.get(claveEntidad('EXPENSE', 1))?.monto).toBe(700);
    expect(mapa.has(claveEntidad('COTIZACION', 3))).toBe(false); // falló su consulta: no tumba las demás
  });

  it('resumenDe reconoce los alias QUOTE y VIATICS', async () => {
    const { prisma } = prismaConFilas();
    const mapa = await resumirEntidades(prisma, [{ entityType: 'EXPENSE', entityId: 1 }], 7);
    expect(resumenDe(mapa, 'expense', 1)?.titulo).toBe('Gasolina');
    expect(resumenDe(mapa, 'QUOTE', 99)).toBeNull();
  });
});
