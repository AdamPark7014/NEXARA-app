import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import {
  PDF_COLORS,
  PDF_HEADER_HEIGHT,
  PDF_MODULE_ACCENTS,
  drawInfoCard,
  drawKpiCards,
  drawNexaraHeader,
  fuente,
  loadNexaraLogo,
} from '../common/pdf/nexara-pdf-theme.js';

/**
 * Cotización comercial — PDF producción.
 *
 * Usa el tema corporativo (`nexara-pdf-theme`): banda superior, tarjetas de
 * resumen, tipografía Montserrat/Inter y acento CRM. Encima de eso conserva lo
 * propio de un documento que sí va al cliente — datos fiscales del emisor,
 * tabla de partidas de altura variable con paginado y número de página,
 * garantías, exclusiones y firmas.
 *
 * Las tres tarjetas de arriba (total, anticipo, entrega) existen porque quien
 * abre una cotización busca esas tres cosas, y antes estaban al pie en letra de
 * 8 pt.
 */

export type CotizacionPdfItem = {
  category?: string | null;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  batchReference?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  unitCost?: number | null;
  marginPercent?: number | null;
  discount: number;
  tax: number;
  ieps?: number;
  retention?: number;
  laborHours?: number;
  laborRate?: number;
  warrantyMonths?: number;
  deliveryTime?: string | null;
  lineTotal: number;
};

export type CotizacionPdfCompany = {
  legalName: string;
  tradeName?: string | null;
  rfc?: string | null;
  fiscalAddress?: string | null;
  fiscalPostalCode?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
};

export type CotizacionPdfPayload = {
  quoteNumber: string;
  issueDate: string;
  validUntil?: string | null;
  status: string;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  projectName?: string | null;
  scope?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  preparedBy?: string | null;
  preparedRole?: string | null;
  currency: string;
  depositPercent: number;
  note?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal?: number;
  retentionTotal?: number;
  total: number;
  company?: CotizacionPdfCompany | null;
  items: CotizacionPdfItem[];
};

export type CotizacionPdfOptions = {
  /** Incluye costo proveedor y margen — no enviar al cliente. */
  internal?: boolean;
};

const FALLBACK_COMPANY = {
  name: 'NEXARA',
  tagline: 'Integración tecnológica · CCTV · Redes · Soporte TI',
  web: 'sales.nexara.com.mx',
  email: 'ventas@nexara.com.mx',
};

const ACCENT = PDF_MODULE_ACCENTS.crm;

const COLORS = {
  navy: '#0B1F3A',
  teal: ACCENT,
  accent: ACCENT,
  text: '#1E293B',
  muted: '#64748B',
  line: '#CBD5E1',
  fill: '#F8FAFC',
  soft: '#E8F1FB',
  white: '#FFFFFF',
};

const MARGIN = 44;
const FOOTER_ZONE = 40;
const TABLE_HEADER_H = 24;
const ROW_PAD = 5;

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDisplayDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    SENT: 'Enviada',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
    EXPIRED: 'Vencida',
  };
  return map[status] || status;
};

const DEFAULT_EXCLUSIONS = [
  'Obra civil, canalización, postes, bases y demoliciones no descritas en el alcance.',
  'Permisos municipales, prediales o de terceros no listados.',
  'Consumibles eléctricos adicionales no especificados en partidas.',
  'Equipos o licencias de terceros no incluidos explícitamente.',
];

const DEFAULT_WARRANTY = [
  'Equipos: garantía del fabricante (mínimo 12 meses salvo indicación por partida).',
  'Instalación Nexara: 90 días sobre mano de obra ejecutada por nuestro personal.',
  'No aplica por mal uso, daños de terceros o falta de mantenimiento.',
];

