import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { PDF_MODULE_ACCENTS, loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';

/**
 * Orden de compra (OC) — PDF producción.
 *
 * Misma familia visual que cotizaciones (`cotizacion-pdf.ts`): letterhead,
 * tipografía Helvetica, multipágina con número de página. Layout más denso
 * porque una OC exige proveedor / facturar-a / enviar-a / partidas / firmas.
 */

export type PurchaseOrderPdfItem = {
  description: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
};

export type PurchaseOrderPdfParty = {
  title: string;
  name: string;
  lines: string[];
};

export type PurchaseOrderPdfPayload = {
  poNumber: string;
  status: string;
  orderDate: string;
  expectedDate?: string | null;
  currency: string;
  paymentTerms?: string | null;
  shippingAddress?: string | null;
  notes?: string | null;
  incoterms?: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  company: {
    legalName: string;
    tradeName?: string | null;
    rfc?: string | null;
    fiscalAddress?: string | null;
    fiscalPostalCode?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    websiteUrl?: string | null;
  };
  vendor: {
    name: string;
    rfc?: string | null;
    creditoDias?: number | null;
    leadTimeDias?: number | null;
    esMayorista?: boolean | null;
  };
  createdByName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  requisitionNumber?: string | null;
  items: PurchaseOrderPdfItem[];
};

const ACCENT = PDF_MODULE_ACCENTS.erp;

const COLORS = {
  navy: '#0B1F3A',
  accent: ACCENT,
  text: '#1E293B',
  muted: '#64748B',
  line: '#CBD5E1',
  fill: '#F8FAFC',
  white: '#FFFFFF',
  soft: '#E6F4F5',
};

const MARGIN = 44;
const FOOTER_ZONE = 40;
const TABLE_HEADER_H = 22;
const ROW_PAD = 5;

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDisplayDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    SENT: 'Enviada',
    CONFIRMED: 'Confirmada',
    PARTIALLY_RECEIVED: 'Recepción parcial',
    RECEIVED: 'Recibida',
    INVOICED: 'Facturada',
    CANCELLED: 'Cancelada',
  };
  return map[status] || status;
};

const qtyFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 }).format(n || 0);

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

const drawFooter = (ctx: PdfCtx, poNumber: string) => {
  const { doc, margin, contentWidth, pageHeight, pageNo, companyShort } = ctx;
  const y = pageHeight - 28;
  doc.save();
  doc.moveTo(margin, y - 8).lineTo(margin + contentWidth, y - 8).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  doc.restore();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5);
  boundedText(doc, `${companyShort} · Orden de compra ${poNumber} · Documento confidencial`, margin, y, {
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
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text('Orden de compra (continuación)', margin + (logo ? 52 : 0), 30);
  return 52;
};

const addPage = (ctx: PdfCtx, poNumber: string): number => {
  drawFooter(ctx, poNumber);
  ctx.doc.addPage();
  ctx.pageNo += 1;
  const y = startContinuationPage(ctx);
  resetCursor(ctx.doc, ctx.margin, y);
  return y;
};

const ensureY = (ctx: PdfCtx, y: number, needed: number, poNumber: string): number => {
  if (y + needed <= ctx.pageBottom) return y;
  return addPage(ctx, poNumber);
};

const loadCompanyLogo = (): Buffer | null => {
  const fromTheme = loadNexaraLogo();
  if (fromTheme) return fromTheme;
  const candidates = [
    path.resolve(__dirname, '../assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'src/assets/logo-nexara.png'),
    path.resolve(process.cwd(), 'dist/assets/logo-nexara.png'),
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

const extractIncoterms = (notes?: string | null, explicit?: string | null): string | null => {
  if (explicit?.trim()) return explicit.trim();
  if (!notes) return null;
  const m = notes.match(/\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b/i);
  return m ? m[1].toUpperCase() : null;
};

const drawLetterhead = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload): number => {
  const { doc, margin, contentWidth, logo } = ctx;
  const company = payload.company;
  const brand = company.tradeName || company.legalName || 'NEXARA';
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
    company.legalName && company.legalName !== brand ? company.legalName : null,
    company.rfc ? `RFC ${company.rfc}` : null,
  ].filter(Boolean);
  if (subtitleBits.length) doc.text(subtitleBits.join(' · '), textX, y + 20, { width: contentWidth - 190 });
  const contactBits = [company.websiteUrl, company.contactEmail, company.contactPhone].filter(Boolean);
  if (contactBits.length) doc.text(contactBits.join('  ·  '), textX, y + 32, { width: contentWidth - 190 });

  const boxW = 168;
  const boxX = margin + contentWidth - boxW;
  doc.save();
  doc.roundedRect(boxX, y, boxW, 68, 6).fill(COLORS.soft);
  doc.roundedRect(boxX, y, boxW, 68, 6).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  doc.restore();

  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('ORDEN DE COMPRA', boxX + 10, y + 8);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(12).text(payload.poNumber, boxX + 10, y + 18);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5);
  doc.text(`Emisión: ${formatDisplayDate(payload.orderDate)}`, boxX + 10, y + 36);
  doc.text(`Entrega: ${formatDisplayDate(payload.expectedDate)}`, boxX + 10, y + 46);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8).text(statusLabel(payload.status), boxX + 10, y + 56, {
    width: boxW - 20,
    align: 'right',
  });

  y = Math.max(y + 62, y + 78);
  doc.moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  return y + 12;
};

