import {
  CUENTAS,
  PolizaDescuadradaError,
  cuadra,
  polizaComprobacionViatico,
  polizaFacturaEmitida,
  polizaGastoPagado,
  polizaPagoFactura,
  polizaViaticoEntregado,
  repartirDeducible,
  sumaDebe,
} from './polizas-mesa.js';

const porCodigo = (r: ReturnType<typeof polizaFacturaEmitida>, codigo: string) =>
  r.find((x) => x.codigo === codigo);

describe('polizaFacturaEmitida', () => {
  it('PUE: clientes contra ingresos e IVA cobrado', () => {
    const r = polizaFacturaEmitida({ total: 18560, subtotal: 16000, taxAmount: 2560, metodoPago: 'PUE' });
    expect(cuadra(r)).toBe(true);
    expect(porCodigo(r, CUENTAS.clientes)?.debe).toBe(18560);
    expect(porCodigo(r, CUENTAS.ingresosServicios)?.haber).toBe(16000);
    expect(porCodigo(r, CUENTAS.ivaCobrado)?.haber).toBe(2560);
  });

  it('PPD: el IVA queda como no cobrado', () => {
    const r = polizaFacturaEmitida({ total: 18560, subtotal: 16000, taxAmount: 2560, metodoPago: 'PPD' });
    expect(porCodigo(r, CUENTAS.ivaNoCobrado)?.haber).toBe(2560);
    expect(porCodigo(r, CUENTAS.ivaCobrado)).toBeUndefined();
  });

  it('con descuento toma la base, no el subtotal bruto (antes no cuadraba)', () => {
    // 2 × 1,000 con 200 de descuento → base 1,800 + IVA 288 = 2,088
    const r = polizaFacturaEmitida({
      total: 2088,
      subtotal: 2000,
      taxAmount: 288,
      metodoPago: 'PUE',
      conceptos: [{ taxBase: 1800, ivaAmount: 288 }],
    });
    expect(cuadra(r)).toBe(true);
    expect(porCodigo(r, CUENTAS.ingresosServicios)?.haber).toBe(1800);
  });

  it('con retenciones las registra a favor y cuadra', () => {
    // base 10,000 + IVA 1,600 − ISR 1,000 − IVA ret 1,066.67 = 9,533.33
    const r = polizaFacturaEmitida({
      total: 9533.33,
      subtotal: 10000,
      taxAmount: 1600,
      metodoPago: 'PUE',
      conceptos: [{ taxBase: 10000, ivaAmount: 1600, isrRetAmount: 1000, ivaRetAmount: 1066.67 }],
    });
    expect(cuadra(r)).toBe(true);
    expect(porCodigo(r, CUENTAS.retencionesAFavor)?.debe).toBe(2066.67);
  });

  it('con IVA 0 omite el renglón en vez de rechazar la póliza', () => {
    const r = polizaFacturaEmitida({ total: 5000, subtotal: 5000, taxAmount: 0, metodoPago: 'PUE' });
    expect(r).toHaveLength(2);
    expect(cuadra(r)).toBe(true);
  });

  it('absorbe un centavo de redondeo en el ingreso', () => {
    const r = polizaFacturaEmitida({
      total: 116.01,
      subtotal: 100,
      taxAmount: 16,
      metodoPago: 'PUE',
      conceptos: [{ taxBase: 100, ivaAmount: 16 }],
    });
    expect(porCodigo(r, CUENTAS.ingresosServicios)?.haber).toBe(100.01);
  });

  it('un anticipo va a anticipo de clientes, no a ingresos', () => {
    const r = polizaFacturaEmitida({ total: 34800, subtotal: 30000, taxAmount: 4800, metodoPago: 'PUE', esAnticipo: true });
    expect(porCodigo(r, CUENTAS.anticipoClientes)?.haber).toBe(30000);
    expect(porCodigo(r, CUENTAS.ingresosServicios)).toBeUndefined();
  });

  it('si la diferencia es más que redondeo, no la maquilla', () => {
    expect(() =>
      polizaFacturaEmitida({
        total: 200,
        subtotal: 100,
        taxAmount: 16,
        metodoPago: 'PUE',
        conceptos: [{ taxBase: 100, ivaAmount: 16 }],
      }),
    ).toThrow(PolizaDescuadradaError);
  });
});

