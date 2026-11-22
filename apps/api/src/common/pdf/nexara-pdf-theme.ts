import type PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { WORKDAY_TIMEZONE } from '../time/workday.js';

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

/**
 * La zona con la que se escribe una fecha en un documento.
 *
 * El contenedor corre en UTC. Un instante (cuándo se movió el material, cuándo se generó el reporte)
 * se escribe en la hora de la empresa: sin esto, una salida de almacén de las 7:30 de la tarde salía
 * impresa como la 1:30 de la madrugada del día siguiente. Un día de calendario (las columnas
 * `@db.Date`, que llegan como medianoche UTC) se escribe en UTC, o se correría al día anterior.
 */
export const pdfZona = (fecha: Date): string =>
  fecha.getUTCHours() === 0 && fecha.getUTCMinutes() === 0 && fecha.getUTCSeconds() === 0 && fecha.getUTCMilliseconds() === 0
    ? 'UTC'
    : WORKDAY_TIMEZONE;

/** `toLocaleDateString('es-MX', …)` con la zona de `pdfZona`. Lo que no es fecha sale como «-». */
export const pdfFecha = (
  valor: Date | string | null | undefined,
  formato: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string => {
  if (!valor) return '-';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return typeof valor === 'string' ? valor : '-';
  return fecha.toLocaleDateString('es-MX', { ...formato, timeZone: pdfZona(fecha) });
};

/**
 * El periodo de un reporte como lo escribe una persona: «01/11/2026 al 21/11/2026».
 * Antes cada reporte imprimía las fechas del filtro tal cual llegan («2026-11-01 → 2026-11-21»).
 */
export const pdfPeriodo = (desde?: string | null, hasta?: string | null, sinFiltro = 'Todos los registros'): string => {
  const dia = (valor?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? '').trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor ?? '').trim();
  };
  const a = dia(desde);
  const b = dia(hasta);
  if (a && b) return a === b ? a : `${a} al ${b}`;
  if (a) return `Desde ${a}`;
  if (b) return `Hasta ${b}`;
  return sinFiltro;
};

/** Fecha con hora, siempre en la hora de la empresa: una hora solo tiene sentido en un instante. */
export const pdfFechaHora = (
  valor: Date | string | null | undefined,
  formato: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
): string => {
  if (!valor) return '-';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return typeof valor === 'string' ? valor : '-';
  return fecha.toLocaleString('es-MX', { ...formato, timeZone: WORKDAY_TIMEZONE });
};

export const pdfTruncate = (value: string | null | undefined, maxLength: number) => {
  if (!value) return '-';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

/**
 * «Antes › después» de un dato (una serie, un modelo, el almacén de origen y el de destino).
 *
 * La flecha «→» no existe en las fuentes del documento (el corte «latin» de Inter y Montserrat) y salía
 * como un bloque negro; «›» sí está. Si el dato no cambió se escribe una sola vez.
 */
export const pdfCambio = (antes?: string | null, despues?: string | null): string => {
  const a = String(antes ?? '').trim() || '-';
  const b = String(despues ?? '').trim() || '-';
  return a === b ? a : `${a} › ${b}`;
};

/** Primer archivo legible de la lista, o `null`. */
const leerPrimero = (candidates: string[]): Buffer | null => {
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch {
      // ignore
    }
  }
  return null;
};

/**
 * Archivo de `src/assets` (copiado a `dist/assets` por `nest-cli.json`).
 *
 * Se busca primero junto al código compilado (dist/common/pdf → dist/assets; en dev
 * src/common/pdf → src/assets). En Docker el cwd es /app y el build vive en /app/apps/api/dist: las
 * rutas relativas al cwd solo sirven de respaldo para scripts y pruebas.
 */
export const loadPdfAsset = (nombre: string): Buffer | null =>
  leerPrimero([
    path.resolve(__dirname, '../../assets', nombre),
    path.resolve(process.cwd(), 'dist/assets', nombre),
    path.resolve(process.cwd(), 'src/assets', nombre),
    path.resolve(process.cwd(), 'apps/api/dist/assets', nombre),
    path.resolve(process.cwd(), 'apps/api/src/assets', nombre),
  ]);