const drawPartyCard = (
  ctx: PdfCtx,
  x: number,
  y: number,
  width: number,
  title: string,
  name: string,
  lines: string[],
): number => {
  const { doc } = ctx;
  const padding = 10;
  const body = [name, ...lines.filter(Boolean)];
  doc.font('Helvetica').fontSize(8);
  const lineHeights = body.map((line) => Math.max(10, doc.heightOfString(line, { width: width - padding * 2 })));
  const height = padding * 2 + 14 + lineHeights.reduce((a, b) => a + b + 2, 0);

  doc.save();
  doc.roundedRect(x, y, width, height, 6).fill(COLORS.fill);
  doc.roundedRect(x, y, width, height, 6).strokeColor(COLORS.line).lineWidth(0.6).stroke();
  doc.restore();

  doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(7.5).text(title.toUpperCase(), x + padding, y + padding);
  let ly = y + padding + 14;
  body.forEach((line, i) => {
    doc
      .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(i === 0 ? 9 : 8)
      .fillColor(COLORS.text);
    const h = lineHeights[i];
    boundedText(doc, line, x + padding, ly, { width: width - padding * 2, height: h });
    ly += h + 2;
  });
  return height;
};

const drawParties = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload, startY: number): number => {
  const { margin, contentWidth } = ctx;
  const gap = 10;
  const colW = (contentWidth - gap * 2) / 3;

  const vendorLines = [
    payload.vendor.rfc ? `RFC ${payload.vendor.rfc}` : '',
    payload.vendor.esMayorista ? 'Mayorista con convenio' : '',
    payload.vendor.creditoDias != null ? `Crédito: ${payload.vendor.creditoDias} días` : '',
    payload.vendor.leadTimeDias != null ? `Lead time: ${payload.vendor.leadTimeDias} días` : '',
  ].filter(Boolean);

  const billTo = payload.company;
  const billLines = [
    billTo.rfc ? `RFC ${billTo.rfc}` : '',
    billTo.fiscalAddress || '',
    billTo.fiscalPostalCode ? `C.P. ${billTo.fiscalPostalCode}` : '',
    billTo.contactEmail || '',
    billTo.contactPhone || '',
  ].filter(Boolean);

  const shipLines = (payload.shippingAddress || billTo.fiscalAddress || 'Misma dirección fiscal')
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);

  const h1 = drawPartyCard(ctx, margin, startY, colW, 'Proveedor', payload.vendor.name, vendorLines);
  const h2 = drawPartyCard(
    ctx,
    margin + colW + gap,
    startY,
    colW,
    'Facturar a',
    billTo.legalName || billTo.tradeName || 'NEXARA',
    billLines,
  );
  const h3 = drawPartyCard(ctx, margin + (colW + gap) * 2, startY, colW, 'Enviar a', shipLines[0] || '—', shipLines.slice(1));

  return startY + Math.max(h1, h2, h3) + 12;
};

