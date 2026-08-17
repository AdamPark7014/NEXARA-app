import { buildSealedCfdi, cents } from './cfdi-xml.builder.js';

/**
 * Cuadre al centavo del CFDI.
 *
 * El SAT valida que `TotalImpuestosTrasladados` sea la suma de los `Importe`
 * que aparecen impresos en los conceptos. Antes cada concepto se imprimía
 * redondeado pero el total sumaba los valores a plena precisión, así que con
 * ciertas cantidades salían un centavo distintos y el PAC rechazaba el
 * timbrado con un error que no explicaba nada.
 *
 * Estas pruebas fijan la identidad: lo impreso arriba es la suma de lo impreso
 * abajo.
 */

const CSD_FALSO = {
  isConfigured: () => true,
  getNoCertificado: () => '00001000000500000001',
  getCertificadoBase64: () => 'Q0VSVA==',
  sign: () => 'U0VMTE8=',
} as any;

const base = {
  invoiceNumber: 'F-001',
  issueDate: new Date('2026-08-16T12:00:00Z').toISOString(),
  currency: 'MXN',
  paymentForm: 'FP03',
  paymentMethod: 'PUE',
  emisor: { rfc: 'AAA010101AAA', name: 'NEXARA', regime: 'R601', zipCode: '64000' },
  receptor: { rfc: 'BBB010101BBB', name: 'CLIENTE', regime: 'R601', zipCode: '64000' },
};

const construir = (items: any[]) =>
  buildSealedCfdi({ ...base, items } as any, CSD_FALSO).xml;

/** Suma los `Importe` de los traslados que van dentro de cada concepto. */
function sumaTrasladosDeConceptos(xml: string): number {
  const conceptos = xml.split('<cfdi:Concepto ').slice(1);
  let total = 0;
  for (const c of conceptos) {
    const m = c.match(/<cfdi:Traslado [^>]*Importe="([\d.]+)"/);
    if (m) total += Number(m[1]);
  }
  return cents(total);
}

/**
 * Atributo de la etiqueta de apertura del nodo raíz `cfdi:Comprobante`.
 *
 * Se acota a propósito: `Descuento` e `Importe` también aparecen dentro de los
 * conceptos, y buscarlos en todo el documento devolvería el del primer renglón
 * en vez del total del comprobante.
 */
const raiz = (xml: string, nombre: string): number => {
  const inicio = xml.indexOf('<cfdi:Comprobante');
  const etiqueta = xml.slice(inicio, xml.indexOf('>', inicio));
  const m = etiqueta.match(new RegExp(`\\b${nombre}="([\\d.]+)"`));
  return m ? Number(m[1]) : NaN;
};

/** Atributo del nodo `cfdi:Impuestos` de nivel comprobante (el último). */
const impuestosTotales = (xml: string, nombre: string): number => {
  const inicio = xml.lastIndexOf('<cfdi:Impuestos');
  const etiqueta = xml.slice(inicio, xml.indexOf('>', inicio));
  const m = etiqueta.match(new RegExp(`\\b${nombre}="([\\d.]+)"`));
  return m ? Number(m[1]) : NaN;
};

describe('redondeo a centavos', () => {
  it('redondea a dos decimales', () => {
    expect(cents(5.3344)).toBe(5.33);
    expect(cents(5.335)).toBe(5.34);
  });

  it('no arrastra el ruido binario de la coma flotante', () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(cents(0.1 + 0.2)).toBe(0.3);
  });

  it('redondea hacia arriba el medio centavo aunque el binario se quede corto', () => {
    // 1.005 se guarda como 1.00499999999999989. Con un epsilon fijo se
    // redondeaba a 1.00; el importe terminado en medio centavo es justo el
    // caso habitual al aplicar 16 % sobre precios de dos decimales.
    expect(cents(1.005)).toBe(1.01);
    expect(cents(2.675)).toBe(2.68);
    expect(cents(8.615)).toBe(8.62);
  });

  it('no empuja hacia arriba lo que de verdad está por debajo del medio', () => {
    expect(cents(1.0049)).toBe(1.0);
    expect(cents(2.674)).toBe(2.67);
  });

  it('tolera basura sin devolver NaN', () => {
    expect(cents(NaN)).toBe(0);
    expect(cents(undefined as any)).toBe(0);
  });
});