/**
 * Tipografía corporativa: Montserrat para títulos y la marca, Inter para texto, tablas y etiquetas.
 * Ambas con licencia SIL Open Font License 1.1 (texto en `src/assets/fonts/OFL-*.txt`), que permite
 * embeberlas en documentos. Son los cortes «latin» de Fontsource 5.3.0 (@fontsource/montserrat e
 * @fontsource/inter): cubren el español completo (acentos, ñ, ¿¡, °, «», —, €) y PDFKit solo embebe
 * los glifos que se usan.
 *
 * Van en TTF y no en el WOFF original: fontkit 1.x vuelve a descomprimir la tabla `glyf` del WOFF en
 * cada glifo que lee, y la propuesta pasaba de ~35 ms a ~500 ms. El TTF es el mismo archivo con las
 * tablas descomprimidas (fontTools, sin cambiar un solo contorno).
 */
export const PDF_FUENTES = {
  titulo: 'NX-Montserrat-SemiBold',
  tituloFuerte: 'NX-Montserrat-Bold',
  marca: 'NX-Montserrat-Medium',
  texto: 'NX-Inter-Regular',
  medio: 'NX-Inter-Medium',
  semi: 'NX-Inter-SemiBold',
  fuerte: 'NX-Inter-Bold',
} as const;

export type PdfFuente = (typeof PDF_FUENTES)[keyof typeof PDF_FUENTES];

/** Archivo de cada fuente y la estándar que la sustituye si el archivo falta o no se puede leer. */
const ARCHIVOS_FUENTE: Record<keyof typeof PDF_FUENTES, [string, string]> = {
  titulo: ['montserrat-latin-600-normal.ttf', 'Helvetica-Bold'],
  tituloFuerte: ['montserrat-latin-700-normal.ttf', 'Helvetica-Bold'],
  marca: ['montserrat-latin-500-normal.ttf', 'Helvetica'],
  texto: ['inter-latin-400-normal.ttf', 'Helvetica'],
  medio: ['inter-latin-500-normal.ttf', 'Helvetica'],
  semi: ['inter-latin-600-normal.ttf', 'Helvetica-Bold'],
  fuerte: ['inter-latin-700-normal.ttf', 'Helvetica-Bold'],
};

/** Los bytes de cada fuente se leen de disco una sola vez por proceso. */
const fuentesEnCache = new Map<string, Buffer | null>();

/** TrueType u OpenType por su firma: lo que no la trae no se le pasa a PDFKit. */
const esFuente = (bytes: Buffer | null): bytes is Buffer => {
  if (!bytes || bytes.length < 1024) return false;
  const firma = bytes.readUInt32BE(0);
  return firma === 0x00010000 || firma === 0x4f54544f /* OTTO */ || firma === 0x74727565 /* true */;
};

/**
 * Registra en el documento las fuentes corporativas con los nombres de `PDF_FUENTES`.
 *
 * Registrar no abre nada: PDFKit lee y embebe solo las que el documento usa. Si un archivo falta
 * (por ejemplo, un build que no copió `assets/fonts`), ese nombre apunta a Helvetica y el documento
 * sale igual. Devuelve `true` si todas son las corporativas.
 */
export const registrarFuentesCorporativas = (doc: typeof PDFDocument.prototype): boolean => {
  let todas = true;
  for (const clave of Object.keys(PDF_FUENTES) as Array<keyof typeof PDF_FUENTES>) {
    const nombre = PDF_FUENTES[clave];
    const [archivo, respaldo] = ARCHIVOS_FUENTE[clave];
    let bytes = fuentesEnCache.get(archivo);
    if (bytes === undefined) {
      bytes = loadPdfAsset(`fonts/${archivo}`);
      if (!esFuente(bytes)) bytes = null;
      fuentesEnCache.set(archivo, bytes);
    }
    if (bytes) {
      doc.registerFont(nombre, bytes);
    } else {
      todas = false;
      doc.registerFont(nombre, respaldo);
    }
  }
  return todas;
};

/** Documentos a los que ya se les registraron las fuentes. */
const documentosConFuentes = new WeakSet<object>();

