import fs from 'fs';
import path from 'path';
import { formatoDesdeCotizacion, generarCotizacionNexaraPdf } from './cotizacion-formato-nexara.js';
import { importeConLetra } from './importe-letra.js';
import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';

/**
 * Las 5 partidas de Grupo Dice Puebla (NEX260927001).
 * Subtotal 779,072.62 + IVA 16% 124,651.62 = 903,724.24.
 */
const grupoDice = {
  quoteNumber: 'NEX260927001',
  issueDate: '2026-09-27',
  validUntil: '2026-10-04',
  clientCompany: 'Grupo Dice Puebla',
  atencion: 'Eva Benavides',
  clientAddress: 'Puebla, Pue.',
  projectName: 'Suministro de equipo Cisco Meraki (switching y Wi-Fi)',
  preparedBy: 'Christian Del Pozo',
  trabajo: 'Ventas',
  depositPercent: 50,
  currency: 'MXN',
  items: [
    {
      partida: '1',
      name: 'Switch Cisco Meraki MS130-48X',
      brand: 'Cisco Meraki',
      model: 'MS130-48X',
      description: 'Switch administrable en la nube, 48 puertos Gigabit Ethernet PoE+ y 4 puertos uplink 10G SFP+.',
      unit: 'Pieza',
      qty: 2,
      unitPrice: 203420.09,
      unitCost: 169516.74,
      marginPercent: 20,
      discount: 0,
      tax: 16,
    },
    {
      partida: '1.1',
      name: 'Cable de alimentación AC',
      brand: 'Cisco Meraki',
      model: 'MA-PWR-CORD-US-FR',
      description: 'Cable de corriente tipo US para el switch (incluido).',
      unit: 'Pieza',
      qty: 2,
      unitPrice: 0,
      discount: 0,
      tax: 16,
    },
    {
      partida: '2',
      name: 'Licencia Meraki MS130-48 Enterprise, 10 años',
      brand: 'Cisco Meraki',
      model: 'LIC-MS130-48-10Y',
      unit: 'Licencia',
      qty: 2,
      unitPrice: 42924.44,
      discount: 0,
      tax: 16,
    },
    {
      partida: '3',
      name: 'Access Point Cisco Catalyst 9164I (Meraki)',
      brand: 'Cisco Meraki',
      model: 'CW9164I-MR',
      unit: 'Pieza',
      qty: 4,
      unitPrice: 51393.89,
      discount: 0,
      tax: 16,
    },
    {
      partida: '4',
      name: 'Licencia Meraki MR Enterprise, 7 años',
      brand: 'Cisco Meraki',
      model: 'LIC-ENT-7YR',
      unit: 'Licencia',
      qty: 4,
      unitPrice: 20202,
      discount: 0,
      tax: 16,
    },
  ],
};

