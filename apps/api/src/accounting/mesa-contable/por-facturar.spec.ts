import {
  conceptosDesdeCotizacion,
  diaMexico,
  diasHabiles,
  diasNaturales,
  importeAnticipo,
  ordenarPorFacturar,
  pendientesReceptor,
  semaforoFacturacion,
  venceComplemento,
  type PorFacturarItem,
} from './por-facturar.js';

describe('días y semáforo', () => {
  it('el día se toma en México, no en UTC', () => {
    // 29-10 a las 23:30 en México ya es 30-10 en UTC.
    expect(diaMexico(new Date('2026-10-30T05:30:00Z'))).toBe('2026-10-29');
  });

  it('cuenta días hábiles sin el día en que quedó listo', () => {
    expect(diasHabiles('2026-10-23', '2026-10-26')).toBe(1); // viernes → lunes
    expect(diasHabiles('2026-10-21', '2026-10-29')).toBe(6);
    expect(diasHabiles('2026-10-29', '2026-10-29')).toBe(0);
    expect(diasNaturales('2026-10-21', '2026-10-29')).toBe(8);
  });

  it('la meta es facturar en 2 días hábiles', () => {
    expect(semaforoFacturacion(0)).toBe('ok');
    expect(semaforoFacturacion(1)).toBe('ok');
    expect(semaforoFacturacion(2)).toBe('atencion');
    expect(semaforoFacturacion(3)).toBe('tarde');
  });
});

describe('pendientesReceptor', () => {
  it('un cliente completo no tiene pendientes', () => {
    expect(pendientesReceptor({ rfc: 'CMO0903155K2', nombre: 'COLEGIO MONTEBELLO', cp: '72810', regimen: '603' })).toEqual([]);
  });

  it('dice qué falta, en palabras', () => {
    const p = pendientesReceptor({ rfc: 'GFA0102209T1', nombre: 'GRUPO FERRETERO', cp: '', regimen: '601' });
    expect(p.map((x) => x.texto)).toEqual(['Falta el código postal fiscal del cliente']);
    expect(pendientesReceptor({ rfc: 'abc', nombre: 'X', cp: '72000', regimen: '601' })[0].clave).toBe('rfc');
  });
});

describe('importeAnticipo', () => {
  it('50 % de una cotización con IVA 16 %', () => {
    expect(importeAnticipo({ total: 69600, subtotal: 60000, discountTotal: 0, taxTotal: 9600, depositPercent: 50 })).toEqual({
      base: 30000,
      iva: 4800,
      total: 34800,
      ivaPct: 16,
    });
  });

  it('respeta el descuento y no pasa de 100 %', () => {
    const a = importeAnticipo({ total: 1044, subtotal: 1000, discountTotal: 100, taxTotal: 144, depositPercent: 150 });
    expect(a.base).toBe(900);
    expect(a.total).toBe(1044);
  });

  it('toma el total con margen, no el subtotal sin él', () => {
    // 100 + IVA 16 = 116; con margen 20 % la cotización vale 139.20
    const a = importeAnticipo({ total: 139.2, subtotal: 100, discountTotal: 0, taxTotal: 16, depositPercent: 50 });
    expect(a.total).toBe(69.6);
    expect(a.base).toBe(60);
  });
});

describe('conceptosDesdeCotizacion', () => {
  const partida = (p: Partial<import('./por-facturar.js').PartidaCotizacion>) => ({
    name: 'Cámara',
    qty: 1,
    unitPrice: 0,
    laborHours: 0,
    laborRate: 0,
    discount: 0,
    tax: 16,
    ieps: 0,
    retention: 0,
    unit: 'pza',
    ...p,
  });

  it('la mano de obra entra en la base y el margen escala la partida', () => {
    const [c] = conceptosDesdeCotizacion({
      conIva: true,
      factorMargen: 1.2,
      partidas: [partida({ qty: 2, unitPrice: 100, laborHours: 1, laborRate: 50 })],
    });
    // (2 × 100 + 50) × 1.2 = 300 → 150 por pieza
    expect(c).toMatchObject({ quantity: 2, unitPrice: 150, ivaRate: 16 });
  });

  it('sin factura con IVA no traslada IVA ni retiene', () => {
    const [c] = conceptosDesdeCotizacion({ conIva: false, factorMargen: 1, partidas: [partida({ unitPrice: 500, retention: 10 })] });
    expect(c.ivaRate).toBe(0);
    expect(c.isrRetRate).toBe(0);
  });

  it('un precio que no cae en centavos va como una unidad', () => {
    const [c] = conceptosDesdeCotizacion({ conIva: true, factorMargen: 1, partidas: [partida({ qty: 3, unitPrice: 0, laborHours: 1, laborRate: 100 })] });
    expect(c.quantity).toBe(1);
    expect(c.unitPrice).toBe(100);
    expect(c.description).toBe('Cámara (3 pza)');
  });

  it('descarta partidas en cero y conserva el índice de la partida', () => {
    const r = conceptosDesdeCotizacion({ conIva: true, factorMargen: 1, partidas: [partida({}), partida({ unitPrice: 10 })] });
    expect(r).toHaveLength(1);
    expect(r[0].indice).toBe(1);
  });
});

describe('orden y plazos', () => {
  const item = (clave: string, listoDesde: string, importe: number | null) =>
    ({ clave, listoDesde, importe }) as unknown as PorFacturarItem;

  it('lo más antiguo primero', () => {
    const orden = ordenarPorFacturar([item('b', '2026-10-27', 10), item('a', '2026-10-21', null), item('c', '2026-10-27', 50)]);
    expect(orden.map((x) => x.clave)).toEqual(['a', 'c', 'b']);
  });

  it('el complemento vence el 5 del mes siguiente', () => {
    expect(venceComplemento('2026-10-27')).toBe('2026-11-05');
    expect(venceComplemento('2026-12-31')).toBe('2027-01-05');
  });
});