describe('el total de impuestos cuadra con los conceptos', () => {
  it('el caso que hacia fallar el timbrado: tres renglones a 33.34', () => {
    // IVA por renglon = 5.3344 -> impreso 5.33 (suma 15.99).
    // El total sumaba sin redondear: 16.0032 -> imprimia 16.00. Un centavo, y
    // el PAC rechazaba.
    const xml = construir([
      { description: 'A', quantity: 1, unitPrice: 33.34 },
      { description: 'B', quantity: 1, unitPrice: 33.34 },
      { description: 'C', quantity: 1, unitPrice: 33.34 },
    ]);

    expect(impuestosTotales(xml, 'TotalImpuestosTrasladados')).toBe(sumaTrasladosDeConceptos(xml));
  });

  it('cuadra con cantidades fraccionarias', () => {
    const xml = construir([
      { description: 'A', quantity: 3, unitPrice: 12.345 },
      { description: 'B', quantity: 7, unitPrice: 0.99 },
      { description: 'C', quantity: 1.5, unitPrice: 199.99 },
    ]);
    expect(impuestosTotales(xml, 'TotalImpuestosTrasladados')).toBe(sumaTrasladosDeConceptos(xml));
  });

  it('cuadra con descuentos por renglón', () => {
    const xml = construir([
      { description: 'A', quantity: 2, unitPrice: 33.33, discount: 3.33 },
      { description: 'B', quantity: 5, unitPrice: 11.11, discount: 1.11 },
    ]);
    expect(impuestosTotales(xml, 'TotalImpuestosTrasladados')).toBe(sumaTrasladosDeConceptos(xml));
  });

  it('cuadra con muchos renglones que arrastran medio centavo', () => {
    const items = Array.from({ length: 17 }, (_, i) => ({
      description: `Renglón ${i}`,
      quantity: 1,
      unitPrice: 10.03,
    }));
    const xml = construir(items);
    expect(impuestosTotales(xml, 'TotalImpuestosTrasladados')).toBe(sumaTrasladosDeConceptos(xml));
  });

  it('cuadra con tasa distinta del 16%', () => {
    const xml = construir([
      { description: 'A', quantity: 1, unitPrice: 33.34, taxRate: 8 },
      { description: 'B', quantity: 1, unitPrice: 33.34, taxRate: 8 },
      { description: 'C', quantity: 1, unitPrice: 33.34, taxRate: 8 },
    ]);
    expect(impuestosTotales(xml, 'TotalImpuestosTrasladados')).toBe(sumaTrasladosDeConceptos(xml));
  });
});

describe('el resto de totales también cuadra', () => {
  it('la Base del traslado global es la suma de las bases de los conceptos', () => {
    const xml = construir([
      { description: 'A', quantity: 1, unitPrice: 33.34, discount: 1.11 },
      { description: 'B', quantity: 1, unitPrice: 33.34, discount: 1.11 },
    ]);

    const conceptos = xml.split('<cfdi:Concepto ').slice(1);
    const sumaBases = cents(
      conceptos.reduce((s, c) => {
        const m = c.match(/<cfdi:Traslado Base="([\d.]+)"/);
        return s + (m ? Number(m[1]) : 0);
      }, 0),
    );

    const global = xml.split('<cfdi:Impuestos').pop() ?? '';
    const mGlobal = global.match(/<cfdi:Traslado Base="([\d.]+)"/);
    expect(Number(mGlobal?.[1])).toBe(sumaBases);
  });

  it('el Total es SubTotal - Descuento + Traslados', () => {
    const xml = construir([
      { description: 'A', quantity: 3, unitPrice: 33.34, discount: 2.22 },
      { description: 'B', quantity: 1, unitPrice: 19.99 },
    ]);
    const subTotal = raiz(xml, 'SubTotal');
    const descuento = raiz(xml, 'Descuento');
    const traslados = impuestosTotales(xml, 'TotalImpuestosTrasladados');
    expect(raiz(xml, 'Total')).toBe(cents(subTotal - (descuento || 0) + traslados));
  });

  it('el SubTotal es la suma de los Importe de los conceptos', () => {
    const xml = construir([
      { description: 'A', quantity: 3, unitPrice: 12.345 },
      { description: 'B', quantity: 7, unitPrice: 0.99 },
    ]);
    const conceptos = xml.split('<cfdi:Concepto ').slice(1);
    const suma = cents(
      conceptos.reduce((s, c) => {
        const m = c.match(/ Importe="([\d.]+)"/);
        return s + (m ? Number(m[1]) : 0);
      }, 0),
    );
    expect(raiz(xml, 'SubTotal')).toBe(suma);
  });
});
