import {
  creditStatus,
  dueDateFromTerms,
  isBreakUsable,
  pickPriceBreak,
  purchaseWarnings,
  resolveUnitPrice,
  type PriceBreak,
} from './wholesale-pricing.js';

const HOY = new Date('2026-08-16T12:00:00Z');

const ESCALONES: PriceBreak[] = [
  { id: 1, cantidadMinima: 10, unitPrice: 95 },
  { id: 2, cantidadMinima: 50, unitPrice: 88 },
  { id: 3, cantidadMinima: 200, unitPrice: 79 },
];

describe('escalón aplicable', () => {
  it('elige el escalón más alto que la cantidad alcanza', () => {
    expect(pickPriceBreak(ESCALONES, 120, HOY)?.id).toBe(2);
  });

  it('la cantidad exacta del escalón ya lo activa', () => {
    // "a partir de 50 piezas" incluye la pieza 50.
    expect(pickPriceBreak(ESCALONES, 50, HOY)?.id).toBe(2);
  });

  it('por debajo del primer escalón no aplica ninguno', () => {
    expect(pickPriceBreak(ESCALONES, 3, HOY)).toBeNull();
  });

  it('cantidad cero o negativa nunca resuelve escalón', () => {
    expect(pickPriceBreak(ESCALONES, 0, HOY)).toBeNull();
    expect(pickPriceBreak(ESCALONES, -5, HOY)).toBeNull();
  });

  it('ignora escalones desactivados', () => {
    const conBaja = [...ESCALONES, { id: 9, cantidadMinima: 100, unitPrice: 60, activo: false }];
    expect(pickPriceBreak(conBaja, 150, HOY)?.id).toBe(2);
  });

  it('con empate en cantidad mínima gana el más barato', () => {
    // Cobrarle al cliente el caro por un duplicado del mayorista seria error
    // nuestro, no suyo.
    const empate: PriceBreak[] = [
      { id: 1, cantidadMinima: 50, unitPrice: 90 },
      { id: 2, cantidadMinima: 50, unitPrice: 84 },
    ];
    expect(pickPriceBreak(empate, 60, HOY)?.id).toBe(2);
  });
});

describe('vigencia del escalón', () => {
  it('no aplica antes de empezar', () => {
    const pb: PriceBreak = { cantidadMinima: 1, unitPrice: 10, vigenteDesde: new Date('2026-09-01') };
    expect(isBreakUsable(pb, HOY)).toBe(false);
  });

  it('el último día de vigencia todavía sirve', () => {
    // `vigenteHasta` es inclusivo: un convenio que vence el 16 vale el 16.
    const pb: PriceBreak = { cantidadMinima: 1, unitPrice: 10, vigenteHasta: new Date('2026-08-16') };
    expect(isBreakUsable(pb, HOY)).toBe(true);
  });

  it('el día siguiente ya no', () => {
    const pb: PriceBreak = { cantidadMinima: 1, unitPrice: 10, vigenteHasta: new Date('2026-08-15') };
    expect(isBreakUsable(pb, HOY)).toBe(false);
  });

  it('sin fechas está siempre vigente', () => {
    expect(isBreakUsable({ cantidadMinima: 1, unitPrice: 10 }, HOY)).toBe(true);
  });

  it('no caduca antes de tiempo en una zona detrás de UTC', () => {
    // Prisma devuelve `@db.Date` como medianoche UTC. Comparando instantes, un
    // convenio vigente hasta el 16 moría la tarde del 15 en México (UTC-6): la
    // compra se cotizaba a precio de lista sin que nadie entendiera por qué.
    const pb: PriceBreak = { cantidadMinima: 1, unitPrice: 10, vigenteHasta: new Date('2026-08-16T00:00:00Z') };
    const tardeEnMexico = new Date('2026-08-16T23:00:00Z'); // 17:00 en Monterrey
    expect(isBreakUsable(pb, tardeEnMexico)).toBe(true);
  });
});

