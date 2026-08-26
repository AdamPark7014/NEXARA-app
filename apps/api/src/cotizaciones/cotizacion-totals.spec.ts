import {
  calculateLine,
  calculateTotals,
  maxDiscountPercent,
  normalizeItems,
  type NormalizedCotizacionItem,
} from './cotizacion-totals.js';

const item = (overrides: Partial<NormalizedCotizacionItem> = {}): NormalizedCotizacionItem => ({
  productId: null,
  category: 'Otros',
  name: 'Concepto',
  description: null,
  scope: null,
  brand: null,
  model: null,
  sku: null,
  partNumber: null,
  batchReference: null,
  unit: 'pieza',
  qty: 1,
  unitPrice: 0,
  discount: 0,
  tax: 0,
  ieps: 0,
  retention: 0,
  laborHours: 0,
  laborRate: 0,
  warrantyMonths: 0,
  deliveryTime: null,
  countryOrigin: null,
  notes: null,
  unitCost: null,
  supplierId: null,
  supplierSku: null,
  productCtId: null,
  supplierCode: null,
  supplierWarehouseCode: null,
  marginPercent: null,
  stockSnapshot: null,
  leadTimeDays: null,
  scoreReason: null,
  optimizationMode: null,
  ...overrides,
});

describe('normalizeItems', () => {
  it('rechaza una cotización sin conceptos', () => {
    expect(() => normalizeItems([])).toThrow();
    expect(() => normalizeItems(undefined)).toThrow();
    expect(() => normalizeItems(null)).toThrow();
  });

  it('acota los porcentajes a [0, 100]', () => {
    // Un payload manipulado no debe poder generar importes negativos ni
    // descuentos superiores al total.
    const [row] = normalizeItems([
      { discount: 250, tax: -30, ieps: 1000, retention: -5, unitPrice: 100 },
    ]);
    expect(row.discount).toBe(100);
    expect(row.tax).toBe(0);
    expect(row.ieps).toBe(100);
    expect(row.retention).toBe(0);
  });

  it('fuerza una cantidad mínima de 1', () => {
    expect(normalizeItems([{ qty: 0 }])[0].qty).toBe(1);
    expect(normalizeItems([{ qty: -8 }])[0].qty).toBe(1);
    expect(normalizeItems([{ qty: 'no es número' }])[0].qty).toBe(1);
  });

  it('convierte importes no numéricos en 0 en lugar de NaN', () => {
    const [row] = normalizeItems([{ unitPrice: 'abc' }]);
    expect(row.unitPrice).toBe(0);
    expect(Number.isNaN(row.unitPrice)).toBe(false);
  });

  it('aplica los valores por defecto de texto', () => {
    const [row] = normalizeItems([{ name: '   ', category: '', unit: undefined }]);
    expect(row.name).toBe('Concepto');
    expect(row.category).toBe('Otros');
    expect(row.unit).toBe('pieza');
  });

  it('no permite mano de obra negativa', () => {
    const [row] = normalizeItems([{ laborHours: -4, laborRate: -100 }]);
    expect(row.laborHours).toBe(0);
    expect(row.laborRate).toBe(0);
  });
});