/**
 * Nombre de fuente corporativa listo para `doc.font(...)`, registrando en el
 * documento la primera vez que se le pide una.
 *
 * Existe porque registrar era responsabilidad de cada generador y solo uno de
 * los veinte se acordaba: el resto salia en Helvetica pese a llevar Montserrat
 * e Inter embebidas. Pedir la fuente y registrarla son ahora la misma cosa, asi
 * que no hay forma de olvidarlo.
 */
export const fuente = (doc: typeof PDFDocument.prototype, clave: keyof typeof PDF_FUENTES): string => {
  if (!documentosConFuentes.has(doc)) {
    documentosConFuentes.add(doc);
    registrarFuentesCorporativas(doc);
  }
  return PDF_FUENTES[clave];
};

export const loadNexaraLogo = (): Buffer | null =>
  loadPdfAsset('logo-nexara.png') ??
  leerPrimero([
    path.resolve(process.cwd(), '../web/public/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
  ]);

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

/** El último encabezado que se pintó en cada documento: con él se abre la página siguiente. */
const encabezadoDe = new WeakMap<object, PdfHeaderOptions>();

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
  doc.fillColor(PDF_COLORS.navy).fontSize(21).font(fuente(doc, 'tituloFuerte')).text('NEXARA', nameX, 28, { width: 240 });
  doc.fillColor(PDF_COLORS.navy).fontSize(13).font(fuente(doc, 'titulo'));
  // Un título de dos renglones empuja al subtítulo en vez de quedar debajo de él.
  const altoTitulo = doc.heightOfString(opts.docTitle, { width: 260 });
  doc.text(opts.docTitle, nameX, 56, { width: 260 });
  if (opts.docSubtitle) {
    doc
      .fontSize(9)
      .font(fuente(doc, 'texto'))
      .fillColor(PDF_COLORS.muted)
      .text(opts.docSubtitle, nameX, 56 + Math.max(18, altoTitulo + 2), { width: 260, height: 24, ellipsis: true });
  }

  if (opts.meta?.length) {
    const rightX = margin + contentWidth - 200;
    const lineas = opts.meta.slice(0, 5).map((line) => `${line.label}: ${line.value}`);
    // Cada renglón baja lo que mide el anterior: «Periodo: Semana del 16 al 22 de noviembre de 2026»
    // ocupa dos y antes el siguiente se le pintaba encima. Si no caben en la banda, letra un punto menor.
    doc.font(fuente(doc, 'texto'));
    const medir = (tam: number) => {
      doc.fontSize(tam);
      return lineas.map((texto) => Math.max(tam + 6, doc.heightOfString(texto, { width: 200 }) + 3));
    };
    let tam = 10;
    let altos = medir(tam);
    if (altos.reduce((a, b) => a + b, 0) > PDF_HEADER_HEIGHT - 32 - 6) {
      tam = 9;
      altos = medir(tam);
    }
    let metaY = 32;
    doc.fillColor(PDF_COLORS.text).fontSize(tam);
    lineas.forEach((texto, i) => {
      doc.text(texto, rightX, metaY, { width: 200 });
      metaY += altos[i];
    });
  }

  encabezadoDe.set(doc, opts);
  doc.y = PDF_CONTENT_START_Y;
};

/** Lo que ocupa un título con el encabezado de su tabla y un renglón: menos que eso, y el título se queda solo. */
const ESPACIO_BAJO_TITULO = 92;