describe('precio unitario resuelto', () => {
  it('el escalón manda sobre el precio de lista', () => {
    const r = resolveUnitPrice({ listPrice: 100, quantity: 60, breaks: ESCALONES, at: HOY });
    expect(r.unitPrice).toBe(88);
    expect(r.origen).toBe('ESCALON');
    expect(r.ahorroUnitario).toBe(12);
  });

  it('el escalón NO se suma al descuento de convenio', () => {
    // Encimarlos contaría el descuento dos veces: el escalón ya ES el precio
    // negociado para ese volumen.
    const r = resolveUnitPrice({
      listPrice: 100,
      quantity: 60,
      breaks: ESCALONES,
      terms: { descuentoBase: 20 },
      at: HOY,
    });
    expect(r.unitPrice).toBe(88);
  });

  it('sin escalón aplica el descuento de convenio', () => {
    const r = resolveUnitPrice({ listPrice: 100, quantity: 2, terms: { descuentoBase: 15 }, at: HOY });
    expect(r.unitPrice).toBe(85);
    expect(r.origen).toBe('DESCUENTO_BASE');
  });

  it('sin escalón ni convenio queda el precio de lista', () => {
    const r = resolveUnitPrice({ listPrice: 100, quantity: 2, at: HOY });
    expect(r.unitPrice).toBe(100);
    expect(r.origen).toBe('LISTA');
    expect(r.ahorroUnitario).toBe(0);
  });

  it('un descuento absurdo no se aplica', () => {
    // 100 % dejaría el precio en cero y una orden de compra gratis.
    const r = resolveUnitPrice({ listPrice: 100, quantity: 2, terms: { descuentoBase: 100 }, at: HOY });
    expect(r.unitPrice).toBe(100);
    expect(r.origen).toBe('LISTA');
  });

  it('redondea a centavos', () => {
    const r = resolveUnitPrice({ listPrice: 33.333, quantity: 1, terms: { descuentoBase: 7 }, at: HOY });
    expect(r.unitPrice).toBe(31);
  });
});

describe('crédito con el mayorista', () => {
  it('sin límite pactado no hay nada que vigilar', () => {
    const c = creditStatus({ creditoDias: 30 }, 50_000, 10_000);
    expect(c.limite).toBeNull();
    expect(c.dentroDelLimite).toBe(true);
  });

  it('descuenta el saldo del límite', () => {
    const c = creditStatus({ limiteCredito: 100_000 }, 40_000, 0);
    expect(c.disponible).toBe(60_000);
    expect(c.dentroDelLimite).toBe(true);
  });

  it('detecta que la compra nueva se pasa del límite', () => {
    const c = creditStatus({ limiteCredito: 100_000 }, 90_000, 25_000);
    expect(c.excedente).toBe(15_000);
    expect(c.dentroDelLimite).toBe(false);
  });

  it('agotar exactamente el límite todavía cabe', () => {
    const c = creditStatus({ limiteCredito: 100_000 }, 90_000, 10_000);
    expect(c.excedente).toBe(0);
    expect(c.dentroDelLimite).toBe(true);
  });

  it('un saldo negativo (anticipo) no inventa crédito extra', () => {
    const c = creditStatus({ limiteCredito: 100_000 }, -5_000, 0);
    expect(c.saldo).toBe(0);
    expect(c.disponible).toBe(100_000);
  });
});

describe('avisos antes de emitir la orden', () => {
  it('avisa cuando no se alcanza el pedido mínimo', () => {
    const terms = { pedidoMinimo: 10_000 };
    const avisos = purchaseWarnings({
      terms,
      importe: 4_500,
      credito: creditStatus(terms, 0, 4_500),
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('mínimo');
  });

  it('avisa del exceso de crédito', () => {
    const terms = { limiteCredito: 50_000 };
    const avisos = purchaseWarnings({
      terms,
      importe: 20_000,
      credito: creditStatus(terms, 45_000, 20_000),
    });
    expect(avisos[0]).toContain('límite de crédito');
  });

  it('una compra en regla no genera avisos', () => {
    const terms = { pedidoMinimo: 1_000, limiteCredito: 50_000 };
    const avisos = purchaseWarnings({
      terms,
      importe: 5_000,
      credito: creditStatus(terms, 1_000, 5_000),
    });
    expect(avisos).toEqual([]);
  });

  it('avisa, no bloquea: devuelve texto, nunca lanza', () => {
    // Una orden fuera de condiciones a veces urge; quien autoriza decide.
    const terms = { pedidoMinimo: 99_999, limiteCredito: 1 };
    expect(() =>
      purchaseWarnings({ terms, importe: 1, credito: creditStatus(terms, 1_000, 1) }),
    ).not.toThrow();
  });
});

describe('vencimiento por días de crédito', () => {
  it('suma los días pactados', () => {
    const due = dueDateFromTerms({ creditoDias: 30 }, new Date('2026-08-16T00:00:00Z'));
    expect(due.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('sin crédito vence el mismo día', () => {
    const due = dueDateFromTerms({ creditoDias: null }, new Date('2026-08-16T00:00:00Z'));
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-16');
  });
});