describe('calculateTotals', () => {
  it('suma una línea simple sin impuestos', () => {
    const totals = calculateTotals([item({ qty: 3, unitPrice: 100 })]);
    expect(totals.subtotal).toBe(300);
    expect(totals.total).toBe(300);
  });

  it('aplica el descuento antes de los impuestos', () => {
    // 1000 - 10% = 900 de base; IVA 16% sobre 900 = 144
    const totals = calculateTotals([item({ qty: 1, unitPrice: 1000, discount: 10, tax: 16 })]);
    expect(totals.subtotal).toBe(1000);
    expect(totals.discountTotal).toBe(100);
    expect(totals.taxTotal).toBe(144);
    expect(totals.total).toBe(1044);
  });

  it('resta la retención del total', () => {
    // Base 1000; IVA 16% = 160; retención 10% = 100 → 1060
    const totals = calculateTotals([item({ qty: 1, unitPrice: 1000, tax: 16, retention: 10 })]);
    expect(totals.taxTotal).toBe(160);
    expect(totals.retentionTotal).toBe(100);
    expect(totals.total).toBe(1060);
  });

  it('acumula IEPS sobre la base descontada', () => {
    // Base 800; IEPS 8% = 64
    const totals = calculateTotals([item({ qty: 2, unitPrice: 500, discount: 20, ieps: 8 })]);
    expect(totals.subtotal).toBe(1000);
    expect(totals.iepsTotal).toBe(64);
    expect(totals.total).toBe(864);
  });

  it('suma varias líneas con impuestos distintos', () => {
    const totals = calculateTotals([
      item({ qty: 1, unitPrice: 1000, tax: 16 }),
      item({ qty: 2, unitPrice: 250, tax: 0 }),
    ]);
    expect(totals.subtotal).toBe(1500);
    expect(totals.taxTotal).toBe(160);
    expect(totals.total).toBe(1660);
  });

  it('con 100% de descuento el total es 0, nunca negativo', () => {
    const totals = calculateTotals([item({ qty: 5, unitPrice: 200, discount: 100, tax: 16 })]);
    expect(totals.total).toBe(0);
  });

  it('devuelve ceros sin conceptos', () => {
    expect(calculateTotals([])).toEqual({
      subtotal: 0,
      laborTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      iepsTotal: 0,
      retentionTotal: 0,
      total: 0,
    });
  });

  it('factura la mano de obra junto al producto', () => {
    // Decisión de negocio confirmada: la mano de obra SE COBRA. Antes se
    // imprimía en el PDF como línea informativa pero no entraba en ningún
    // total, de modo que el cliente veía el desglose y no se le cobraba.
    const totals = calculateTotals([
      item({ qty: 1, unitPrice: 1000, laborHours: 10, laborRate: 500 }),
    ]);
    expect(totals.laborTotal).toBe(5000);
    expect(totals.subtotal).toBe(6000);
    expect(totals.total).toBe(6000);
  });

  it('el descuento y el IVA alcanzan también a la mano de obra', () => {
    // Base 1000 producto + 1000 MO = 2000; -10% = 1800; IVA 16% = 288.
    const totals = calculateTotals([
      item({ qty: 1, unitPrice: 1000, laborHours: 4, laborRate: 250, discount: 10, tax: 16 }),
    ]);
    expect(totals.subtotal).toBe(2000);
    expect(totals.laborTotal).toBe(1000);
    expect(totals.discountTotal).toBe(200);
    expect(totals.taxTotal).toBe(288);
    expect(totals.total).toBe(2088);
  });

  it('cobra una línea que es solo mano de obra', () => {
    // Servicio puro: sin producto, pero con horas facturables.
    const totals = calculateTotals([
      item({ qty: 1, unitPrice: 0, laborHours: 8, laborRate: 400, tax: 16 }),
    ]);
    expect(totals.subtotal).toBe(3200);
    expect(totals.total).toBe(3712);
  });

  it('acumula la mano de obra de varias líneas', () => {
    const totals = calculateTotals([
      item({ qty: 1, unitPrice: 100, laborHours: 2, laborRate: 300 }),
      item({ qty: 1, unitPrice: 100, laborHours: 3, laborRate: 200 }),
    ]);
    expect(totals.laborTotal).toBe(1200);
    expect(totals.subtotal).toBe(1400);
  });
});

describe('calculateLine', () => {
  it('separa producto y mano de obra en el desglose', () => {
    const line = calculateLine(item({ qty: 2, unitPrice: 500, laborHours: 3, laborRate: 200 }));
    expect(line.productAmount).toBe(1000);
    expect(line.laborAmount).toBe(600);
    expect(line.subtotal).toBe(1600);
  });

  it('es la misma fuente que usan los totales', () => {
    // El lineTotal guardado por linea y los totales de la cotizacion salen de
    // aqui: antes el calculo estaba duplicado y podian descuadrar.
    const row = item({ qty: 2, unitPrice: 500, laborHours: 3, laborRate: 200, discount: 5, tax: 16 });
    expect(calculateLine(row).total).toBeCloseTo(calculateTotals([row]).total, 10);
  });
});

describe('maxDiscountPercent', () => {
  it('devuelve el descuento mayor entre las líneas', () => {
    expect(maxDiscountPercent([{ discount: 5 }, { discount: 22 }, { discount: 10 }])).toBe(22);
  });

  it('devuelve 0 sin conceptos', () => {
    expect(maxDiscountPercent([])).toBe(0);
  });

  it('trata valores no numéricos como 0', () => {
    expect(maxDiscountPercent([{ discount: NaN }, { discount: 3 }])).toBe(3);
  });
});