describe('polizaPagoFactura', () => {
  it('cobro de factura PPD pasa el IVA cobrado en proporción', () => {
    const r = polizaPagoFactura({ tipo: 'ACCOUNTS_RECEIVABLE', importe: 9280, facturaTotal: 18560, facturaIva: 2560, metodoPago: 'PPD' });
    expect(cuadra(r)).toBe(true);
    expect(r.find((x) => x.codigo === CUENTAS.ivaNoCobrado)?.debe).toBe(1280);
    expect(r.find((x) => x.codigo === CUENTAS.ivaCobrado)?.haber).toBe(1280);
  });

  it('cobro de factura PUE no reclasifica IVA', () => {
    const r = polizaPagoFactura({ tipo: 'ACCOUNTS_RECEIVABLE', importe: 18560, facturaTotal: 18560, facturaIva: 2560, metodoPago: 'PUE' });
    expect(r).toHaveLength(2);
  });

  it('pago a proveedor: proveedores contra bancos', () => {
    const r = polizaPagoFactura({ tipo: 'ACCOUNTS_PAYABLE', importe: 3480, facturaTotal: 3480, facturaIva: 480, metodoPago: 'PUE' });
    expect(r.map((x) => x.codigo)).toEqual([CUENTAS.proveedores, CUENTAS.bancos]);
  });
});

describe('viáticos', () => {
  it('al entregarse queda por comprobar, no como gasto', () => {
    const r = polizaViaticoEntregado(2500);
    expect(r.map((x) => [x.codigo, x.debe, x.haber])).toEqual([
      [CUENTAS.deudores, 2500, 0],
      [CUENTAS.bancos, 0, 2500],
    ]);
  });

  it('la comprobación separa deducible, IVA y lo que solo trae ticket (caso del mockup)', () => {
    const r = polizaComprobacionViatico({
      entregado: 2500,
      comprobado: 2500,
      cfdis: [
        { total: 1450, iva: 200 },
        { total: 700, iva: 96.55 },
      ],
    });
    expect(cuadra(r)).toBe(true);
    const de = (c: string) => r.find((x) => x.codigo === c);
    expect(de(CUENTAS.viaticos)?.debe).toBe(1853.45);
    expect(de(CUENTAS.ivaAcreditablePagado)?.debe).toBe(296.55);
    expect(de(CUENTAS.noDeducibles)?.debe).toBe(350);
    expect(de(CUENTAS.deudores)?.haber).toBe(2500);
  });

  it('si comprobó de más, el excedente se le debe a la persona', () => {
    const r = polizaComprobacionViatico({ entregado: 1000, comprobado: 1200, cfdis: [{ total: 1200, iva: 165.52 }] });
    expect(cuadra(r)).toBe(true);
    expect(r.find((x) => x.codigo === CUENTAS.acreedores)?.haber).toBe(200);
  });

  it('si comprobó de menos, lo que falta sigue por comprobar', () => {
    const r = polizaComprobacionViatico({ entregado: 1800, comprobado: 1500, cfdis: [] });
    expect(r.find((x) => x.codigo === CUENTAS.deudores)?.haber).toBe(1500);
    expect(sumaDebe(r)).toBe(1500);
  });
});

describe('gastos', () => {
  it('gasto con CFDI separa el IVA acreditable', () => {
    const r = polizaGastoPagado({ importe: 1200, cuentaGasto: '601.10', cfdis: [{ total: 1200, iva: 165.52 }] });
    expect(cuadra(r)).toBe(true);
    expect(r.find((x) => x.codigo === '601.10')?.debe).toBe(1034.48);
  });

  it('repartirDeducible no deja que los CFDI cubran más de lo gastado', () => {
    expect(repartirDeducible(1000, [{ total: 2000, iva: 275.86 }])).toEqual({ base: 862.07, iva: 137.93, noDeducible: 0 });
    expect(repartirDeducible(1000, [])).toEqual({ base: 0, iva: 0, noDeducible: 1000 });
  });
});
