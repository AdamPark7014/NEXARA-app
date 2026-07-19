import type PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * NEXARA · Tema PDF corporativo.
 *
 * Replica el lenguaje visual del PDF de cotizaciones (`cotizacion-pdf.ts`)
 * para que TODOS los PDFs del sistema compartan colores, encabezado,
 * tarjetas, tablas y pie de página — cambiando solo el contenido y el
 * acento por módulo.
 */

export const PDF_COLORS = {
  navy: '#0B1F3A',
  blue: '#1F6BBA',
  lightBlue: '#E3F2FD',
  softGray: '#F5F7FB',
  text: '#1F2A37',
  muted: '#5B6B7A',
  line: '#D9E2EC',
  white: '#FFFFFF',
} as const;

/** Acentos por módulo — misma banda/estructura, color distintivo. */
export const PDF_MODULE_ACCENTS = {
  crm: '#1F6BBA', // cotizaciones / ventas (referencia)
  erp: '#0B7285', // finanzas / contabilidad
  viatics: '#B7791F', // viáticos / gastos
  ops: '#C05621', // operaciones / campo
  warehouse: '#6B46C1', // almacén / inventarios
  maintenance: '#2F855A', // mantenimiento / servicio
} as const;

export type PdfModuleAccent = keyof typeof PDF_MODULE_ACCENTS;

export const pdfMoney = (value: number, currency = 'MXN') =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

export const pdfText = (value?: string | number | null) => (value || value === 0 ? String(value) : '-');

export const pdfTruncate = (value: string | null | undefined, maxLength: number) => {
  if (!value) return '-';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

export const loadNexaraLogo = (): Buffer | null => {
  const candidates = [
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
    // Producción (Docker): el API no incluye apps/web — usar assets propios
    path.resolve(process.cwd(), 'dist/assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'src/assets/logo-nexara.png'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch {
      // ignore
    }
  }
  return null;
};

export type PdfHeaderOptions = {
  /** Título del documento, p. ej. "Control de viáticos". */
  docTitle: string;
  /** Línea descriptiva bajo el título. */
  docSubtitle?: string;
  /** Metadatos del lado derecho (Folio, Fecha, Periodo, etc.). */
  meta?: Array<{ label: string; value: string }>;
  /** Color de la barra superior; por defecto azul cotizaciones. */
  accent?: string;
  logo?: Buffer | null;
};

export const PDF_HEADER_HEIGHT = 120;
export const PDF_CONTENT_START_Y = 140;

/** Banda superior idéntica a cotizaciones: fondo azul claro + barra de acento + logo + meta derecha. */
export const drawNexaraHeader = (doc: typeof PDFDocument.prototype, opts: PdfHeaderOptions) => {
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;
  const accent = opts.accent ?? PDF_COLORS.blue;
  const logo = opts.logo === undefined ? loadNexaraLogo() : opts.logo;

  doc.save();
  doc.rect(0, 0, pageWidth, PDF_HEADER_HEIGHT).fill(PDF_COLORS.lightBlue);
  doc.rect(0, 0, pageWidth, 6).fill(accent);
  doc.restore();

  if (logo) {
    try {
      doc.image(logo, margin, 24, { fit: [76, 76] });
    } catch {
      // logo corrupto: continuar sin él
    }
  }

  const nameX = margin + (logo ? 90 : 0);
  doc.fillColor(PDF_COLORS.navy).fontSize(21).font('Helvetica-Bold').text('NEXARA', nameX, 28, { width: 240 });
  doc.fillColor(PDF_COLORS.navy).fontSize(13).font('Helvetica-Bold').text(opts.docTitle, nameX, 56, { width: 260 });
  if (opts.docSubtitle) {
    doc.fontSize(9).font('Helvetica').fillColor(PDF_COLORS.muted).text(opts.docSubtitle, nameX, 74, { width: 260 });
  }

  if (opts.meta?.length) {
    const rightX = margin + contentWidth - 200;
    let metaY = 32;
    doc.fillColor(PDF_COLORS.text).fontSize(10).font('Helvetica');
    for (const line of opts.meta.slice(0, 5)) {
      doc.text(`${line.label}: ${line.value}`, rightX, metaY, { width: 200 });
      metaY += 16;
    }
  }

  doc.y = PDF_CONTENT_START_Y;
};

export const drawSectionTitle = (doc: typeof PDFDocument.prototype, label: string) => {
  const margin = doc.page.margins.left;
  doc.moveDown(0.6);
  doc.fillColor(PDF_COLORS.navy).fontSize(12).font('Helvetica-Bold').text(label, margin, doc.y);
  doc.moveDown(0.2);
};

/** Tarjeta gris suave con pares etiqueta/valor — igual que "Cliente y proyecto". */
export const drawInfoCard = (
  doc: typeof PDFDocument.prototype,
  x: number,
  y: number,
  width: number,
  lines: Array<{ label: string; value: string }>,
  options?: { labelWidth?: number; title?: string },
): number => {
  const padding = 10;
  const labelWidth = options?.labelWidth ?? 90;
  const valueWidth = width - padding * 2 - labelWidth - 2;
  const rowGap = 6;
  const titleHeight = options?.title ? 18 : 0;

  doc.fontSize(10).font('Helvetica');
  const rowHeights = lines.map((line) => {
    const valueHeight = doc.heightOfString(line.value || '-', { width: valueWidth });
    return Math.max(14, valueHeight);
  });
  const contentHeight = rowHeights.reduce((acc, h) => acc + h, 0) + rowGap * Math.max(0, lines.length - 1);
  const height = padding * 2 + titleHeight + contentHeight;

  doc.save();
  doc.roundedRect(x, y, width, height, 8).fill(PDF_COLORS.softGray);
  doc.restore();

  let cursorY = y + padding;
  if (options?.title) {
    doc.fillColor(PDF_COLORS.navy).fontSize(10).font('Helvetica-Bold').text(options.title, x + padding, cursorY, {
      width: width - padding * 2,
    });
    cursorY += titleHeight;
  }
  lines.forEach((line, index) => {
    const rowHeight = rowHeights[index];
    doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica').text(line.label, x + padding, cursorY, {
      width: labelWidth,
    });
    doc.fillColor(PDF_COLORS.text).fontSize(10).font('Helvetica').text(line.value || '-', x + padding + labelWidth + 2, cursorY, {
      width: valueWidth,
    });
    cursorY += rowHeight + rowGap;
  });
  return height;
};