export const drawSectionTitle = (doc: typeof PDFDocument.prototype, label: string) => {
  const margin = doc.page.margins.left;
  // Un título no se queda huérfano al pie de la hoja, con su tabla empezando en la siguiente:
  // si debajo no cabe ni un renglón, pasa él también, bajo el mismo encabezado.
  const encabezado = encabezadoDe.get(doc);
  if (encabezado && doc.y > PDF_CONTENT_START_Y + 1 && doc.y + ESPACIO_BAJO_TITULO > doc.page.height - 60) {
    doc.addPage();
    drawNexaraHeader(doc, encabezado);
  }
  doc.moveDown(0.6);
  doc.fillColor(PDF_COLORS.navy).fontSize(12).font(fuente(doc, 'titulo')).text(label, margin, doc.y);
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

  doc.font(fuente(doc, 'texto'));
  const rowHeights = lines.map((line) => {
    const valueHeight = doc.fontSize(10).heightOfString(line.value || '-', { width: valueWidth });
    const labelHeight = doc.fontSize(9).heightOfString(line.label || ' ', { width: labelWidth });
    return Math.max(14, valueHeight, labelHeight);
  });
  const contentHeight = rowHeights.reduce((acc, h) => acc + h, 0) + rowGap * Math.max(0, lines.length - 1);
  const height = padding * 2 + titleHeight + contentHeight;

  doc.save();
  doc.roundedRect(x, y, width, height, 8).fill(PDF_COLORS.softGray);
  doc.restore();

  let cursorY = y + padding;
  if (options?.title) {
    doc.fillColor(PDF_COLORS.navy).fontSize(10).font(fuente(doc, 'semi')).text(options.title, x + padding, cursorY, {
      width: width - padding * 2,
    });
    cursorY += titleHeight;
  }
  lines.forEach((line, index) => {
    const rowHeight = rowHeights[index];
    doc.fillColor(PDF_COLORS.muted).fontSize(9).font(fuente(doc, 'texto')).text(line.label, x + padding, cursorY, {
      width: labelWidth,
    });
    doc.fillColor(PDF_COLORS.text).fontSize(10).font(fuente(doc, 'texto')).text(line.value || '-', x + padding + labelWidth + 2, cursorY, {
      width: valueWidth,
    });
    cursorY += rowHeight + rowGap;
  });
  // El cursor vuelve a donde estaba: quien llama suma el alto que se le devuelve. Antes quedaba al
  // final del último renglón y, al sumarle el alto, debajo de cada tarjeta se abría un hueco de su tamaño.
  doc.y = y;
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
    doc.fillColor(PDF_COLORS.muted).fontSize(8).font(fuente(doc, 'medio')).text(kpi.label.toUpperCase(), x + 12, y + 10, {
      width: cardWidth - 24,
      height: 10,
      ellipsis: true,
    });
    // Un valor largo («20/11/2026, 06:00 p. m.») baja de tamaño hasta caber en un renglón: en dos se salía de la tarjeta.
    const anchoValor = cardWidth - 24;
    doc.font(fuente(doc, 'titulo'));
    let tam = 14;
    while (tam > 9 && doc.fontSize(tam).widthOfString(kpi.value) > anchoValor) tam -= 0.5;
    doc.fillColor(PDF_COLORS.navy).fontSize(tam).text(kpi.value, x + 12, y + 26 + (14 - tam) * 0.6, {
      width: anchoValor,
      height: tam * 1.4,
      ellipsis: true,
    });
  });

  doc.y = y;
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
  const ancho = width - padding * 2;
  // Cada renglón reparte el ancho entre rótulo y valor y mide lo que ocupa: antes los dos se pintaban
  // a todo lo ancho y un valor largo (una vigencia con las dos fechas escritas) tapaba su rótulo.
  doc.fontSize(10);
  const medidas = rows.map(([label, value], index) => {
    doc.font(fuente(doc, options?.highlightIndex === index ? 'semi' : 'texto'));
    const anchoRotulo = Math.min(doc.widthOfString(label) + 2, ancho * 0.55);
    const anchoValor = ancho - anchoRotulo - 10;
    const alto = Math.max(
      doc.heightOfString(label || ' ', { width: anchoRotulo }),
      doc.heightOfString(value || '-', { width: anchoValor }),
    );
    return { anchoRotulo, anchoValor, alto: Math.max(16, alto + 3) };
  });
  const height = padding * 2 + 10 + medidas.reduce((suma, m) => suma + m.alto, 0);
  doc.save();
  doc.roundedRect(x, y, width, height, 8).fill(PDF_COLORS.softGray);
  doc.restore();

  doc.fillColor(PDF_COLORS.navy).fontSize(11).font(fuente(doc, 'semi')).text(title, x + padding, y + padding, {
    width: ancho,
    height: 14,
    ellipsis: true,
  });
  let cursorY = y + padding + 16;
  rows.forEach(([label, value], index) => {
    const highlighted = options?.highlightIndex === index;
    const { anchoRotulo, anchoValor, alto } = medidas[index];
    doc.font(fuente(doc, highlighted ? 'semi' : 'texto'));
    doc.fillColor(highlighted ? PDF_COLORS.navy : PDF_COLORS.text);
    doc.fontSize(10);
    doc.text(label, x + padding, cursorY, { width: anchoRotulo });
    doc.text(value || '-', x + padding + ancho - anchoValor, cursorY, { align: 'right', width: anchoValor });
    cursorY += alto;
  });
  doc.y = y;
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

  doc.fillColor(PDF_COLORS.white).font(fuente(doc, 'semi'));
  let x = margin + 6;
  columns.forEach((col) => {
    // El rótulo va en un renglón: si no cabe, baja de tamaño (antes «Rechazado» se partía en «Rechazad / o»).
    const ancho = col.width - 8;
    let tam = 9;
    while (tam > 7 && doc.fontSize(tam).widthOfString(col.label) > ancho) tam -= 0.5;
    doc.fontSize(tam).text(col.label, x, y + 7 + (9 - tam) * 0.6, {
      width: ancho,
      align: col.align ?? 'left',
      height: tam * 1.4,
      ellipsis: true,
    });
    x += col.width;
  });
  // El cursor vuelve al borde superior de la banda: quien llama baja 28 y el primer renglón queda
  // pegado a ella. Antes quedaba debajo del texto y esos 28 abrían una franja en blanco en cada tabla.
  doc.y = y;
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

  // Cada celda se mide con la fuente con que se pinta. Una palabra más ancha que su columna (un folio,
  // un estatus) baja de tamaño hasta caber: PDFKit la partía a media palabra («PENDIEN / TE»).
  const fuenteDe = (i: number) => fuente(doc, options?.boldColumns?.includes(i) ? 'semi' : 'texto');
  const tamanos = cells.map((cell, i) => {
    const ancho = ctx.columns[i].width - 8;
    const palabras = String(cell || '-').split(/\s+/).filter(Boolean);
    doc.font(fuenteDe(i));
    let tam = fontSize;
    while (tam > 6.5 && palabras.some((palabra) => doc.fontSize(tam).widthOfString(palabra) > ancho)) tam -= 0.5;
    return tam;
  });
  const heights = cells.map((cell, i) =>
    doc.font(fuenteDe(i)).fontSize(tamanos[i]).heightOfString(cell || '-', { width: ctx.columns[i].width - 8 }),
  );
  const rowHeight = Math.max(...heights, 10) + 10;

  ensureTableSpace(doc, rowHeight + 8, ctx);

  const rowY = doc.y;
  if (ctx.zebra !== false) {
    doc.save();
    doc.rect(margin, rowY - 4, contentWidth, rowHeight).fill(index % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.softGray);
    doc.restore();
  }

  doc.fillColor(PDF_COLORS.text);
  let x = margin + 6;
  cells.forEach((cell, i) => {
    doc.font(fuenteDe(i)).fontSize(tamanos[i]);
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
    .font(fuente(doc, 'texto'))
    .fillColor(PDF_COLORS.muted)
    .text(
      note ?? 'NEXARA · Documento generado automáticamente — información confidencial.',
      margin,
      doc.page.height - doc.page.margins.bottom - 14,
      { align: 'center', width: contentWidth, lineBreak: false },
    );
};

/**
 * El pie en TODAS las hojas, con «Página 2 de 3» cuando el documento tiene más de una.
 *
 * Se llama una sola vez, justo antes de `doc.end()`, en un documento creado con `bufferPages: true`
 * (sin eso PDFKit ya soltó las hojas anteriores y solo se alcanza la última). Antes cada reporte ponía
 * el pie únicamente en su última hoja y ninguna llevaba número: con tres hojas impresas no había forma
 * de saber si estaban completas.
 */
export const drawNexaraFooterOnEveryPage = (doc: typeof PDFDocument.prototype, note?: string) => {
  const base = note ?? 'NEXARA · Documento generado automáticamente — información confidencial.';
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    drawNexaraFooter(doc, paginas.count > 1 ? `${base} · Página ${i + 1} de ${paginas.count}` : base);
  }
};
