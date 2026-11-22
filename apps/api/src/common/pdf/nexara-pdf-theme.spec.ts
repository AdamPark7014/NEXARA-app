import PDFDocument from 'pdfkit';
import {
  PDF_CONTENT_START_Y,
  drawInfoCard,
  drawKpiCards,
  drawNexaraFooterOnEveryPage,
  drawNexaraHeader,
  drawSectionTitle,
  drawSummaryBox,
  drawTableHeader,
  drawTableRow,
  pdfCambio,
  pdfFecha,
  pdfFechaHora,
  pdfPeriodo,
  pdfTruncate,
  pdfZona,
  type PdfTableContext,
} from './nexara-pdf-theme';
import { textoPorHoja } from './texto-de-pdf';
import { etiquetaDe, ETIQUETA_ESTATUS_OC, ETIQUETA_ESTATUS_VIATICO } from '../excel/etiquetas';

/** Un documento en memoria y la promesa de sus bytes. */
const documento = (opciones: Record<string, unknown> = {}) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, ...opciones });
  const trozos: Buffer[] = [];
  doc.on('data', (c) => trozos.push(c));
  const bytes = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(trozos))));
  return { doc, bytes };
};

const columnas = [
  { label: 'Folio', width: 100 },
  { label: 'Concepto', width: 315 },
  { label: 'Monto', width: 100, align: 'right' as const },
];

describe('fechas de los documentos', () => {
  it('un día de calendario (medianoche UTC) se escribe tal cual y un instante en la hora de la empresa', () => {
    expect(pdfZona(new Date('2026-11-17T00:00:00.000Z'))).toBe('UTC');
    expect(pdfZona(new Date('2026-11-21T01:30:00.000Z'))).toBe('America/Mexico_City');
    // `@db.Date`: el 17 es el 17, no el 16 a las 6 de la tarde.
    expect(pdfFecha(new Date('2026-11-17T00:00:00.000Z'))).toBe('17/11/2026');
    // 01:30 UTC del 21 son las 7:30 de la tarde del 20 en México.
    expect(pdfFecha(new Date('2026-11-21T01:30:00.000Z'))).toBe('20/11/2026');
    expect(pdfFecha('2026-11-17')).toBe('17/11/2026');
  });

  it('la hora de un movimiento sale en la hora de la empresa, no en UTC', () => {
    const texto = pdfFechaHora('2026-11-21T01:30:00.000Z');
    expect(texto).toContain('20 nov 2026');
    expect(texto).toContain('07:30');
    expect(texto).not.toContain('01:30');
  });

  it('lo que no es una fecha no rompe el documento', () => {
    expect(pdfFecha(null)).toBe('-');
    expect(pdfFecha(undefined)).toBe('-');
    expect(pdfFecha('sin fecha')).toBe('sin fecha');
    expect(pdfFechaHora('')).toBe('-');
    expect(pdfFechaHora(new Date('nada'))).toBe('-');
  });

  it('el periodo se escribe como se lee', () => {
    expect(pdfPeriodo('2026-11-01', '2026-11-21')).toBe('01/11/2026 al 21/11/2026');
    expect(pdfPeriodo('2026-11-21', '2026-11-21')).toBe('21/11/2026');
    expect(pdfPeriodo('2026-11-01T00:00:00.000Z', null)).toBe('Desde 01/11/2026');
    expect(pdfPeriodo(undefined, '2026-11-21')).toBe('Hasta 21/11/2026');
    expect(pdfPeriodo()).toBe('Todos los registros');
    expect(pdfPeriodo(null, null, 'Sin filtro de fechas')).toBe('Sin filtro de fechas');
  });
});