/** Fila de tarjetas KPI (gris suave, valor navy bold) distribuidas a lo ancho. */
export const drawKpiCards = (
  doc: typeof PDFDocument.prototype,
  y: number,
  kpis: Array<{ label: string; value: string; accent?: string }>,
): number => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const gap = 14;
  const count = Math.max(1, kpis.length);
  const cardWidth = (contentWidth - gap * (count - 1)) / count;
  const cardHeight = 54;

  kpis.forEach((kpi, i) => {
    const x = margin + i * (cardWidth + gap);
    doc.save();
    doc.roundedRect(x, y, cardWidth, cardHeight, 8).fill(PDF_COLORS.softGray);
    if (kpi.accent) {
      doc.rect(x, y, 3, cardHeight).fill(kpi.accent);
    }
    doc.restore();
    doc.fillColor(PDF_COLORS.muted).fontSize(8).font('Helvetica').text(kpi.label.toUpperCase(), x + 12, y + 10, {
      width: cardWidth - 24,
    });
    doc.fillColor(PDF_COLORS.navy).fontSize(14).font('Helvetica-Bold').text(kpi.value, x + 12, y + 26, {
      width: cardWidth - 24,
    });
  });

  return cardHeight;
};

/** Caja "Resumen financiero" — misma que cotizaciones, con última fila resaltada opcional. */
export const drawSummaryBox = (
  doc: typeof PDFDocument.prototype,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<[string, string]>,
  options?: { highlightIndex?: number },
): number => {
  const padding = 12;
  const height = padding * 2 + rows.length * 16 + 10;
  doc.save();
  doc.roundedRect(x, y, width, height, 8).fill(PDF_COLORS.softGray);
  doc.restore();

  doc.fillColor(PDF_COLORS.navy).fontSize(11).font('Helvetica-Bold').text(title, x + padding, y + padding);
  let cursorY = y + padding + 16;
  rows.forEach(([label, value], index) => {
    const highlighted = options?.highlightIndex === index;
    doc.font(highlighted ? 'Helvetica-Bold' : 'Helvetica');
    doc.fillColor(highlighted ? PDF_COLORS.navy : PDF_COLORS.text);
    doc.fontSize(10);
    doc.text(label, x + padding, cursorY, { width: width - padding * 2, continued: false });
    doc.text(value, x + padding, cursorY, { align: 'right', width: width - padding * 2 });
    cursorY += 16;
  });
  return height;
};