const drawMetaStrip = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  const incoterms = extractIncoterms(payload.notes, payload.incoterms);
  const cells: Array<[string, string]> = [
    ['Condiciones de pago', payload.paymentTerms || (payload.vendor.creditoDias != null ? `${payload.vendor.creditoDias} días` : 'Según convenio')],
    ['Moneda', payload.currency || 'MXN'],
    ['Fecha entrega', formatDisplayDate(payload.expectedDate)],
    ['Incoterms', incoterms || '—'],
  ];
  if (payload.requisitionNumber) cells.push(['Requisición', payload.requisitionNumber]);

  const cellW = contentWidth / cells.length;
  const rowH = 36;
  doc.save();
  doc.roundedRect(margin, y, contentWidth, rowH, 5).fill(COLORS.fill);
  doc.restore();

  cells.forEach(([label, value], i) => {
    const x = margin + i * cellW;
    if (i > 0) {
      doc
        .moveTo(x, y + 6)
        .lineTo(x, y + rowH - 6)
        .strokeColor(COLORS.line)
        .lineWidth(0.4)
        .stroke();
    }
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(label.toUpperCase(), x + 8, y + 6, {
      width: cellW - 14,
    });
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8).text(value, x + 8, y + 18, {
      width: cellW - 14,
      ellipsis: true,
    });
  });

  return y + rowH + 14;
};

type TableCol = { key: string; label: string; width: number; align: 'left' | 'right' | 'center' };

const TABLE_COLS: TableCol[] = [
  { key: 'num', label: '#', width: 20, align: 'center' },
  { key: 'sku', label: 'SKU', width: 72, align: 'left' },
  { key: 'desc', label: 'Descripción', width: 198, align: 'left' },
  { key: 'qty', label: 'Cant.', width: 40, align: 'right' },
  { key: 'uom', label: 'UdM', width: 34, align: 'center' },
  { key: 'unit', label: 'Costo unit.', width: 62, align: 'right' },
  { key: 'tax', label: 'IVA %', width: 36, align: 'center' },
  { key: 'total', label: 'Importe', width: 62, align: 'right' },
];

const drawTableHeader = (ctx: PdfCtx, y: number): number => {
  const { doc, margin } = ctx;
  doc.save();
  doc.rect(margin, y, ctx.contentWidth, TABLE_HEADER_H).fill(COLORS.navy);
  doc.restore();
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7);
  let x = margin + 3;
  for (const col of TABLE_COLS) {
    doc.text(col.label, x, y + 7, { width: col.width - 4, align: col.align });
    x += col.width;
  }
  return y + TABLE_HEADER_H + 3;
};

const measureItemRow = (ctx: PdfCtx, item: PurchaseOrderPdfItem): number => {
  const { doc } = ctx;
  doc.font('Helvetica').fontSize(8);
  const descH = doc.heightOfString(item.description || '—', { width: TABLE_COLS[2].width - 6 });
  return Math.max(28, descH + ROW_PAD * 2);
};

