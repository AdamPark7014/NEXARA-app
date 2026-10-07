import {
  calculateLine,
  calculateTotals,
  factorMargen,
  maxDiscountPercent,
  normalizeItems,
  porcentajeMargen,
  totalConMargen,
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

  it('con costo y margen propio, el precio sale de ahí: costo × (1 + margen/100)', () => {
    const [fila] = normalizeItems([
      { name: 'Switch', qty: 2, unitCost: 100, unitPrice: 999, marginPercent: 50 },
    ]);
    expect(fila.unitPrice).toBe(150);
    expect(fila.unitCost).toBe(100);
    expect(fila.marginPercent).toBe(50);
  });

  it('con margen 0 en la partida, el precio queda igual al costo (0 sí cuenta, no es "sin margen")', () => {
    const [fila] = normalizeItems([
      { name: 'Switch', qty: 2, unitCost: 100, unitPrice: 999, marginPercent: 0 },
    ]);
    expect(fila.unitPrice).toBe(100);
  });

  it('sin margen propio (o sin costo), el precio capturado se respeta tal cual', () => {
    const sinMargen = normalizeItems([
      { name: 'Switch', qty: 2, unitCost: 100, unitPrice: 100 },
    ])[0];
    expect(sinMargen.unitPrice).toBe(100);

    const sinCosto = normalizeItems([
      { name: 'Switch', qty: 2, unitPrice: 100, marginPercent: 50 },
    ])[0];
    expect(sinCosto.unitPrice).toBe(100);
  });

  it('el margen de la partida es aparte del margen de la cotización: ese sigue yendo sobre el total', () => {
    const [fila] = normalizeItems([
      { name: 'Switch', qty: 2, unitCost: 100, unitPrice: 999, marginPercent: 50 },
    ]);
    // El precio de la partida (150) no cambia por el margen general de la cotización:
    // ese se aplica aparte, sobre el total ya con IVA (ver calculateTotals).
    expect(fila.unitPrice).toBe(150);
  });

  it('20 se queda en 20: ni el Decimal ni la coma decimal lo vuelven 204', () => {
    expect(porcentajeMargen(20)).toBe(20);
    expect(porcentajeMargen('20')).toBe(20);
    expect(porcentajeMargen('20.00')).toBe(20);
    expect(porcentajeMargen('20%')).toBe(20);
    expect(porcentajeMargen('20,4')).toBe(20.4);
    expect(porcentajeMargen('20.')).toBe(20);
    // decimal.js: 20.4 = { e: 1, d: [2040000] }. Leer el coeficiente a pelo da 204.
    expect(porcentajeMargen({ s: 1, e: 1, d: [2040000] })).toBe(20.4);
    expect(porcentajeMargen({ s: 1, e: 1, d: [20] })).toBe(20);
    expect(porcentajeMargen(0.2)).toBe(0.2);
    expect(factorMargen(20)).toBe(1.2);
    expect(factorMargen(null)).toBe(1);
  });

  it('el total final es el subtotal con IVA por 1.20 cuando el margen es 20', () => {
    expect(totalConMargen(116, 20)).toBe(139.2);
    const totals = calculateTotals([item({ qty: 1, unitPrice: 100, tax: 16 })], 20);
    expect(totals.subtotal).toBe(100);
    expect(totals.taxTotal).toBe(16);
    expect(totals.total).toBe(139.2);
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

describe('normalizeItems', () => {
  it('no recorta el título ni la descripción, y conserva saltos de línea', () => {
    const name = `Disco duro ${'con características '.repeat(30)}`.trim();
    const description = '• Subcategoría: unidad de estado sólido\n• Dimensiones: 2.5 pulgadas\n• Interfaz: SAS';
    const [row] = normalizeItems([{ name, description, qty: 1, unitPrice: 10 }]);
    expect(name.length).toBeGreaterThan(200);
    expect(row?.name).toBe(name);
    expect(row?.description).toBe(description);
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

describe('cotización sin factura (sin IVA)', () => {
  const partidas = [
    item({ qty: 2, unitPrice: 1000, tax: 16 }),
    item({ qty: 1, unitPrice: 0, laborHours: 4, laborRate: 250, tax: 16, retention: 4 }),
  ];

  it('con IVA, como siempre', () => {
    expect(calculateTotals(partidas)).toMatchObject({ subtotal: 3000, taxTotal: 480, retentionTotal: 40, total: 3440 });
  });

  it('sin factura no suma IVA ni retenciones, y el margen va sobre ese total', () => {
    expect(calculateTotals(partidas, null, { conIva: false })).toMatchObject({
      subtotal: 3000,
      taxTotal: 0,
      retentionTotal: 0,
      total: 3000,
    });
    expect(calculateTotals(partidas, 20, { conIva: false }).total).toBe(3600);
    expect(calculateLine(partidas[0], { conIva: false }).total).toBe(2000);
  });

  it('la partida conserva su tasa para cuando se vuelva a encender', () => {
    calculateTotals(partidas, null, { conIva: false });
    expect(partidas[0].tax).toBe(16);
  });
});