export type PdfTableColumn = { label: string; width: number; align?: 'left' | 'right' | 'center' };

/** Encabezado de tabla navy con texto blanco — igual que "Conceptos y partidas". */
export const drawTableHeader = (
  doc: typeof PDFDocument.prototype,
  y: number,
  columns: PdfTableColumn[],
  accent?: string,
) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  doc.save();
  doc.rect(margin, y, contentWidth, 24).fill(accent ?? PDF_COLORS.navy);
  doc.restore();

  doc.fillColor(PDF_COLORS.white).fontSize(9).font('Helvetica-Bold');
  let x = margin + 6;
  columns.forEach((col) => {
    doc.text(col.label, x, y + 7, { width: col.width - 8, align: col.align ?? 'left' });
    x += col.width;
  });
};

export type PdfTableContext = {
  columns: PdfTableColumn[];
  /** Se invoca al abrir página nueva (normalmente redibuja el header del documento). */
  onNewPage?: (doc: typeof PDFDocument.prototype) => void;
  headerAccent?: string;
  zebra?: boolean;
  fontSize?: number;
};

/** Garantiza espacio; si no cabe, abre página, redibuja encabezados y tabla. */
export const ensureTableSpace = (
  doc: typeof PDFDocument.prototype,
  neededHeight: number,
  ctx: PdfTableContext,
) => {
  const bottomLimit = doc.page.height - 60;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
    if (ctx.onNewPage) {
      // El callback redibuja encabezado/título y deja doc.y posicionado.
      ctx.onNewPage(doc);
    } else {
      doc.y = doc.page.margins.top;
    }
    drawTableHeader(doc, doc.y, ctx.columns, ctx.headerAccent);
    doc.y += 28;
  }
};

/** Dibuja una fila con zebra striping y avanza doc.y. */
export const drawTableRow = (
  doc: typeof PDFDocument.prototype,
  cells: string[],
  index: number,
  ctx: PdfTableContext,
  options?: { boldColumns?: number[] },
) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const fontSize = ctx.fontSize ?? 9;

  doc.fontSize(fontSize).font('Helvetica');
  const heights = cells.map((cell, i) =>
    doc.heightOfString(cell || '-', { width: ctx.columns[i].width - 8 }),
  );
  const rowHeight = Math.max(...heights, 10) + 10;

  ensureTableSpace(doc, rowHeight + 8, ctx);

  const rowY = doc.y;
  if (ctx.zebra !== false) {
    doc.save();
    doc.rect(margin, rowY - 4, contentWidth, rowHeight).fill(index % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.softGray);
    doc.restore();
  }

  doc.fillColor(PDF_COLORS.text).fontSize(fontSize);
  let x = margin + 6;
  cells.forEach((cell, i) => {
    doc.font(options?.boldColumns?.includes(i) ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(cell || '-', x, rowY, { width: ctx.columns[i].width - 8, align: ctx.columns[i].align ?? 'left' });
    x += ctx.columns[i].width;
  });

  doc.y = rowY + rowHeight;
};

/** Pie de página institucional centrado. */
export const drawNexaraFooter = (doc: typeof PDFDocument.prototype, note?: string) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  // Dentro del margen inferior y sin salto de línea para no disparar página nueva.
  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(PDF_COLORS.muted)
    .text(
      note ?? 'NEXARA · Documento generado automáticamente — información confidencial.',
      margin,
      doc.page.height - doc.page.margins.bottom - 14,
      { align: 'center', width: contentWidth, lineBreak: false },
    );
};
