import PDFDocument from 'pdfkit';
import { PDF_MODULE_ACCENTS, loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';

/**
 * Cotización comercial — PDF producción.
 *
 * Misma familia visual que OC (`purchase-order-pdf.ts`): membrete con datos
 * fiscales de CompanyProfile, tipografía Helvetica, multipágina con número,
 * filas de altura dinámica y resumen MXN.
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
const TABLE_HEADER_H = 22;
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
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5);
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
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11).text(companyShort, margin + (logo ? 52 : 0), 16);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text('Cotización comercial (continuación)', margin + (logo ? 52 : 0), 30);
  return 52;
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

const drawLetterhead = (ctx: PdfCtx, payload: CotizacionPdfPayload): number => {
  const { doc, margin, contentWidth, logo } = ctx;
  const company = resolveCompany(payload.company);
  const brand = brandName(company);
  let y = MARGIN;

  doc.save();
  doc.rect(0, 0, ctx.pageWidth, 6).fill(COLORS.accent);
  doc.restore();

  if (logo) {
    try {
      doc.image(logo, margin, y, { fit: [54, 54] });
    } catch {
      // ignore
    }
  }

  const textX = logo ? margin + 62 : margin;
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(17).text(brand, textX, y);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
  const subtitleBits = [
    company.legalName && company.legalName !== brand ? company.legalName : FALLBACK_COMPANY.tagline,
    company.rfc ? `RFC ${company.rfc}` : null,
  ].filter(Boolean);
  if (subtitleBits.length) doc.text(subtitleBits.join(' · '), textX, y + 20, { width: contentWidth - 190 });
  const contactBits = [company.websiteUrl, company.contactEmail, company.contactPhone].filter(Boolean);
  if (contactBits.length) doc.text(contactBits.join('  ·  '), textX, y + 32, { width: contentWidth - 190 });
  if (company.fiscalAddress) {
    const addr = [company.fiscalAddress, company.fiscalPostalCode ? `C.P. ${company.fiscalPostalCode}` : null]
      .filter(Boolean)
      .join(' · ');
    doc.text(addr, textX, y + 44, { width: contentWidth - 190, ellipsis: true });
  }

  const boxW = 168;
  const boxX = margin + contentWidth - boxW;
  const boxH = company.fiscalAddress ? 72 : 68;
  doc.save();
  doc.roundedRect(boxX, y, boxW, boxH, 6).fill(COLORS.soft);
  doc.roundedRect(boxX, y, boxW, boxH, 6).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  doc.restore();

  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('COTIZACIÓN', boxX + 10, y + 8);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(12).text(payload.quoteNumber, boxX + 10, y + 18);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5);
  doc.text(`Emisión: ${formatDisplayDate(payload.issueDate)}`, boxX + 10, y + 36);
  doc.text(`Vigencia: ${formatDisplayDate(payload.validUntil)}`, boxX + 10, y + 46);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8).text(statusLabel(payload.status), boxX + 10, y + 56, {
    width: boxW - 20,
    align: 'right',
  });

  y = Math.max(y + (company.fiscalAddress ? 62 : 58), y + boxH + 10);
  doc.moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  y += 14;

  const colW = (contentWidth - 16) / 2;
  const drawInfoCol = (x: number, title: string, lines: string[]) => {
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text(title, x, y);
    let ly = y + 14;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
    for (const line of lines) {
      const lh = doc.heightOfString(line, { width: colW });
      boundedText(doc, line, x, ly, { width: colW, height: lh });
      ly += lh + 2;
    }
    return ly;
  };

  const clientLines = [
    payload.clientCompany || payload.clientName || '—',
    payload.clientName && payload.clientCompany ? `Attn: ${payload.clientName}` : '',
    payload.clientEmail || '',
    payload.clientPhone || '',
    payload.clientAddress || '',
  ].filter(Boolean);

  const projectLines = [
    payload.projectName ? `Proyecto: ${payload.projectName}` : '',
    payload.scope ? `Alcance: ${payload.scope}` : '',
    payload.paymentTerms ? `Pago: ${payload.paymentTerms}` : '',
    payload.deliveryTime ? `Entrega: ${payload.deliveryTime}` : '',
    payload.depositPercent ? `Anticipo: ${payload.depositPercent}%` : '',
    `Moneda: ${payload.currency || 'MXN'}`,
  ].filter(Boolean);

  const yLeft = drawInfoCol(margin, 'Cliente', clientLines.length ? clientLines : ['—']);
  const yRight = drawInfoCol(margin + colW + 16, 'Condiciones', projectLines.length ? projectLines : ['Según partidas']);
  y = Math.max(yLeft, yRight) + 12;

  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11).text('Detalle de partidas', margin, y);
  y += 18;
  return y;
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
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.5);
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
  const lines = [item.name, meta || null, desc || null].filter(Boolean);
  return lines.join('\n');
};

const measureRow = (ctx: PdfCtx, item: CotizacionPdfItem, cols: TableCol[]): number => {
  const { doc } = ctx;
  doc.font('Helvetica').fontSize(8);
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
    if (i === 0 || i === 3 || i === 5) doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    else if (i === 1) doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    else if (i === 6) doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.navy);
    else doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    boundedText(doc, cell, x, y + ROW_PAD, {
      width: col.width - 6,
      height: rowH - ROW_PAD * 2,
      align: col.align,
      ellipsis: i === 1,
      lineGap: 0,
    });
    x += col.width;
  });

  doc.moveTo(margin, y + rowH - 1).lineTo(margin + ctx.contentWidth, y + rowH - 1).strokeColor(COLORS.line).lineWidth(0.3).stroke();
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
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(payload.subtotal, payload.currency), false],
  ];
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
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text('Resumen', boxX + 12, sy);
  sy += 16;
  for (const [label, value, strong] of rows) {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 10 : 8.5);
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

  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text('Desglose interno (costo vs cliente)', margin + 12, y + 10);
  const rows: Array<[string, string]> = [
    ['Costo proveedor (neto)', formatMoney(costTotal, payload.currency)],
    ['Precio al cliente (neto)', formatMoney(sellNet, payload.currency)],
    ['Margen bruto', `${formatMoney(marginAmt, payload.currency)} (${marginPct}%)`],
    ['IVA trasladado', formatMoney(payload.taxTotal, payload.currency)],
    ['Total al cliente', formatMoney(payload.total, payload.currency)],
  ];
  let ly = y + 26;
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
  for (const [label, value] of rows) {
    doc.text(label, margin + 12, ly, { width: contentWidth * 0.55 });
    doc.text(value, margin + 12, ly, { width: contentWidth - 24, align: 'right' });
    ly += 11;
  }
  return y + 88;
};

const drawSection = (ctx: PdfCtx, y: number, title: string): number => {
  y = ensureY(ctx, y, 28);
  const { doc, margin } = ctx;
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text(title, margin, y);
  doc.moveTo(margin, y + 14).lineTo(margin + 48, y + 14).strokeColor(COLORS.accent).lineWidth(1.5).stroke();
  return y + 22;
};

const drawParagraph = (ctx: PdfCtx, y: number, text: string): number => {
  const { doc, margin, contentWidth } = ctx;
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.5);
  const h = doc.heightOfString(text, { width: contentWidth });
  y = ensureY(ctx, y, h + 4);
  boundedText(doc, text, margin, y, { width: contentWidth, height: h, lineGap: 2 });
  return y + h + 8;
};

const drawBullets = (ctx: PdfCtx, y: number, items: string[]): number => {
  const { doc, margin, contentWidth } = ctx;
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
  for (const item of items) {
    const h = doc.heightOfString(item, { width: contentWidth - 14 });
    y = ensureY(ctx, y, h + 6);
    boundedText(doc, '•', margin, y, { width: 8, height: h });
    boundedText(doc, item, margin + 12, y, { width: contentWidth - 14, height: h, lineGap: 1 });
    y += h + 6;
  }
  return y;
};

const drawSignatures = (ctx: PdfCtx, y: number, payload: CotizacionPdfPayload): number => {
  const { doc, margin, contentWidth } = ctx;
  y = ensureY(ctx, y, 90);
  const sigW = (contentWidth - 24) / 2;

  const drawSig = (x: number, title: string, subtitle: string) => {
    doc.moveTo(x, y + 44).lineTo(x + sigW, y + 44).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8.5).text(title, x, y + 50, { width: sigW });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(subtitle, x, y + 62, { width: sigW });
  };

  drawSig(margin, 'Por NEXARA', `${payload.preparedBy || 'Equipo comercial'} · Firma y sello`);
  drawSig(margin + sigW + 24, 'Aceptación del cliente', 'Nombre, cargo y firma');
  return y + 80;
};

const drawTerms = (ctx: PdfCtx, payload: CotizacionPdfPayload, startY: number): number => {
  let y = drawSection(ctx, startY, 'Condiciones comerciales');

  y = drawParagraph(
    ctx,
    y,
    `Vigencia: esta cotización es válida hasta el ${formatDisplayDate(payload.validUntil)}. ` +
      'Después de esa fecha, precios y disponibilidad pueden cambiar sin previo aviso.',
  );

  y = drawSection(ctx, y, 'Garantías');
  const warrantyExtras = payload.items
    .filter((i) => i.warrantyMonths && i.warrantyMonths > 0)
    .slice(0, 6)
    .map((i) => `${i.name}: ${i.warrantyMonths} meses`);
  y = drawBullets(ctx, y, [...DEFAULT_WARRANTY, ...warrantyExtras]);

  y = drawSection(ctx, y, 'Exclusiones');
  y = drawBullets(ctx, y, DEFAULT_EXCLUSIONS);

  if (payload.note) {
    y = drawSection(ctx, y, 'Notas');
    y = drawParagraph(ctx, y, payload.note);
  }

  y = drawSection(ctx, y, 'Aceptación');
  y = drawParagraph(
    ctx,
    y,
    'Al firmar, el cliente acepta el alcance, precios, vigencia y exclusiones de esta propuesta.',
  );
  return drawSignatures(ctx, y, payload);
};

export const generateCotizacionPdf = (
  payload: CotizacionPdfPayload,
  options: CotizacionPdfOptions = {},
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      autoFirstPage: true,
      info: {
        Title: `Cotización ${payload.quoteNumber}`,
        Author: COMPANY.name,
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
      logo: loadLogo(),
    };

    let y = drawLetterhead(ctx, payload);
    if (options.internal) {
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8).text('DOCUMENTO INTERNO — incluye costos de proveedor', ctx.margin, y - 4);
      y += 10;
    } else {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(
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

    drawFooter(ctx);
    doc.end();
  });
};