const drawTableRow = (
  ctx: PdfCtx,
  y: number,
  item: PurchaseOrderPdfItem,
  index: number,
  currency: string,
  stripe: boolean,
): number => {
  const { doc, margin } = ctx;
  const rowH = measureItemRow(ctx, item);

  if (stripe) {
    doc.save();
    doc.rect(margin, y - 1, ctx.contentWidth, rowH).fill(COLORS.fill);
    doc.restore();
  }

  const cells = [
    String(index + 1),
    item.sku || '—',
    item.description || '—',
    qtyFmt(item.quantity),
    item.unit || 'PZA',
    formatMoney(item.unitPrice, currency),
    `${item.taxRate || 0}`,
    formatMoney(item.lineTotal, currency),
  ];

  let x = margin + 3;
  cells.forEach((cell, i) => {
    const col = TABLE_COLS[i];
    if (i === 0 || i === 1 || i === 4 || i === 6) doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    else if (i === 2) doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    else if (i === 7) doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.navy);
    else doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    boundedText(doc, cell, x, y + ROW_PAD, {
      width: col.width - 6,
      height: rowH - ROW_PAD * 2,
      align: col.align,
      ellipsis: i === 1 || i === 2,
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

const drawItemsTable = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload, startY: number): number => {
  let y = startY;
  y = ensureY(ctx, y, 40, payload.poNumber);
  ctx.doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text('Detalle de partidas', ctx.margin, y);
  y += 16;
  y = drawTableHeader(ctx, y);

  payload.items.forEach((item, index) => {
    const rowH = measureItemRow(ctx, item);
    if (y + rowH > ctx.pageBottom) {
      y = addPage(ctx, payload.poNumber);
      y = drawTableHeader(ctx, y);
    }
    y = drawTableRow(ctx, y, item, index, payload.currency, index % 2 === 1);
  });

  return y + 10;
};

const drawSummaryAndApprovals = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  const boxW = 210;
  const leftW = contentWidth - boxW - 16;
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(payload.subtotal, payload.currency), false],
    ['IVA', formatMoney(payload.taxAmount, payload.currency), false],
    ['TOTAL', formatMoney(payload.totalAmount, payload.currency), true],
  ];
  const boxH = 18 + rows.length * 16 + 10;
  y = ensureY(ctx, y, Math.max(boxH, 88) + 20, payload.poNumber);

  // Aprobaciones / control
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text('Control y aprobación', margin, y);
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
  const approvalLines = [
    `Estado: ${statusLabel(payload.status)}`,
    `Elaboró: ${payload.createdByName || '—'}`,
    `Autorizó: ${payload.approvedByName || (payload.status === 'DRAFT' ? 'Pendiente' : '—')}`,
    payload.approvedAt ? `Fecha autorización: ${formatDisplayDate(payload.approvedAt)}` : null,
    `Partidas: ${payload.items.length}`,
  ].filter(Boolean) as string[];
  let ay = y + 14;
  for (const line of approvalLines) {
    boundedText(doc, line, margin, ay, { width: leftW, height: 12 });
    ay += 12;
  }

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

  return Math.max(ay, y + boxH) + 16;
};

const drawNotesAndSignatures = (ctx: PdfCtx, payload: PurchaseOrderPdfPayload, y: number): number => {
  const { doc, margin, contentWidth } = ctx;
  const notes = payload.notes?.trim();
  if (notes) {
    y = ensureY(ctx, y, 48, payload.poNumber);
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text('Notas / instrucciones', margin, y);
    y += 14;
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
    const h = doc.heightOfString(notes, { width: contentWidth });
    y = ensureY(ctx, y, h + 8, payload.poNumber);
    boundedText(doc, notes, margin, y, { width: contentWidth, height: h, lineGap: 1 });
    y += h + 14;
  }

  y = ensureY(ctx, y, 96, payload.poNumber);
  const sigW = (contentWidth - 24) / 2;
  const drawSig = (x: number, title: string, subtitle: string) => {
    doc.moveTo(x, y + 40).lineTo(x + sigW, y + 40).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8).text(title, x, y + 46, { width: sigW });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(subtitle, x, y + 58, { width: sigW });
  };
  drawSig(margin, 'Autorización compras / dirección', payload.approvedByName || 'Nombre y firma');
  drawSig(margin + sigW + 24, 'Acuse del proveedor', 'Nombre, cargo y sello');
  return y + 78;
};

export const generatePurchaseOrderPdf = (payload: PurchaseOrderPdfPayload): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const brand = payload.company.tradeName || payload.company.legalName || 'NEXARA';
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      autoFirstPage: true,
      info: {
        Title: `Orden de compra ${payload.poNumber}`,
        Author: brand,
        Subject: `OC a ${payload.vendor.name}`,
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
    y = drawParties(ctx, payload, y);
    y = drawMetaStrip(ctx, payload, y);
    y = drawItemsTable(ctx, payload, y);
    y = drawSummaryAndApprovals(ctx, payload, y);
    y = drawNotesAndSignatures(ctx, payload, y);

    drawFooter(ctx, payload.poNumber);
    doc.end();
  });
};