describe('textos de los documentos', () => {
  it('antes y después sin la flecha que la fuente no tiene', () => {
    expect(pdfCambio('SN-1', 'SN-2')).toBe('SN-1 › SN-2');
    expect(pdfCambio('SN-1', 'SN-1')).toBe('SN-1');
    expect(pdfCambio(null, 'SN-2')).toBe('- › SN-2');
    expect(pdfCambio('', undefined)).toBe('-');
  });

  it('recorta con puntos suspensivos de un solo carácter', () => {
    expect(pdfTruncate('Distribuidora Demo de Seguridad', 12)).toBe('Distribuido…');
    expect(pdfTruncate('Corto', 12)).toBe('Corto');
    expect(pdfTruncate(null, 12)).toBe('-');
  });

  it('un valor interno se imprime con su nombre en español, y uno desconocido no sale crudo', () => {
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, 'PARTIALLY_RECEIVED')).toBe('Recibida en parte');
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, 'sent')).toBe('Enviada');
    expect(etiquetaDe(ETIQUETA_ESTATUS_VIATICO, 'Aprobado_Coordinador')).toBe('Aprobado por coordinador');
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, 'ON_REVIEW_QUEUE')).toBe('On review queue');
    // Lo que ya viene escrito para una persona se respeta.
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, 'No cumplida')).toBe('No cumplida');
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, null)).toBe('-');
    expect(etiquetaDe(ETIQUETA_ESTATUS_OC, '  ')).toBe('-');
  });
});