const loadCompanyLogo = (): Buffer | null => {
  const fromTheme = loadNexaraLogo();
  if (fromTheme) return fromTheme;
  const candidates = [
    path.resolve(__dirname, '../assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'src/assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'dist/assets/logo-nexara.png'),
    path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'),
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

const brandName = (company?: CotizacionPdfCompany | null) =>
  company?.tradeName || company?.legalName || FALLBACK_COMPANY.name;

const resolveCompany = (company?: CotizacionPdfCompany | null): CotizacionPdfCompany => ({
  legalName: company?.legalName || FALLBACK_COMPANY.name,
  tradeName: company?.tradeName || FALLBACK_COMPANY.name,
  rfc: company?.rfc || null,
  fiscalAddress: company?.fiscalAddress || null,
  fiscalPostalCode: company?.fiscalPostalCode || null,
  contactEmail: company?.contactEmail || FALLBACK_COMPANY.email,
  contactPhone: company?.contactPhone || null,
  websiteUrl: company?.websiteUrl || FALLBACK_COMPANY.web,
});

type PdfCtx = {
  doc: PDFKit.PDFDocument;
  margin: number;
  contentWidth: number;
  pageWidth: number;
  pageHeight: number;
  pageBottom: number;
  pageNo: number;
  logo: Buffer | null;
  companyShort: string;
};

const resetCursor = (doc: PDFKit.PDFDocument, x: number, y: number) => {
  doc.x = x;
  doc.y = y;
};

/** Texto acotado: evita que PDFKit inserte páginas en blanco por desbordamiento. */
const boundedText = (
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: {
    width: number;
    height?: number;
    align?: 'left' | 'right' | 'center' | 'justify';
    ellipsis?: boolean;
    lineGap?: number;
  },
): number => {
  const h = opts.height ?? doc.heightOfString(text, { width: opts.width, lineGap: opts.lineGap });
  doc.save();
  doc.rect(x, y, opts.width, h).clip();
  doc.text(text, x, y, {
    width: opts.width,
    height: h,
    align: opts.align,
    ellipsis: opts.ellipsis ?? false,
    lineGap: opts.lineGap,
  });
  doc.restore();
  resetCursor(doc, x, y + h);
  return h;
};

const pageBottom = (doc: PDFKit.PDFDocument) => doc.page.height - FOOTER_ZONE;

const drawFooter = (ctx: PdfCtx, quoteNumber: string) => {
  const { doc, margin, contentWidth, pageHeight, pageNo, companyShort } = ctx;
  const y = pageHeight - 28;
  doc.save();
  doc.moveTo(margin, y - 8).lineTo(margin + contentWidth, y - 8).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  doc.restore();
  doc.fillColor(COLORS.muted).font(fuente(doc, 'texto')).fontSize(8);
  boundedText(doc, `${companyShort} · Cotización ${quoteNumber} · Documento comercial`, margin, y, {
    width: contentWidth * 0.72,
    height: 10,
    ellipsis: true,
  });
  boundedText(doc, `Página ${pageNo}`, margin, y, { width: contentWidth, height: 10, align: 'right' });
};

const startContinuationPage = (ctx: PdfCtx): number => {
  const { doc, margin, logo, companyShort } = ctx;
  doc.save();
  doc.rect(0, 0, ctx.pageWidth, 4).fill(COLORS.accent);
  doc.restore();
  if (logo) {
    try {
      doc.image(logo, margin, 12, { fit: [44, 44] });
    } catch {
      // ignore
    }
  }
  doc.fillColor(COLORS.navy).font(fuente(doc, 'titulo')).fontSize(11).text(companyShort, margin + (logo ? 52 : 0), 16);
  doc
    .fillColor(COLORS.muted)
    .font(fuente(doc, 'texto'))
    .fontSize(8)
    .text('Cotización comercial (continuación)', margin + (logo ? 52 : 0), 30);
  // El logo ocupa hasta y=56: arrancar el contenido en 52 metía la tabla y los
  // títulos por debajo de él.
  return 70;
};

const addPage = (ctx: PdfCtx, quoteNumber: string): number => {
  drawFooter(ctx, quoteNumber);
  ctx.doc.addPage();
  ctx.pageNo += 1;
  const y = startContinuationPage(ctx);
  resetCursor(ctx.doc, ctx.margin, y);
  return y;
};

const ensureY = (ctx: PdfCtx, y: number, needed: number, quoteNumber: string): number => {
  if (y + needed <= ctx.pageBottom) return y;
  return addPage(ctx, quoteNumber);
};

/** Línea fiscal del emisor bajo la banda — lo que obliga a llevar un documento comercial. */
const drawFiscalLine = (ctx: PdfCtx, company: CotizacionPdfCompany, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  const partes = [
    company.legalName,
    company.rfc ? `RFC ${company.rfc}` : null,
    company.fiscalAddress
      ? [company.fiscalAddress, company.fiscalPostalCode ? `C.P. ${company.fiscalPostalCode}` : null]
          .filter(Boolean)
          .join(', ')
      : null,
    company.contactPhone,
    company.contactEmail,
    company.websiteUrl,
  ].filter(Boolean) as string[];
  if (!partes.length) return y;

  const texto = partes.join('  ·  ');
  doc.fillColor(COLORS.muted).font(fuente(doc, 'texto')).fontSize(8);
  const h = doc.heightOfString(texto, { width: contentWidth });
  boundedText(doc, texto, margin, y, { width: contentWidth, height: h });
  return y + h + 14;
};

const drawLetterhead = (ctx: PdfCtx, payload: CotizacionPdfPayload): number => {
  const { doc, margin, contentWidth, logo } = ctx;
  const company = resolveCompany(payload.company);

  // Banda superior del tema: misma que el resto de documentos NEXARA.
  drawNexaraHeader(doc, {
    docTitle: 'Cotización',
    docSubtitle: payload.projectName || 'Propuesta comercial',
    accent: COLORS.accent,
    logo,
    meta: [
      { label: 'Folio', value: payload.quoteNumber },
      { label: 'Emisión', value: formatDisplayDate(payload.issueDate) },
      { label: 'Vigencia', value: formatDisplayDate(payload.validUntil) },
      { label: 'Estatus', value: statusLabel(payload.status) },
    ],
  });

  let y = drawFiscalLine(ctx, company, PDF_HEADER_HEIGHT + 16);

  // ── Lo que se busca al abrir una cotización ───────────────────────────
  y = drawSection(ctx, y, 'Resumen de la propuesta', payload.quoteNumber);
  const tarjetas: Array<{ label: string; value: string; accent?: string }> = [
    { label: `Total (${payload.currency || 'MXN'})`, value: formatMoney(payload.total, payload.currency), accent: COLORS.accent },
  ];
  if (payload.depositPercent > 0) {
    tarjetas.push({
      label: `Anticipo para iniciar (${payload.depositPercent}%)`,
      value: formatMoney((payload.total * payload.depositPercent) / 100, payload.currency),
      accent: '#2F855A',
    });
  }
  tarjetas.push({
    label: 'Tiempo de entrega',
    value: payload.deliveryTime || 'Según partidas',
    accent: PDF_COLORS.blue,
  });
  y += drawKpiCards(doc, y, tarjetas) + 20;

  // ── Cliente y condiciones, en fichas ──────────────────────────────────
  const colW = (contentWidth - 16) / 2;

  const clienteLineas: Array<{ label: string; value: string }> = [
    { label: 'Cliente', value: payload.clientCompany || payload.clientName || '—' },
  ];
  if (payload.clientName && payload.clientCompany) {
    clienteLineas.push({ label: 'Atención', value: payload.clientName });
  }
  if (payload.clientEmail) clienteLineas.push({ label: 'Correo', value: payload.clientEmail });
  if (payload.clientPhone) clienteLineas.push({ label: 'Teléfono', value: payload.clientPhone });
  if (payload.clientAddress) clienteLineas.push({ label: 'Dirección', value: payload.clientAddress });

  const condicionesLineas: Array<{ label: string; value: string }> = [];
  if (payload.projectName) condicionesLineas.push({ label: 'Proyecto', value: payload.projectName });
  if (payload.scope) condicionesLineas.push({ label: 'Alcance', value: payload.scope });
  condicionesLineas.push({ label: 'Pago', value: payload.paymentTerms || 'Según acuerdo comercial' });
  condicionesLineas.push({ label: 'Entrega', value: payload.deliveryTime || 'Según partidas' });
  if (payload.depositPercent > 0) {
    condicionesLineas.push({ label: 'Anticipo', value: `${payload.depositPercent}%` });
  }
  condicionesLineas.push({ label: 'Moneda', value: payload.currency || 'MXN' });

  const hCliente = drawInfoCard(doc, margin, y, colW, clienteLineas, { title: 'Dirigida a', labelWidth: 62 });
  const hCond = drawInfoCard(doc, margin + colW + 16, y, colW, condicionesLineas, {
    title: 'Condiciones',
    labelWidth: 62,
  });
  y += Math.max(hCliente, hCond) + 18;

  return drawSection(ctx, y, 'Detalle de partidas', payload.quoteNumber);
};

type TableCol = { key: string; label: string; width: number; align: 'left' | 'right' | 'center' };

const BASE_TABLE_COLS: TableCol[] = [
  { key: 'num', label: '#', width: 22, align: 'center' },
  { key: 'desc', label: 'Descripción', width: 230, align: 'left' },
  { key: 'qty', label: 'Cant.', width: 36, align: 'center' },
  { key: 'unit', label: 'UdM', width: 34, align: 'center' },
  { key: 'price', label: 'P. venta neto', width: 72, align: 'right' },
  { key: 'tax', label: 'IVA', width: 36, align: 'center' },
  { key: 'total', label: 'Importe', width: 74, align: 'right' },
];

const scaleTableCols = (contentWidth: number): TableCol[] => {
  const sum = BASE_TABLE_COLS.reduce((a, c) => a + c.width, 0);
  const factor = contentWidth / sum;
  return BASE_TABLE_COLS.map((col) => ({ ...col, width: Math.floor(col.width * factor) }));
};

const drawTableHeader = (ctx: PdfCtx, y: number, cols: TableCol[]): number => {
  const { doc, margin } = ctx;
  doc.save();
  doc.rect(margin, y, ctx.contentWidth, TABLE_HEADER_H).fill(COLORS.navy);
  doc.restore();
  doc.fillColor(COLORS.white).font(fuente(doc, 'semi')).fontSize(8.5);
  let x = margin + 3;
  for (const col of cols) {
    doc.text(col.label, x, y + 7, { width: col.width - 4, align: col.align });
    x += col.width;
  }
  return y + TABLE_HEADER_H + 3;
};

const itemDescription = (item: CotizacionPdfItem) => {
  const meta = [item.brand, item.model, item.sku ? `SKU ${item.sku}` : null].filter(Boolean).join(' · ');
  const desc = item.description?.trim();
  return [item.name, meta || null, desc || null].filter(Boolean).join('\n');
};

const measureRow = (ctx: PdfCtx, item: CotizacionPdfItem, cols: TableCol[]): number => {
  const { doc } = ctx;
  doc.font(fuente(doc, 'texto')).fontSize(9);
  const descH = doc.heightOfString(itemDescription(item), { width: cols[1].width - 6 });
  return Math.max(28, descH + ROW_PAD * 2);
};

const drawTableRow = (
  ctx: PdfCtx,
  y: number,
  item: CotizacionPdfItem,
  index: number,
  currency: string,
  stripe: boolean,
  cols: TableCol[],
): number => {
  const { doc, margin } = ctx;
  const rowH = measureRow(ctx, item, cols);

  if (stripe) {
    doc.save();
    doc.rect(margin, y - 1, ctx.contentWidth, rowH).fill(COLORS.fill);
    doc.restore();
  }

  const cells = [
    String(index + 1),
    itemDescription(item),
    String(item.qty),
    item.unit || 'PZA',
    formatMoney(item.unitPrice, currency),
    `${item.tax || 0}%`,
    formatMoney(item.lineTotal, currency),
  ];

  let x = margin + 3;
  cells.forEach((cell, i) => {
    const col = cols[i];
    if (i === 0 || i === 3 || i === 5) doc.font(fuente(doc, 'texto')).fontSize(8.5).fillColor(COLORS.muted);
    else if (i === 1) doc.font(fuente(doc, 'texto')).fontSize(9).fillColor(COLORS.text);
    else if (i === 6) doc.font(fuente(doc, 'semi')).fontSize(9).fillColor(COLORS.navy);
    else doc.font(fuente(doc, 'texto')).fontSize(9).fillColor(COLORS.text);
    boundedText(doc, cell, x, y + ROW_PAD, {
      width: col.width - 6,
      height: rowH - ROW_PAD * 2,
      align: col.align,
      ellipsis: i === 1,
      lineGap: 0,
    });
    x += col.width;
  });

  doc
    .moveTo(margin, y + rowH - 1)
    .lineTo(margin + ctx.contentWidth, y + rowH - 1)
    .strokeColor(COLORS.line)
    .lineWidth(0.3)
    .stroke();
  return y + rowH;
};

const drawItemsTable = (ctx: PdfCtx, payload: CotizacionPdfPayload, startY: number): number => {
  const cols = scaleTableCols(ctx.contentWidth);
  let y = drawTableHeader(ctx, startY, cols);

  payload.items.forEach((item, index) => {
    const rowH = measureRow(ctx, item, cols);
    if (y + rowH > ctx.pageBottom) {
      y = addPage(ctx, payload.quoteNumber);
      y = drawTableHeader(ctx, y, cols);
    }
    y = drawTableRow(ctx, y, item, index, payload.currency, index % 2 === 1, cols);
  });

  return y + 8;
};

const drawSummary = (ctx: PdfCtx, payload: CotizacionPdfPayload, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  const boxW = 220;
  const rows: Array<[string, string, boolean]> = [['Subtotal', formatMoney(payload.subtotal, payload.currency), false]];
  if (payload.discountTotal > 0) {
    rows.push(['Descuentos', `− ${formatMoney(payload.discountTotal, payload.currency)}`, false]);
  }
  rows.push(['IVA', formatMoney(payload.taxTotal, payload.currency), false]);
  if ((payload.iepsTotal || 0) > 0) rows.push(['IEPS', formatMoney(payload.iepsTotal || 0, payload.currency), false]);
  if ((payload.retentionTotal || 0) > 0) {
    rows.push(['Retenciones', `− ${formatMoney(payload.retentionTotal || 0, payload.currency)}`, false]);
  }
  rows.push(['TOTAL', formatMoney(payload.total, payload.currency), true]);
  if (payload.depositPercent > 0) {
    rows.push([
      `Anticipo (${payload.depositPercent}%)`,
      formatMoney((payload.total * payload.depositPercent) / 100, payload.currency),
      false,
    ]);
  }

  const boxH = 16 + rows.length * 15 + 12;
  y = ensureY(ctx, y, boxH + 20, payload.quoteNumber);
  const boxX = margin + contentWidth - boxW;

  doc.save();
  doc.roundedRect(boxX, y, boxW, boxH, 5).fill(COLORS.fill);
  doc.roundedRect(boxX, y, boxW, boxH, 5).strokeColor(COLORS.line).lineWidth(0.6).stroke();
  doc.restore();

  let sy = y + 10;
  doc.fillColor(COLORS.navy).font(fuente(doc, 'semi')).fontSize(10).text('Resumen', boxX + 12, sy);
  sy += 16;
  for (const [label, value, strong] of rows) {
    doc.font(fuente(doc, strong ? 'semi' : 'texto')).fontSize(strong ? 10.5 : 9);
    doc.fillColor(strong ? COLORS.navy : COLORS.text);
    boundedText(doc, label, boxX + 12, sy, { width: boxW - 24, height: strong ? 14 : 12 });
    boundedText(doc, value, boxX + 12, sy, { width: boxW - 24, height: strong ? 14 : 12, align: 'right' });
    sy += strong ? 18 : 15;
  }
  return y + boxH + 20;
};

const drawInternalEconomics = (ctx: PdfCtx, payload: CotizacionPdfPayload, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  let costTotal = 0;
  let sellNet = 0;
  for (const item of payload.items) {
    const cost = Number(item.unitCost) || 0;
    if (cost > 0) costTotal += cost * item.qty;
    sellNet += item.qty * item.unitPrice + (item.laborHours || 0) * (item.laborRate || 0);
  }
  sellNet = Math.round(sellNet * 100) / 100;
  costTotal = Math.round(costTotal * 100) / 100;
  const marginAmt = Math.round((sellNet - costTotal) * 100) / 100;
  const marginPct = sellNet > 0 ? Math.round((marginAmt / sellNet) * 1000) / 10 : 0;

  y = ensureY(ctx, y, 88, payload.quoteNumber);
  doc.save();
  doc.roundedRect(margin, y, contentWidth, 78, 5).fill(COLORS.fill);
  doc.roundedRect(margin, y, contentWidth, 78, 5).strokeColor(COLORS.line).lineWidth(0.6).stroke();
  doc.restore();

  doc.fillColor(COLORS.navy).font(fuente(doc, 'semi')).fontSize(10).text('Desglose interno (costo vs cliente)', margin + 12, y + 10);
  const rows: Array<[string, string]> = [
    ['Costo proveedor (neto)', formatMoney(costTotal, payload.currency)],
    ['Precio al cliente (neto)', formatMoney(sellNet, payload.currency)],
    ['Margen bruto', `${formatMoney(marginAmt, payload.currency)} (${marginPct}%)`],
    ['IVA trasladado', formatMoney(payload.taxTotal, payload.currency)],
    ['Total al cliente', formatMoney(payload.total, payload.currency)],
  ];
  let ly = y + 26;
  doc.font(fuente(doc, 'texto')).fontSize(9).fillColor(COLORS.text);
  for (const [label, value] of rows) {
    doc.text(label, margin + 12, ly, { width: contentWidth * 0.55 });
    doc.text(value, margin + 12, ly, { width: contentWidth - 24, align: 'right' });
    ly += 13;
  }
  return y + 88;
};

const drawSection = (ctx: PdfCtx, y: number, title: string, quoteNumber: string): number => {
  y = ensureY(ctx, y, 28, quoteNumber);
  const { doc, margin } = ctx;
  doc.fillColor(COLORS.navy).font(fuente(doc, 'titulo')).fontSize(11).text(title, margin, y);
  doc.moveTo(margin, y + 19).lineTo(margin + 48, y + 19).strokeColor(COLORS.accent).lineWidth(1.5).stroke();
  return y + 28;
};

const drawParagraph = (ctx: PdfCtx, y: number, text: string, quoteNumber: string): number => {
  const { doc, margin, contentWidth } = ctx;
  doc.fillColor(COLORS.text).font(fuente(doc, 'texto')).fontSize(9);
  // Medir y dibujar con el mismo lineGap: boundedText recorta a la altura que se
  // le pasa, y medir sin el interlineado se comia la ultima linea del parrafo.
  const h = doc.heightOfString(text, { width: contentWidth, lineGap: 2 });
  y = ensureY(ctx, y, h + 4, quoteNumber);
  boundedText(doc, text, margin, y, { width: contentWidth, height: h, lineGap: 2 });
  return y + h + 8;
};

const drawBullets = (ctx: PdfCtx, y: number, items: string[], quoteNumber: string): number => {
  const { doc, margin, contentWidth } = ctx;
  doc.font(fuente(doc, 'texto')).fontSize(9).fillColor(COLORS.text);
  for (const item of items) {
    const h = doc.heightOfString(item, { width: contentWidth - 14, lineGap: 1 });
    y = ensureY(ctx, y, h + 6, quoteNumber);
    boundedText(doc, '•', margin, y, { width: 8, height: h });
    boundedText(doc, item, margin + 12, y, { width: contentWidth - 14, height: h, lineGap: 1 });
    y += h + 6;
  }
  return y;
};

const drawSignatures = (ctx: PdfCtx, y: number, payload: CotizacionPdfPayload): number => {
  const { doc, margin, contentWidth, companyShort } = ctx;
  y = ensureY(ctx, y, 90, payload.quoteNumber);
  const sigW = (contentWidth - 24) / 2;

  const drawSig = (x: number, title: string, subtitle: string) => {
    doc.moveTo(x, y + 44).lineTo(x + sigW, y + 44).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    doc.fillColor(COLORS.navy).font(fuente(doc, 'semi')).fontSize(9).text(title, x, y + 50, { width: sigW });
    doc.fillColor(COLORS.muted).font(fuente(doc, 'texto')).fontSize(8).text(subtitle, x, y + 62, { width: sigW });
  };

  drawSig(margin, `Por ${companyShort}`, `${payload.preparedBy || 'Equipo comercial'} · Firma y sello`);
  drawSig(margin + sigW + 24, 'Aceptación del cliente', 'Nombre, cargo y firma');
  return y + 80;
};

/**
 * Garantías de las partidas agrupadas por plazo.
 *
 * Antes salía un renglón por partida, así que una cotización de ocho equipos
 * con el mismo plazo repetía «12 meses» ocho veces. Si todas coinciden se dice
 * una sola vez; si no, se listan los equipos de cada plazo.
 */
export const warrantyLines = (payload: CotizacionPdfPayload): string[] => {
  const conGarantia = payload.items.filter((i) => i.warrantyMonths && i.warrantyMonths > 0);
  if (!conGarantia.length) return [];

  const porPlazo = new Map<number, string[]>();
  for (const item of conGarantia) {
    const meses = item.warrantyMonths as number;
    const lista = porPlazo.get(meses) ?? [];
    lista.push(item.name);
    porPlazo.set(meses, lista);
  }

  if (porPlazo.size === 1 && conGarantia.length === payload.items.length) {
    const [meses] = [...porPlazo.keys()];
    return [`Todas las partidas de esta cotización: ${meses} meses de garantía.`];
  }

  return [...porPlazo.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 4)
    .map(([meses, nombres]) => {
      const visibles = nombres.slice(0, 4).join(', ');
      const resto = nombres.length > 4 ? ` y ${nombres.length - 4} más` : '';
      return `${meses} meses: ${visibles}${resto}.`;
    });
};

const drawTerms = (ctx: PdfCtx, payload: CotizacionPdfPayload, startY: number): number => {
  const q = payload.quoteNumber;
  let y = drawSection(ctx, startY, 'Condiciones comerciales', q);

  y = drawParagraph(
    ctx,
    y,
    `Vigencia: esta cotización es válida hasta el ${formatDisplayDate(payload.validUntil)}. ` +
      'Después de esa fecha, precios y disponibilidad pueden cambiar sin previo aviso.',
    q,
  );

  y = drawSection(ctx, y, 'Garantías', q);
  y = drawBullets(ctx, y, [...DEFAULT_WARRANTY, ...warrantyLines(payload)], q);

  y = drawSection(ctx, y, 'Exclusiones', q);
  y = drawBullets(ctx, y, DEFAULT_EXCLUSIONS, q);

  if (payload.note) {
    y = drawSection(ctx, y, 'Notas', q);
    y = drawParagraph(ctx, y, payload.note, q);
  }

  // El cierre viaja entero: encabezado, frase de aceptación y firmas. Partirlo
  // deja una última página con dos rayas y ningún contexto.
  y = ensureY(ctx, y, 150, q);
  y = drawSection(ctx, y, 'Aceptación', q);
  y = drawParagraph(
    ctx,
    y,
    'Al firmar, el cliente acepta el alcance, precios, vigencia y exclusiones de esta propuesta.',
    q,
  );
  return drawSignatures(ctx, y, payload);
};

export const generateCotizacionPdf = (
  payload: CotizacionPdfPayload,
  options: CotizacionPdfOptions = {},
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const company = resolveCompany(payload.company);
    const brand = brandName(company);
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      autoFirstPage: true,
      info: {
        Title: `Cotización ${payload.quoteNumber}`,
        Author: brand,
        Subject: payload.projectName || 'Propuesta comercial',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ctx: PdfCtx = {
      doc,
      margin: MARGIN,
      contentWidth: doc.page.width - MARGIN * 2,
      pageWidth: doc.page.width,
      pageHeight: doc.page.height,
      pageBottom: pageBottom(doc),
      pageNo: 1,
      logo: loadCompanyLogo(),
      companyShort: brand,
    };

    let y = drawLetterhead(ctx, payload);
    if (options.internal) {
      doc
        .fillColor(COLORS.muted)
        .font(fuente(doc, 'semi'))
        .fontSize(8.5)
        .text('DOCUMENTO INTERNO — incluye costos de proveedor', ctx.margin, y - 4);
      y += 10;
    } else {
      doc.fillColor(COLORS.muted).font(fuente(doc, 'texto')).fontSize(8).text(
        'Precios de venta netos (sin IVA). El IVA se muestra por partida y en el resumen.',
        ctx.margin,
        y - 2,
        { width: ctx.contentWidth },
      );
      y += 10;
    }
    y = drawItemsTable(ctx, payload, y);
    if (options.internal) {
      y = drawInternalEconomics(ctx, payload, y);
    }
    y = drawSummary(ctx, payload, y);
    y = drawTerms(ctx, payload, y + 8);

    drawFooter(ctx, payload.quoteNumber);
    doc.end();
  });
};