describe('formato Nexara', () => {
  it('el importe con letra de Grupo Dice', () => {
    expect(importeConLetra(903724.24)).toBe(
      '(Novecientos tres mil setecientos veinticuatro pesos 24/100 M.N.)',
    );
  });

  it('las 5 partidas cierran en 903,724.24 con IVA', () => {
    const f = formatoDesdeCotizacion(grupoDice);
    expect(f.partidas).toHaveLength(5);
    expect(f.partidas[1]!.partida).toBe('1.1');
    expect(f.subtotal).toBe(779072.62);
    expect(f.iva).toBe(124651.62);
    expect(f.total).toBe(903724.24);
    expect(f.letras).toContain('Novecientos tres mil setecientos veinticuatro pesos 24/100 M.N.');
    expect(f.cliente).toBe('Grupo Dice Puebla');
    expect(f.atencion).toBe('Eva Benavides');
    expect(f.entrega).toBe('15 días naturales, o según disponibilidad de inventario al confirmar el pedido.');
    expect(f.vigencia).toBe('7 días naturales (vence el 04/10/2026)');
  });

  it('tiempo de entrega, garantía y vigencia salen del texto de la cotización, no de otro campo', () => {
    const f = formatoDesdeCotizacion({
      ...grupoDice,
      deliveryTime: '15 días naturales, o según disponibilidad de inventario al confirmar el pedido.',
      opciones: {
        condiciones: {
          tiempoEntrega: '6 semanas',
          garantia: 'Garantía 1 año, en el caso de la licencia es por 7 años',
          vigencia: '2 días naturales a partir de la fecha de emisión de esta propuesta.',
        },
      },
    });
    expect(f.entrega).toBe('6 semanas');
    expect(f.garantia).toBe('Garantía 1 año, en el caso de la licencia es por 7 años');
    expect(f.vigencia).toBe('2 días naturales a partir de la fecha de emisión de esta propuesta.');
  });

  it('sin frase propia, el tiempo de entrega legado se conserva', () => {
    const f = formatoDesdeCotizacion({ ...grupoDice, deliveryTime: '10 días hábiles' });
    expect(f.entrega).toBe('10 días hábiles');
  });

  it('el PDF lleva el membrete, la firma y no imprime el costo', async () => {
    const pdf = await generarCotizacionNexaraPdf(grupoDice);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoPorHoja(pdf).join('\n');
    expect(texto).toContain('COTIZACIÓN');
    expect(texto).toContain('Grupo Dice Puebla');
    expect(texto).toContain('Switch Cisco Meraki MS130-48X');
    expect(texto).toContain('Cable de alimentación AC');
    expect(texto).toContain('Licencia Meraki MR Enterprise, 7 años');
    expect(texto).toContain('903,724.24');
    expect(texto).toContain('CHRISTIAN EDUARDO DEL POZO SÁNCHEZ');
    expect(texto).toContain('NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.');
    expect(texto).not.toContain('169516');
    expect(texto).not.toContain('Costo');
    expect(texto).not.toContain('Margen');
  });

  it('la firma impresa de Christian queda en los assets (pidió Monica que fuera fija en todas)', () => {
    const firma = path.resolve(__dirname, '../assets/cotizacion-nexara/firma_christian.png');
    expect(fs.existsSync(firma)).toBe(true);
  });

  it('la descripción larga, con saltos y viñetas, sale completa y sigue en la hoja siguiente', async () => {
    const viñetas = Array.from({ length: 80 }, (_, i) => `• Característica ${i + 1}: detalle que no debe cortarse`).join('\n');
    const pdf = await generarCotizacionNexaraPdf({
      ...grupoDice,
      items: [{ ...grupoDice.items[0], name: 'Disco duro', description: viñetas }],
    });
    const hojas = textoPorHoja(pdf);
    const texto = hojas.join('\n');
    expect(texto).toContain('Disco duro');
    expect(texto).toContain('Característica 1:');
    expect(texto).toContain('Característica 80:');
    expect(hojas.length).toBeGreaterThan(1);
  });

  it('quince viñetas en una sola línea, de más de 1500 caracteres, salen completas y cada una en su renglón', async () => {
    const cuerpo = (n: number) =>
      `Viñeta ${String(n).padStart(2, '0')}: especificación técnica que tiene que imprimirse entera, sin recorte de caracteres ni de renglones, incluyendo el cierre UNICO-${String(n).padStart(2, '0')}-FIN`;
    const inline = `Disco duro Con las siguientes características: ${Array.from({ length: 15 }, (_, i) => `• ${cuerpo(i + 1)}`).join(' ')}`;
    expect(inline.length).toBeGreaterThan(1500);
    expect(inline.includes('\n')).toBe(false);
    const pdf = await generarCotizacionNexaraPdf({
      ...grupoDice,
      items: [{ ...grupoDice.items[0], name: inline, description: null }],
    });
    fs.writeFileSync('/tmp/cotizacion-vinetas.pdf', pdf);
    const hojas = textoPorHoja(pdf);
    const texto = hojas.join('\n');
    for (let n = 1; n <= 15; n += 1) {
      expect(texto).toContain(`UNICO-${String(n).padStart(2, '0')}-FIN`);
    }
    const intro = texto.split('\n').find((l) => l.includes('siguientes características'));
    expect(intro).toBeTruthy();
    expect(intro).not.toContain('Viñeta 01');
    expect(texto).toContain('Viñeta 01:');
    expect(texto).toContain('Viñeta 15:');
  });

  it('el margen 20 va dentro del precio y del total: subtotal con IVA × 1.20, sin decir margen ni costo', async () => {
    const f = formatoDesdeCotizacion({
      quoteNumber: 'NEX-1',
      issueDate: '2026-09-28',
      validUntil: '2026-10-13',
      currency: 'MXN',
      marginPercent: 20,
      items: [{ name: 'Poste', qty: 1, unitPrice: 100, unitCost: 80, tax: 16, discount: 0 }],
    });
    expect(f.partidas[0]!.precioUnitario).toBe(120);
    expect(f.subtotal).toBe(120);
    expect(f.iva).toBe(19.2);
    expect(f.total).toBe(139.2);
    const texto = textoPorHoja(await generarCotizacionNexaraPdf(f)).join('\n');
    expect(texto).toContain('120.00');
    expect(texto).toContain('139.20');
    expect(texto).not.toContain('Costo');
    expect(texto).not.toContain('Margen');
  });
});