describe('piezas del documento', () => {
  it('ninguna pieza mueve el cursor: quien la llama suma el alto que recibe', async () => {
    const { doc, bytes } = documento();

    doc.y = 200;
    drawTableHeader(doc, 200, columnas);
    expect(doc.y).toBe(200);

    doc.y = 260;
    const altoKpi = drawKpiCards(doc, 260, [
      { label: 'Total', value: '$18,650.00' },
      { label: 'SLA límite', value: '20/11/2026, 06:00 p.m.' },
      { label: 'Resultado', value: 'Fuera de tiempo' },
    ]);
    expect(doc.y).toBe(260);
    expect(altoKpi).toBe(54);

    doc.y = 340;
    const altoTarjeta = drawInfoCard(doc, 40, 340, 250, [
      { label: 'Cliente', value: 'Hotel Demo Puebla, S.A. de C.V.' },
      { label: 'Dirección', value: 'Av. Ejemplo 123, Col. Centro, Puebla, Pue., código postal 72000' },
    ]);
    expect(doc.y).toBe(340);
    expect(altoTarjeta).toBeGreaterThan(48);

    doc.y = 460;
    const altoCaja = drawSummaryBox(doc, 300, 460, 255, 'Resumen', [
      ['Total', '$100.00'],
      ['Pagado', '$40.00'],
    ]);
    expect(doc.y).toBe(460);
    // El mismo alto de siempre cuando cada renglón cabe en una línea.
    expect(altoCaja).toBe(12 * 2 + 2 * 16 + 10);

    doc.end();
    await bytes;
  });

  it('la caja de resumen crece cuando un valor ocupa dos renglones, en vez de tapar su rótulo', async () => {
    const { doc, bytes } = documento();
    const corta = drawSummaryBox(doc, 300, 200, 255, 'Resumen', [['Vigencia', '2026']]);
    const larga = drawSummaryBox(doc, 300, 400, 255, 'Resumen', [
      ['Vigencia', '01 de diciembre de 2026 al 30 de noviembre de 2027, renovable por un año más'],
    ]);
    expect(larga).toBeGreaterThan(corta);
    doc.end();
    await bytes;
  });

  it('el primer renglón queda pegado al encabezado de la tabla', async () => {
    const { doc, bytes } = documento();
    const ctx: PdfTableContext = { columns: columnas };
    doc.y = 200;
    drawTableHeader(doc, doc.y, columnas);
    doc.y += 28;
    drawTableRow(doc, ['AN-1200', 'Mantenimiento de cámaras', '$850.00'], 0, ctx);
    // Banda de 24 desde 200; el renglón (una línea de 9 pt más 10 de aire) termina antes de 250.
    // Con el cursor debajo del rótulo terminaba en 268: una franja en blanco en cada tabla.
    expect(doc.y).toBeGreaterThan(228);
    expect(doc.y).toBeLessThan(252);
    doc.end();
    await bytes;
  });

  it('una palabra más ancha que su columna baja de tamaño y sale entera', async () => {
    const { doc, bytes } = documento();
    // Una columna en la que el folio no cabe a 9 pt pero sí un punto y medio más chico.
    drawTableHeader(doc, 160, columnas);
    const anchoA9 = doc.fontSize(9).widthOfString('MOV20260301');
    const ctx: PdfTableContext = {
      columns: [
        { label: 'Folio', width: Math.ceil(anchoA9 * 0.88) + 8 },
        { label: 'Estatus', width: 300 },
      ],
    };
    doc.y = 200;
    drawTableRow(doc, ['MOV20260301', 'Pendiente'], 0, ctx);
    // Un solo renglón: 9 pt de letra más 10 de aire, no dos.
    expect(doc.y).toBeLessThan(224);
    doc.end();
    const renglones = textoPorHoja(await bytes).join('\n').split('\n');
    // Antes PDFKit la partía a media palabra («MOV202603» / «01»).
    expect(renglones).toContain('MOV20260301');
  });

  it('el encabezado no encima los datos de la derecha cuando uno ocupa dos renglones', async () => {
    const { doc, bytes } = documento();
    drawNexaraHeader(doc, {
      docTitle: 'Reporte de pagos a empleados',
      logo: null,
      meta: [
        { label: 'Periodo', value: 'Semana del 16 al 22 de noviembre de 2026, corte quincenal' },
        { label: 'Generado', value: '21 nov 2026, 06:30 p.m.' },
      ],
    });
    expect(doc.y).toBe(PDF_CONTENT_START_Y);
    doc.end();
    const texto = textoPorHoja(await bytes).join('\n');
    expect(texto.replace(/\s+/g, ' ')).toContain('Generado: 21 nov 2026, 06:30 p.m.');
  });

  it('un título de sección no se queda solo al pie: pasa a la hoja siguiente con su encabezado', async () => {
    const { doc, bytes } = documento();
    drawNexaraHeader(doc, { docTitle: 'Reporte de actividades', logo: null });
    doc.y = doc.page.height - 100;
    drawSectionTitle(doc, 'Detalle de actividades');
    expect(doc.bufferedPageRange().count).toBe(2);
    expect(doc.y).toBeLessThan(PDF_CONTENT_START_Y + 40);

    // Con espacio de sobra se queda en su hoja.
    doc.y = 300;
    drawSectionTitle(doc, 'Resumen');
    expect(doc.bufferedPageRange().count).toBe(2);

    doc.end();
    const hojas = textoPorHoja(await bytes);
    expect(hojas[0]).not.toContain('Detalle de actividades');
    expect(hojas[1]).toContain('Reporte de actividades');
    expect(hojas[1]).toContain('Detalle de actividades');
  });

  it('el pie va en todas las hojas, con su número cuando hay más de una', async () => {
    const { doc, bytes } = documento();
    doc.text('Hoja uno', 40, 100);
    doc.addPage();
    doc.text('Hoja dos', 40, 100);
    doc.addPage();
    doc.text('Hoja tres', 40, 100);
    drawNexaraFooterOnEveryPage(doc, 'NEXARA · Control de viáticos');
    doc.end();
    const hojas = textoPorHoja(await bytes);
    // Ni una hoja de más: el pie se pinta dentro del margen.
    expect(hojas).toHaveLength(3);
    hojas.forEach((hoja, i) => {
      expect(hoja.replace(/\s+/g, ' ')).toContain(`NEXARA · Control de viáticos · Página ${i + 1} de 3`);
    });
  });

  it('un documento de una hoja lleva el pie sin número', async () => {
    const { doc, bytes } = documento();
    doc.text('Única hoja', 40, 100);
    drawNexaraFooterOnEveryPage(doc, 'NEXARA · Orden de venta');
    doc.end();
    const hojas = textoPorHoja(await bytes);
    expect(hojas).toHaveLength(1);
    expect(hojas[0]).toContain('NEXARA · Orden de venta');
    expect(hojas[0]).not.toContain('Página');
  });
});
