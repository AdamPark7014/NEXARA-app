import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { formatoDesdeCotizacion, generarCotizacionNexaraPdf } from './cotizacion-formato-nexara.js';
import { importeConLetra } from './importe-letra.js';
import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';
import { loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';

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

  it('un plano en PDF (el que de verdad descarga el cliente) anexa sus páginas reales', async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-cot-planos-'));
    const planoPdf = await PDFLibDocument.create();
    planoPdf.addPage([1224, 792]).drawText('RED CCTV_IPADE', { x: 40, y: 700, size: 24 });
    fs.writeFileSync(path.join(carpeta, 'plano.pdf'), await planoPdf.save());
    const antes = process.env['UPLOADS_ROOT'];
    process.env['UPLOADS_ROOT'] = carpeta;
    try {
      const planos = [{ url: '/uploads/plano.pdf', nombre: 'RED CCTV_IPADE', tipo: 'pdf' }];
      const [conPlano, sinPlano] = await Promise.all([
        generarCotizacionNexaraPdf(grupoDice, planos),
        generarCotizacionNexaraPdf(grupoDice),
      ]);
      // pdf-lib reescribe el PDF al fusionar: el conteo de páginas se hace con la misma librería.
      const [paginasCon, paginasSin] = await Promise.all([
        PDFLibDocument.load(conPlano).then((d) => d.getPageCount()),
        PDFLibDocument.load(sinPlano).then((d) => d.getPageCount()),
      ]);
      expect(paginasCon).toBe(paginasSin + 1);
    } finally {
      if (antes === undefined) delete process.env['UPLOADS_ROOT'];
      else process.env['UPLOADS_ROOT'] = antes;
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('un plano en imagen (el que de verdad descarga el cliente) sale a página completa', async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-cot-plano-img-'));
    fs.writeFileSync(path.join(carpeta, 'plano.png'), loadNexaraLogo()!);
    const antes = process.env['UPLOADS_ROOT'];
    process.env['UPLOADS_ROOT'] = carpeta;
    try {
      const planos = [{ url: '/uploads/plano.png', nombre: 'Sembrado de cámaras', tipo: 'imagen' }];
      const [conPlano, sinPlano] = await Promise.all([
        generarCotizacionNexaraPdf(grupoDice, planos),
        generarCotizacionNexaraPdf(grupoDice),
      ]);
      const hojas = textoPorHoja(conPlano);
      const texto = hojas.join('\n');
      expect(texto).toContain('Sembrado de cámaras');
      expect(textoPorHoja(sinPlano).join('\n')).not.toContain('Sembrado de cámaras');

      // El cierre (ATENTAMENTE y firma) va al final de verdad: después del plano, no antes.
      const paginaDelPlano = hojas.findIndex((h) => h.includes('Sembrado de cámaras'));
      const paginaDelCierre = hojas.findIndex((h) => h.includes('CHRISTIAN EDUARDO DEL POZO SÁNCHEZ'));
      expect(paginaDelPlano).toBeGreaterThanOrEqual(0);
      expect(paginaDelCierre).toBe(hojas.length - 1);
      expect(paginaDelPlano).toBeLessThan(paginaDelCierre);
    } finally {
      if (antes === undefined) delete process.env['UPLOADS_ROOT'];
      else process.env['UPLOADS_ROOT'] = antes;
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
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

  describe('forma de pago y términos: lo que quedó en el editor', () => {
    // Cotización de Adam: quitó el anticipo en «Términos y condiciones → Forma de pago · Anticipo»
    // y el PDF siguió imprimiendo «50% de anticipo para confirmar el pedido y 50% contra entrega…».
    const todoElTexto = (f: ReturnType<typeof formatoDesdeCotizacion>) =>
      [f.pagoCorto, f.condicionesPago, f.entrega, f.garantia, f.vigencia, ...f.terminos].join('\n');

    it('sin tocar nada salen los términos del segmento con el anticipo capturado', () => {
      const f = formatoDesdeCotizacion(grupoDice);
      expect(f.pagoCorto).toBe('50% anticipo');
      expect(f.condicionesPago).toBe(
        '50 % de anticipo para confirmar el pedido y programar el suministro; el 50 % restante contra entrega del equipo.',
      );
      expect(f.terminos.map((t) => t.split(':')[0])).toEqual(['Alcance de la cotización', 'No incluye', 'Disponibilidad']);
    });

    it('con el anticipo en 0 nada menciona un anticipo: ni el renglón, ni la franja, ni los términos', async () => {
      const sinAnticipo = { ...grupoDice, depositPercent: 0 };
      const f = formatoDesdeCotizacion(sinAnticipo);
      expect(f.pagoCorto).toBe('Contra entrega');
      expect(f.condicionesPago).toBe('Pago del 100 % contra entrega del equipo.');
      expect(todoElTexto(f)).not.toMatch(/anticipo/i);
      const impreso = textoPorHoja(await generarCotizacionNexaraPdf(sinAnticipo)).join('\n');
      expect(impreso).toContain('Condiciones de pago:');
      expect(impreso).not.toMatch(/anticipo/i);
    });

    it('la forma de pago reescrita es la que sale, aunque el anticipo siga en 50', async () => {
      const propia = { ...grupoDice, note: 'Forma de pago:\nCrédito a 30 días.' };
      const f = formatoDesdeCotizacion(propia);
      expect(f.condicionesPago).toBe('Crédito a 30 días.');
      expect(f.pagoCorto).toBe('Crédito a 30 días');
      expect(todoElTexto(f)).not.toContain('50');
      const impreso = textoPorHoja(await generarCotizacionNexaraPdf(propia)).join('\n');
      expect(impreso).toContain('Crédito a 30 días.');
      expect(impreso).not.toContain('50% de anticipo');
      expect(impreso).not.toContain('50 % de anticipo');
    });

    it('un texto propio largo no deja en la franja un anticipo que el texto no dice', () => {
      const largo = 'Pago a 30 días naturales contados a partir de la entrega, mediante transferencia electrónica.';
      expect(formatoDesdeCotizacion({ ...grupoDice, note: `Forma de pago:\n${largo}` }).pagoCorto).toBe('Ver condiciones');
      // Si el texto sí habla de ese anticipo, la franja lo resume.
      const conAnticipo = 'Se requiere 50 % de anticipo por transferencia a la cuenta BBVA y el resto contra entrega.';
      expect(formatoDesdeCotizacion({ ...grupoDice, note: `Forma de pago:\n${conAnticipo}` }).pagoCorto).toBe('50% anticipo');
    });

    it('la forma de pago borrada no se imprime: el renglón desaparece', async () => {
      const borrada = { ...grupoDice, depositPercent: 0, note: 'Forma de pago:' };
      const f = formatoDesdeCotizacion(borrada);
      expect(f.condicionesPago).toBe('');
      expect(f.pagoCorto).toBe('');
      const impreso = textoPorHoja(await generarCotizacionNexaraPdf(borrada)).join('\n');
      expect(impreso).not.toContain('Condiciones de pago:');
      expect(impreso).not.toMatch(/anticipo/i);
      expect(impreso).toContain('Tiempo de entrega:');
    });

    it('los términos reescritos salen con su título y los demás siguen al segmento', () => {
      const f = formatoDesdeCotizacion({ ...grupoDice, note: 'No incluye:\nObra civil ni permisos.' });
      expect(f.terminos).toContain('No incluye: Obra civil ni permisos.');
      expect(f.terminos.some((t) => t.startsWith('Alcance de la cotización: El precio cotizado cubre únicamente el suministro'))).toBe(true);
    });

    it('si se cobra instalación, los términos no dicen «únicamente el suministro»', () => {
      const f = formatoDesdeCotizacion({
        ...grupoDice,
        items: [...grupoDice.items, { name: 'Instalación y puesta en marcha', unit: 'Servicio', qty: 1, unitPrice: 5000, tax: 16 }],
      });
      expect(f.terminos.join('\n')).toContain('mano de obra de instalación');
      expect(f.terminos.join('\n')).not.toContain('únicamente el suministro');
      expect(f.condicionesPago).toContain('contra entrega del sistema en operación');
    });

    it('con los términos apagados en «Personalizar» no se imprimen; la forma de pago sí', async () => {
      const apagados = { ...grupoDice, opciones: { secciones: { terminos: false } } };
      const f = formatoDesdeCotizacion(apagados);
      expect(f.terminos).toEqual([]);
      expect(f.condicionesPago).toContain('50 % de anticipo');
      const impreso = textoPorHoja(await generarCotizacionNexaraPdf(apagados)).join('\n');
      expect(impreso).not.toContain('TÉRMINOS Y CONDICIONES');
      expect(impreso).toContain('Condiciones de pago:');
    });

    it('en licitación la franja no inventa un anticipo: mandan las bases', () => {
      const f = formatoDesdeCotizacion({ ...grupoDice, segmento: 'LICITACION', depositPercent: 0 });
      expect(f.pagoCorto).toBe('Según bases');
      expect(f.condicionesPago).toContain('bases de la licitación');
    });
  });

  describe('datos fiscales del emisor en el encabezado', () => {
    const fiscales = [
      'New Engineering Expertise And Resource Advancement S.A. De C.V.',
      'RFC: NEE240925V73',
      'Ignacio Allende 512 local 2 Santiago Momoxpan, 72775 San Pedro Cholula, Puebla',
      'Correo electrónico: gerencia@nexara.com.mx',
      'Teléfonos: 2226960350',
    ];

    it('abren la primera hoja, arriba del título', async () => {
      const [primera] = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice));
      const renglones = primera!.split('\n');
      for (const linea of fiscales) expect(renglones).toContain(linea);
      // Se dibujan antes que el título: van arriba de «COTIZACIÓN», en el orden pedido.
      const posiciones = [...fiscales, 'COTIZACIÓN'].map((linea) => renglones.indexOf(linea));
      expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    });

    it('las hojas de continuación conservan su encabezado corto, sin datos fiscales', async () => {
      const viñetas = Array.from({ length: 80 }, (_, i) => `• Característica ${i + 1}: detalle`).join('\n');
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, items: [{ ...grupoDice.items[0], description: viñetas }] }),
      );
      expect(hojas.length).toBeGreaterThan(1);
      expect(hojas[0]).toContain('RFC: NEE240925V73');
      for (const hoja of hojas.slice(1)) {
        expect(hoja).not.toContain('RFC: NEE240925V73');
        expect(hoja).not.toContain('Correo electrónico: gerencia@nexara.com.mx');
      }
      expect(hojas[1]).toContain('(continuación)');
    });
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
