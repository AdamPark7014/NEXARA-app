import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { formatoDesdeCotizacion, generarCotizacionNexaraPdf, paginaImpresa, trabajoDePartidas } from './cotizacion-formato-nexara.js';
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

  describe('el diseño de NEXARA', () => {
    const instalacion = { name: 'Instalación y puesta en marcha', unit: 'Servicio', qty: 1, unitPrice: 5000, tax: 16 };
    const cuantas = (texto: string, buscado: string) => texto.split(buscado).length - 1;
    /** Cada trozo de texto es un renglón de la salida: el número en verde y su título se leen de corrido. */
    const deCorrido = (texto: string) => texto.replace(/\s+/g, ' ');

    it('la portada lleva el arte y el índice de lo que trae esta cotización', async () => {
      const pdf = await generarCotizacionNexaraPdf(grupoDice);
      const [portada] = textoPorHoja(pdf);
      for (const esperado of ['NEXARA', 'MEMORIA', 'TÉCNICA-ECONÓMICA', 'VERSIÓN 1.0', 'ALCANCE EJECUTIVO', 'PROPUESTA ECONÓMICA DETALLADA']) {
        expect(portada).toContain(esperado);
      }
      // Lo que no trae no se anuncia.
      expect(portada).not.toContain('PLANOS');
      expect(portada).not.toContain('Página');
      expect(pdf.toString('latin1')).toContain('/DCTDecode');
    });

    it('sin proyecto escrito, la primera hoja dice qué se cotiza', async () => {
      const [, primera] = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, projectName: null, items: [grupoDice.items[0], instalacion] }));
      expect(primera!.replace(/\s+/g, ' ')).toContain('SUMINISTRO E INSTALACIÓN DE EQUIPAMIENTO');
    });

    it('no hay segunda portada: los datos y el alcance ejecutivo van en la misma hoja', async () => {
      const hojas = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice));
      for (const esperado of ['MEMORIA DESCRIPTIVA Y PROPUESTA TÉCNICA-ECONÓMICA', 'SUMINISTRO DE EQUIPO CISCO MERAKI', 'Grupo Dice Puebla', 'COTIZACIÓN N°', 'ALCANCE EJECUTIVO']) {
        expect(deCorrido(hojas[1]!)).toContain(esperado);
      }
    });

    it('el título por omisión sigue a lo cotizado', () => {
      const de = (...grupos: Array<'EQUIPOS' | 'MATERIALES' | 'MANO_DE_OBRA'>) =>
        trabajoDePartidas(grupos.map((grupo) => ({ grupo, titulo: 'Partida', unidad: 'Pieza' })));
      expect(de('EQUIPOS')).toBe('Suministro de equipamiento');
      expect(de('EQUIPOS', 'MATERIALES')).toBe('Suministro de equipamiento e infraestructura');
      expect(de('EQUIPOS', 'MATERIALES', 'MANO_DE_OBRA')).toBe('Suministro e instalación de equipamiento e infraestructura');
      expect(de('MATERIALES')).toBe('Suministro de materiales');
      expect(de('MANO_DE_OBRA')).toBe('Servicios de implementación y puesta a punto');
      expect(trabajoDePartidas([{ grupo: 'EQUIPOS', titulo: 'Licencia anual', unidad: 'Licencia' }])).toBe('Licenciamiento');
      expect(de()).toBe('');
    });

    it('la versión de la portada es la revisión; un borrador de algo que ya salió es la siguiente', async () => {
      const r3 = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, revision: 3, status: 'SENT' }));
      expect(r3[0]).toContain('VERSIÓN 3.0');
      const borrador = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, revision: 1, status: 'DRAFT', sentAt: '2026-09-28' }),
      );
      expect(borrador[0]).toContain('VERSIÓN 2.0');
    });

    it('cada dato se imprime una sola vez: sin franja, sin cajas repetidas', async () => {
      const texto = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, clientName: 'Eva Benavides' })).join('\n');
      for (const una of ['Grupo Dice Puebla', 'Eva Benavides', 'Puebla, Pue.', '903,724.24', 'Christian Del Pozo', '04/10/2026']) {
        expect(cuantas(texto, una)).toBe(1);
      }
      expect(texto).not.toContain('Trabajo');
      expect(texto).not.toContain('DATOS DEL CLIENTE');
      expect(texto).not.toContain('50% anticipo');
    });

    it('el alcance ejecutivo sin escribir son tres puntos cortos, sin repetir la tabla', async () => {
      const f = formatoDesdeCotizacion({ ...grupoDice, items: [...grupoDice.items, instalacion] });
      expect(f.objetivo!.beneficios).toHaveLength(3);
      const impreso = textoPorHoja(await generarCotizacionNexaraPdf(f)).join('\n');
      expect(impreso).toContain('Beneficios principales');
      expect(impreso).toContain('Resultado esperado');
      expect(impreso).not.toContain('×');
      expect(impreso).not.toContain('Proyecto:');
      expect(impreso).not.toContain('Precios firmes');
    });

    it('lo escrito en el editor es lo que sale, cada bloque como apartado numerado', async () => {
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          objetivo: 'Mi introducción.\n\nBeneficios:\n1. Uno.\n2. Dos.\n\nCierre:\nMi cierre.',
          scope: 'Mi párrafo de entrada.',
          alcanceBloques: [
            { titulo: 'Justificación tecnológica', texto: 'Por qué estos equipos.', vinetas: ['Protección activa: con luz y audio.'] },
            { titulo: '', texto: 'Sigue del anterior.' },
            { titulo: 'Centro de monitoreo', vinetas: ['Con respaldo.'] },
          ],
        }),
      );
      const texto = hojas.join('\n');
      for (const esperado of ['Mi introducción.', 'Mi párrafo de entrada.', 'Uno.', 'Dos.', 'Mi cierre.', 'Por qué estos equipos.', 'Sigue del anterior.', 'Protección activa:', 'con luz y audio.', 'Con respaldo.']) {
        expect(texto).toContain(esperado);
      }
      expect(deCorrido(texto)).toContain('1. ALCANCE EJECUTIVO');
      expect(deCorrido(texto)).toContain('2. JUSTIFICACIÓN TECNOLÓGICA');
      expect(deCorrido(texto)).toContain('3. CENTRO DE MONITOREO');
      expect(deCorrido(texto)).toContain('5. PROPUESTA ECONÓMICA DETALLADA');
      expect(hojas[0]).toContain('JUSTIFICACIÓN TECNOLÓGICA');
    });

    it('lo pegado de Word sale limpio: sin tabuladores y con sus viñetas', async () => {
      const texto = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, objetivo: 'Detalle:\n•\tLicencia de software.\n-\tTerminal biométrica.' }),
      ).join('\n');
      expect(texto).toContain('Licencia de software.');
      expect(texto).toContain('Terminal biométrica.');
      expect(texto).not.toContain('\t');
      expect(texto).not.toContain('•');
    });

    it('los siete puntos del diseño vienen por omisión, en la portada y como apartados', async () => {
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          items: [
            { name: 'Cámara domo IP', model: 'DS-2CD', unit: 'Pieza', qty: 10, unitPrice: 1000, tax: 16 },
            { name: 'NVR 32 canales', unit: 'Pieza', qty: 1, unitPrice: 9000, tax: 16 },
            { name: 'UPS 1000 VA', unit: 'Pieza', qty: 1, unitPrice: 6000, tax: 16 },
            { name: 'Tubo conduit 1 pulgada', unit: 'Metro', qty: 50, unitPrice: 50, tax: 16 },
          ],
        }),
      );
      const puntos = [
        'ALCANCE EJECUTIVO',
        'JUSTIFICACIÓN TECNOLÓGICA',
        'BENEFICIOS DE LA CANALIZACIÓN INDUSTRIAL',
        'ESPECIFICACIÓN FUNCIONAL DE LAS CÁMARAS SELECCIONADAS',
        'CENTRO DE MONITOREO, ALMACENAMIENTO Y RESPALDO ELÉCTRICO ONLINE',
        'PÓLIZA DE GARANTÍAS, EXCLUSIONES Y VIGENCIA COMERCIAL',
        'PROPUESTA ECONÓMICA DETALLADA',
      ];
      const portada = hojas[0]!.replace(/\s+/g, ' ');
      const interior = hojas.slice(1).join(' ').replace(/\s+/g, ' ');
      puntos.forEach((punto, i) => {
        expect(portada).toContain(punto);
        expect(portada).toContain(`0${i + 1}.`);
        expect(interior).toContain(`${i + 1}. ${punto}`);
      });
    });

    it('cada punto se puede renombrar o quitar, y la portada dice lo mismo que el documento', async () => {
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          alcanceBloques: [{ titulo: 'Solo este punto', texto: 'Texto.' }],
          opciones: { titulos: { objetivo: 'Resumen del proyecto', cotizacion: 'Inversión' } },
        }),
      );
      const interior = hojas.slice(1).join('\n');
      expect(hojas[0]).toContain('RESUMEN DEL PROYECTO');
      expect(hojas[0]).toContain('SOLO ESTE PUNTO');
      expect(hojas[0]).toContain('INVERSIÓN');
      expect(hojas[0]).not.toContain('JUSTIFICACIÓN');
      expect(deCorrido(interior)).toContain('1. RESUMEN DEL PROYECTO');
      expect(deCorrido(interior)).toContain('2. SOLO ESTE PUNTO');
      expect(deCorrido(interior)).toContain('4. INVERSIÓN');
    });

    it('la póliza trae vigencia y moneda, y las condiciones no las repiten', async () => {
      const texto = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice)).join('\n');
      expect(cuantas(texto, 'Vigencia:')).toBe(1);
      expect(cuantas(texto, 'pesos mexicanos (MXN)')).toBe(1);
      expect(texto).toContain('Vigencia comercial');
      expect(texto).toContain('CONDICIONES COMERCIALES');
    });

    it('más de ocho bloques van juntos en un solo apartado, para no llenar el índice', async () => {
      const alcanceBloques = Array.from({ length: 9 }, (_, i) => ({ titulo: `Bloque ${i + 1}`, texto: `Texto ${i + 1}.` }));
      const hojas = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, alcanceBloques }));
      const texto = hojas.join('\n');
      expect(deCorrido(texto)).toContain('2. ALCANCE TÉCNICO');
      expect(texto).toContain('2.1  Bloque 1');
      expect(texto).toContain('2.9  Bloque 9');
      expect(hojas[0]).not.toContain('BLOQUE 1');
    });

    it('lo apagado en «Personalizar» desaparece y el índice se recorre', async () => {
      const opciones = { secciones: { objetivo: false, alcance: false, planos: false, terminos: false } };
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf(
          { ...grupoDice, scope: 'No debe salir.', objetivo: 'Tampoco.', opciones },
          [{ url: '/uploads/no-existe.png', nombre: 'Plano apagado' }],
        ),
      );
      const texto = hojas.join('\n');
      expect(texto).not.toContain('No debe salir.');
      expect(texto).not.toContain('Tampoco.');
      expect(texto).not.toContain('Plano apagado');
      expect(texto).not.toContain('PÓLIZA');
      expect(deCorrido(texto)).toContain('1. PROPUESTA ECONÓMICA DETALLADA');
      // Sin póliza, la garantía se queda en las condiciones.
      expect(texto).toContain('Garantía:');
    });

    it('la póliza dice la garantía una sola vez, y la de instalación solo si se cobra', async () => {
      const soloEquipo = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice)).join('\n');
      expect(deCorrido(soloEquipo)).toContain('PÓLIZA DE GARANTÍAS, EXCLUSIONES Y VIGENCIA COMERCIAL');
      expect(soloEquipo).toContain('Equipos:');
      expect(soloEquipo).not.toContain('Instalación:');
      expect(soloEquipo).not.toContain('Garantía:');
      expect(cuantas(soloEquipo, 'La otorgada por el fabricante.')).toBe(1);
      for (const exclusion of ['Manipulación por terceros:', 'Vandalismo o daño mecánico:', 'Descargas eléctricas y red del inmueble:', 'Caso fortuito o uso indebido:']) {
        expect(soloEquipo).toContain(exclusion);
      }

      const conObra = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, items: [...grupoDice.items, instalacion] })).join('\n');
      expect(conObra).toContain('Instalación:');
      expect(deCorrido(conObra)).toContain('6 meses de garantía');

      // Si quien cotiza ya habló de los trabajos, no se le agrega otra garantía encima.
      const propia = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          items: [...grupoDice.items, instalacion],
          opciones: { condiciones: { garantia: '12 meses sobre los trabajos de mano de obra.' } },
        }),
      ).join('\n');
      expect(deCorrido(propia)).toContain('12 meses sobre los trabajos de mano de obra.');
      expect(deCorrido(propia)).not.toContain('6 meses de garantía');
    });

    it('en licitación mandan las bases: sin póliza', async () => {
      const texto = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, segmento: 'LICITACION' })).join('\n');
      expect(texto).not.toContain('PÓLIZA');
      expect(texto).toContain('Garantía:');
    });

    it('la tabla agrupa con letra; con un solo grupo o con números a mano, no', async () => {
      const it = (name: string, unit: string, model?: string) => ({ name, unit, model, qty: 1, unitPrice: 100, tax: 16 });
      const conGrupos = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          items: [it('Instalación de cámaras', 'Servicio'), it('Cámara domo', 'Pieza', 'DS-2CD'), it('Bobina de cable', 'Rollo')],
        }),
      ).join('\n');
      for (const encabezado of ['Unidad', 'Cant.', 'Concepto / Descripción', 'Modelo / SKU', 'Precio Venta', 'Total Venta', 'TOTAL PROYECTO (MXN)', 'I.V.A. (16%)']) {
        expect(conGrupos).toContain(encabezado);
      }
      expect(conGrupos).toContain('A. EQUIPAMIENTO ACTIVO Y ACCESORIOS');
      expect(conGrupos).toContain('B. INFRAESTRUCTURA Y MATERIALES');
      expect(conGrupos).toContain('C. SERVICIOS DE IMPLEMENTACIÓN Y PUESTA A PUNTO');
      // Equipos primero, aunque se haya capturado al final.
      expect(conGrupos.indexOf('Cámara domo')).toBeLessThan(conGrupos.indexOf('Instalación de cámaras'));

      const unGrupo = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, items: [it('Cámara domo', 'Pieza', 'DS-2CD')] })).join('\n');
      expect(unGrupo).not.toContain('A. EQUIPAMIENTO');

      const aMano = textoPorHoja(
        await generarCotizacionNexaraPdf({
          ...grupoDice,
          items: [
            { ...it('Instalación', 'Servicio'), partida: '1' },
            { ...it('Cámara domo', 'Pieza'), partida: '1.1' },
          ],
        }),
      ).join('\n');
      expect(aMano).not.toContain('A. EQUIPAMIENTO');
      expect(aMano).toContain('1.1 · Cámara domo');
      expect(aMano.indexOf('Instalación')).toBeLessThan(aMano.indexOf('Cámara domo'));
    });

    it('sin ningún modelo no hay columna vacía', async () => {
      const texto = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, items: [{ name: 'Cámara', unit: 'Pieza', qty: 1, unitPrice: 100, tax: 16 }] }),
      ).join('\n');
      expect(texto).not.toContain('Modelo / SKU');
    });

    it('marca y modelo salen en su columna, sin etiquetas repetidas', async () => {
      const texto = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice)).join('\n');
      expect(texto).toContain('MS130-48X');
      expect(texto).toContain('Cisco Meraki');
      expect(texto).not.toContain('Marca:');
      expect(texto).not.toContain('Modelo:');
    });

    it('los totales nunca quedan solos en una hoja: viajan con la última partida', async () => {
      for (const cantidad of [14, 18, 22, 26, 30, 34, 38]) {
        const items = Array.from({ length: cantidad }, (_, i) => ({ name: `Equipo ${i + 1}`, unit: 'Pieza', model: `M-${i + 1}`, qty: 1, unitPrice: 100, tax: 16 }));
        const hojas = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, items }));
        const hojaDeTotales = hojas.find((h) => h.includes('TOTAL PROYECTO (MXN)'))!;
        expect(hojaDeTotales).toContain(`Equipo ${cantidad}`);
      }
    }, 30_000);

    it('un título de grupo nunca queda solo al pie: viaja con su primera partida', async () => {
      const servicio = { name: 'Servicio de instalación especial', description: 'Detalle del servicio.\n'.repeat(12), unit: 'Servicio', qty: 1, unitPrice: 100, tax: 16 };
      for (let cantidad = 6; cantidad < 30; cantidad += 2) {
        const equipos = Array.from({ length: cantidad }, (_, i) => ({ name: `Equipo ${i + 1}`, unit: 'Pieza', qty: 1, unitPrice: 100, tax: 16 }));
        const hojas = textoPorHoja(await generarCotizacionNexaraPdf({ ...grupoDice, items: [...equipos, servicio] }));
        const hoja = hojas.find((h) => h.includes('SERVICIOS DE IMPLEMENTACIÓN Y PUESTA A PUNTO') && !h.includes('Página 1 de'))!;
        expect(hoja).toContain('Servicio de instalación especial');
      }
    }, 30_000);

    it('con un alcance corto la tabla sigue en la misma hoja, y el cierre se queda con ella si cabe', async () => {
      const f = formatoDesdeCotizacion({ ...grupoDice, items: [{ name: 'Switch', unit: 'Pieza', qty: 1, unitPrice: 100, tax: 16 }] });
      const sinAlcance = { ...f, alcance: [], alcanceIntro: [], objetivo: null, garantias: [] };

      const conTerminos = textoPorHoja(await generarCotizacionNexaraPdf(sinAlcance));
      expect(conTerminos).toHaveLength(3);
      expect(conTerminos[1]).toContain('PROPUESTA ECONÓMICA DETALLADA');
      expect(conTerminos[1]).toContain('TOTAL PROYECTO (MXN)');
      expect(conTerminos[2]).toContain('CONDICIONES COMERCIALES');

      const corto = textoPorHoja(await generarCotizacionNexaraPdf({ ...sinAlcance, terminos: [], condicionesPago: '', garantia: '' }));
      expect(corto).toHaveLength(2);
      for (const esperado of ['PROPUESTA ECONÓMICA DETALLADA', 'TOTAL PROYECTO (MXN)', 'CONDICIONES COMERCIALES', 'ATENTAMENTE']) {
        expect(corto[1]).toContain(esperado);
      }
    });

    it('dice en qué página empieza cada parte (la vista previa lleva ahí el PDF)', async () => {
      const secciones: Record<string, number> = {};
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf(
          { ...grupoDice, alcanceBloques: [{ titulo: 'Centro de monitoreo', texto: 'Texto.' }] },
          [],
          secciones,
        ),
      );
      expect(secciones.portada).toBe(1);
      expect(hojas[secciones.objetivo! - 1]).toContain('ALCANCE EJECUTIVO');
      expect(hojas[secciones.alcance! - 1]).toContain('CENTRO DE MONITOREO');
      expect(hojas[secciones.cotizacion! - 1]).toContain('PROPUESTA ECONÓMICA DETALLADA');
    });

    it('en dólares imprime la nota del tipo de cambio', async () => {
      const nota = 'Tipo de cambio DOF del día de pago.';
      const texto = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, currency: 'USD', opciones: { tipoCambioNota: nota } }),
      ).join('\n');
      expect(texto).toContain('dólares americanos (USD)');
      expect(texto).toContain('Tipo de cambio DOF');
      expect(texto).toContain('TOTAL PROYECTO (USD)');
    });

    it('la paginación cuenta las páginas de los planos en PDF', () => {
      // Hoja 4 es la última antes de anexar 2 páginas: la 5 del documento base se imprime como 7.
      expect(paginaImpresa(4, 4, 2)).toBe(4);
      expect(paginaImpresa(5, 4, 2)).toBe(7);
      expect(paginaImpresa(5, 0, 0)).toBe(5);
    });
  });

  it('un plano en PDF (el que de verdad descarga el cliente) anexa sus páginas reales después del apartado de planos', async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-cot-planos-'));
    const planoPdf = await PDFLibDocument.create();
    planoPdf.addPage([1224, 792]).drawText('RED CCTV_IPADE', { x: 40, y: 700, size: 24 });
    fs.writeFileSync(path.join(carpeta, 'plano.pdf'), await planoPdf.save());
    const antes = process.env['UPLOADS_ROOT'];
    process.env['UPLOADS_ROOT'] = carpeta;
    try {
      const planos = [{ url: '/uploads/plano.pdf', nombre: 'RED CCTV_IPADE', tipo: 'pdf' }];
      const secciones: Record<string, number> = {};
      const [conPlano, sinPlano] = await Promise.all([
        generarCotizacionNexaraPdf(grupoDice, planos, secciones),
        generarCotizacionNexaraPdf(grupoDice),
      ]);
      // pdf-lib reescribe el PDF al fusionar: el conteo de páginas se hace con la misma librería.
      const [docCon, docSin] = await Promise.all([PDFLibDocument.load(conPlano), PDFLibDocument.load(sinPlano)]);
      expect(docCon.getPageCount()).toBeGreaterThan(docSin.getPageCount());
      // El plano (tabloide, 1224 pt) queda después de «Planos» y antes de la propuesta económica.
      const anchos = docCon.getPages().map((hoja) => Math.round(hoja.getWidth()));
      const delPlano = anchos.indexOf(1224) + 1;
      expect(delPlano).toBeGreaterThan(secciones.planos!);
      expect(delPlano).toBeLessThan(secciones.cotizacion!);
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
      expect(texto).toContain('SEMBRADO DE CÁMARAS');
      expect(textoPorHoja(sinPlano).join('\n')).not.toContain('SEMBRADO DE CÁMARAS');
      expect(hojas[0]).toContain('PLANOS');

      // El cierre (ATENTAMENTE y firma) va al final de verdad: después del plano, no antes.
      const paginaDelPlano = hojas.findIndex((h) => h.includes('SEMBRADO DE CÁMARAS'));
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

    it('abren la primera hoja interior, arriba del título', async () => {
      const [, primera] = textoPorHoja(await generarCotizacionNexaraPdf(grupoDice));
      const renglones = primera!.split('\n');
      for (const linea of fiscales) expect(renglones).toContain(linea);
      // Se dibujan antes que el título, en el orden pedido.
      const posiciones = [...fiscales, 'MEMORIA DESCRIPTIVA Y PROPUESTA TÉCNICA-ECONÓMICA'].map((linea) => renglones.indexOf(linea));
      expect(posiciones.every((n) => n >= 0)).toBe(true);
      expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    });

    it('las demás hojas no repiten los datos fiscales, solo el folio al pie', async () => {
      const viñetas = Array.from({ length: 80 }, (_, i) => `• Característica ${i + 1}: detalle`).join('\n');
      const hojas = textoPorHoja(
        await generarCotizacionNexaraPdf({ ...grupoDice, items: [{ ...grupoDice.items[0], description: viñetas }] }),
      );
      expect(hojas.length).toBeGreaterThan(1);
      expect(hojas[1]).toContain('RFC: NEE240925V73');
      expect(hojas[0]).not.toContain('RFC: NEE240925V73');
      for (const [i, hoja] of hojas.slice(2).entries()) {
        expect(hoja).not.toContain('RFC: NEE240925V73');
        expect(hoja).not.toContain('Correo electrónico: gerencia@nexara.com.mx');
        expect(hoja).toContain(`${grupoDice.quoteNumber}  ·  Página ${i + 3} de ${hojas.length}`);
      }
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
