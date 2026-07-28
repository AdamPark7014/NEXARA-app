import { Injectable, BadRequestException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service.js';
import fs from 'fs';
import path from 'path';
import { companyWhere, assertCompanyAccess } from '../common/tenant/tenant-scope.js';

function resolveNexaraLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'dist/assets/logo-nexara.png'),
    path.join(process.cwd(), 'src/assets/logo-nexara.png'),
    path.resolve(__dirname, '../assets/logo-nexara.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── Brand constants ──────────────────────────────────────────────────────────
const BRAND_DARK   = '#0a1f3d';
const BRAND_LIGHT  = '#e8f0fb';
const BRAND_WHITE  = '#ffffff';
const TEXT_DARK    = '#1e293b';
const TEXT_MID     = '#475569';
const TEXT_LIGHT   = '#94a3b8';
const DIVIDER      = '#e2e8f0';
const ROW_ALT      = '#f8fafc';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  description: string;
  brand?: string;
  model?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  lineTotal: number;
  warrantyMonths?: number;
  deliveryTime?: string;
  notes?: string;
}

interface QuotePdfData {
  quoteNumber: string;
  date: string;
  validity?: string;
  currency: string;
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyRfc?: string;
  companyWebsite?: string;
  clientName: string;
  clientCompany?: string;
  clientRfc?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectName?: string;
  scope?: string;
  paymentTerms?: string;
  depositPercent?: number;
  deliveryTime?: string;
  preparedBy?: string;
  notes?: string;
  items: QuoteItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal: number;
  retentionTotal: number;
  total: number;
  primaryColor: string;
  footerText?: string;
}

type TemplateSections = {
  showClientInfo: boolean;
  showProjectScope: boolean;
  showItemsTable: boolean;
  showTotals: boolean;
  showTerms: boolean;
  showNotes: boolean;
  showPreparedBy: boolean;
  showValidity: boolean;
  showPaymentTerms: boolean;
  showFooterBrand: boolean;
};

const fmtMXN = (n: number, cur = 'MXN') =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PdfGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveTemplateSections(template: any): TemplateSections {
    const defaults: TemplateSections = {
      showClientInfo: true, showProjectScope: true, showItemsTable: true,
      showTotals: true, showTerms: true, showNotes: true,
      showPreparedBy: true, showValidity: true, showPaymentTerms: true, showFooterBrand: true,
    };
    if (!template?.sections || typeof template.sections !== 'object') return defaults;
    const raw = template.sections as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaults).map(([k]) => [k, raw[k] !== false])) as TemplateSections;
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async generateQuotePdf(opportunityQuoteId: number, clientId: number, templateId?: number): Promise<Buffer> {
    const quote = await this.prisma.salesOpportunityQuote.findUnique({
      where: { id: opportunityQuoteId },
      include: { opportunity: { include: { client: true } }, cotizacion: { include: { items: true } }, createdBy: true },
    });
    if (!quote) throw new BadRequestException('Quote or client not found');

    const tenantId = (quote.opportunity as any)?.companyId ?? null;
    const client = await this.prisma.salesClient.findFirst({
      where: { id: clientId, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(client, tenantId, 'Cliente');
    if (!client) throw new BadRequestException('Quote or client not found');

    const template = templateId
      ? await this.prisma.orderTemplate.findFirst({
          where: { id: templateId, ...companyWhere(tenantId) },
        })
      : await this.prisma.orderTemplate.findFirst({
          where: {
            isDefault: true,
            ...companyWhere(tenantId),
          },
        });
    if (templateId) assertCompanyAccess(template, tenantId, 'Template');

    const cot = quote.cotizacion as any;
    const data: QuotePdfData = {
      quoteNumber: cot?.quoteNumber || `COT-${quote.id}`,
      date: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }),
      validity: cot?.validUntil ? new Date(cot.validUntil).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined,
      currency: cot?.currency || 'MXN',
      companyName: template?.companyName || 'NEXARA',
      companyAddress: (template as any)?.companyAddress || undefined,
      companyEmail: (template as any)?.companyEmail || undefined,
      companyPhone: (template as any)?.companyPhone || undefined,
      companyRfc: (template as any)?.companyRfc || undefined,
      companyWebsite: (template as any)?.companyWebsite || undefined,
      clientName: client.name,
      clientCompany: client.legalName || undefined,
      clientRfc: (client as any).taxId || undefined,
      clientAddress: (client as any).fiscalAddress || undefined,
      clientEmail: (client as any).billingEmail || undefined,
      clientPhone: (client as any).billingPhone || undefined,
      projectName: (quote.opportunity as any)?.description || cot?.projectName || undefined,
      scope: cot?.scope || undefined,
      paymentTerms: cot?.paymentTerms || undefined,
      depositPercent: cot?.depositPercent || undefined,
      deliveryTime: cot?.deliveryTime || undefined,
      preparedBy: (quote.createdBy as any)?.nombre || template?.companyName || 'NEXARA',
      notes: cot?.note || undefined,
      items: ((cot?.items || []) as any[]).map((it) => ({
        description: it.name, brand: it.brand || undefined, model: it.model || undefined,
        unit: it.unit || undefined, quantity: it.qty, unitPrice: Number(it.unitPrice),
        discount: it.discount || 0, tax: it.tax || 0, ieps: it.ieps || 0,
        retention: it.retention || 0, lineTotal: Number(it.lineTotal),
        warrantyMonths: it.warrantyMonths || undefined, deliveryTime: it.deliveryTime || undefined, notes: it.notes || undefined,
      })),
      subtotal: Number(cot?.subtotal || 0), discountTotal: Number(cot?.discountTotal || 0),
      taxTotal: Number(cot?.taxTotal || 0), iepsTotal: Number(cot?.iepsTotal || 0),
      retentionTotal: Number(cot?.retentionTotal || 0), total: Number(cot?.total || 0),
      primaryColor: template?.primaryColor || '#0f6ad6',
      footerText: template?.footerText || undefined,
    };
    return this._buildPdf(data, this.resolveTemplateSections(template));
  }

  async generateOrderPdf(projectId: number, templateId?: number): Promise<Buffer> {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { opportunity: { include: { client: true, quotes: { orderBy: { createdAt: 'desc' }, take: 1, include: { cotizacion: { include: { items: true } }, createdBy: true } } } } },
    });
    if (!project) throw new BadRequestException('Project not found');
    const client = (project.opportunity as any)?.client;
    if (!client) throw new BadRequestException('Client not found');
    const template = templateId
      ? await this.prisma.orderTemplate.findUnique({ where: { id: templateId } })
      : await this.prisma.orderTemplate.findFirst({
          where: {
            isDefault: true,
            ...((project as any).companyId
              ? companyWhere((project as any).companyId)
              : (project.opportunity as any)?.companyId
                ? companyWhere((project.opportunity as any).companyId)
                : {}),
          },
        });
    const quote = (project.opportunity as any)?.quotes?.[0];
    const cot = quote?.cotizacion as any;
    const data: QuotePdfData = {
      quoteNumber: `ORD-${project.id}`,
      date: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }),
      currency: cot?.currency || 'MXN',
      companyName: template?.companyName || 'NEXARA',
      companyAddress: (template as any)?.companyAddress || undefined,
      companyEmail: (template as any)?.companyEmail || undefined,
      companyPhone: (template as any)?.companyPhone || undefined,
      companyRfc: (template as any)?.companyRfc || undefined,
      clientName: client.name, clientCompany: client.legalName || undefined,
      clientRfc: client.taxId || undefined, clientAddress: client.fiscalAddress || undefined,
      projectName: (project as any).name, scope: cot?.scope || undefined,
      paymentTerms: cot?.paymentTerms || undefined, depositPercent: cot?.depositPercent || undefined,
      preparedBy: quote?.createdBy?.nombre || 'NEXARA',
      notes: cot?.note || undefined,
      items: ((cot?.items || []) as any[]).map((it) => ({
        description: it.name, brand: it.brand || undefined, model: it.model || undefined,
        unit: it.unit || undefined, quantity: it.qty, unitPrice: Number(it.unitPrice),
        discount: it.discount || 0, tax: it.tax || 0, ieps: it.ieps || 0,
        retention: it.retention || 0, lineTotal: Number(it.lineTotal),
      })),
      subtotal: Number(cot?.subtotal || 0), discountTotal: Number(cot?.discountTotal || 0),
      taxTotal: Number(cot?.taxTotal || 0), iepsTotal: Number(cot?.iepsTotal || 0),
      retentionTotal: Number(cot?.retentionTotal || 0), total: Number(cot?.total || 0),
      primaryColor: template?.primaryColor || '#0f6ad6',
      footerText: template?.footerText || undefined,
    };
    return this._buildPdf(data, this.resolveTemplateSections(template));
  }

  // ─── Core PDF builder ──────────────────────────────────────────────────────

  private _buildPdf(data: QuotePdfData, sections: TemplateSections): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W  = doc.page.width;   // 595.28
      const H  = doc.page.height;  // 841.89
      const M  = 40;
      const CW = W - M * 2;
      const primary = data.primaryColor;

      // ─── Background ─────────────────────────────────────────────────────────
      doc.rect(0, 0, W, H).fill(BRAND_WHITE);

      // Top accent bar
      doc.rect(0, 0, W, 5).fill(primary);

      // ─── Header band ─────────────────────────────────────────────────────────
      const hH = 88;
      doc.rect(0, 5, W, hH).fill(BRAND_DARK);

      // Logo
      let logoW = 0;
      try {
        const logoPath = resolveNexaraLogoPath();
        if (logoPath) {
          doc.image(logoPath, M, 14, { height: 56, fit: [160, 56] });
          logoW = 170;
        }
      } catch { /* silent */ }

      // Company info block (right of logo)
      const cmpX = M + logoW + 8;
      let cmpY = 18;
      if (data.companyName) {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BRAND_WHITE).text(data.companyName, cmpX, cmpY, { width: 180 });
        cmpY += 13;
      }
      doc.fontSize(6.5).font('Helvetica').fillColor('rgba(255,255,255,0.6)');
      if (data.companyRfc)     { doc.text(`RFC: ${data.companyRfc}`, cmpX, cmpY, { width: 180 }); cmpY += 10; }
      if (data.companyPhone)   { doc.text(`Tel: ${data.companyPhone}`, cmpX, cmpY, { width: 180 }); cmpY += 10; }
      if (data.companyEmail)   { doc.text(data.companyEmail, cmpX, cmpY, { width: 180 }); cmpY += 10; }
      if (data.companyAddress) { doc.text(data.companyAddress, cmpX, cmpY, { width: 180 }); cmpY += 10; }
      if (data.companyWebsite) { doc.text(data.companyWebsite, cmpX, cmpY, { width: 180 }); }

      // Doc type box (right side)
      const boxW = 180;
      const boxX = W - M - boxW;
      doc.rect(boxX - 10, 12, boxW + 12, 72).fill(primary);
      const isOrder = data.quoteNumber.startsWith('ORD');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BRAND_WHITE)
         .text(isOrder ? 'ORDEN DE VENTA' : 'COTIZACIÓN', boxX, 21, { width: boxW, align: 'center' });
      doc.fontSize(15).font('Helvetica-Bold').fillColor(BRAND_WHITE)
         .text(data.quoteNumber, boxX, 33, { width: boxW, align: 'center' });
      doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.8)')
         .text(`Fecha: ${data.date}`, boxX, 54, { width: boxW, align: 'center' });
      if (sections.showValidity && data.validity) {
        doc.text(`Vigente hasta: ${data.validity}`, boxX, 65, { width: boxW, align: 'center' });
      }

      // ─── Client info ─────────────────────────────────────────────────────────
      let y = 5 + hH + 14;

      if (sections.showClientInfo) {
        const boxH = 68;
        doc.rect(M, y, CW, boxH).fill(BRAND_LIGHT);
        doc.rect(M, y, 3, boxH).fill(primary); // left stripe

        const inX = M + 12;
        let inY = y + 9;
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(primary).text('DATOS DEL CLIENTE', inX, inY);
        inY += 12;
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text(data.clientName, inX, inY, { width: CW * 0.5 });
        inY += 12;
        doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID);
        if (data.clientCompany) { doc.text(data.clientCompany, inX, inY, { width: CW * 0.5 }); inY += 11; }
        if (data.clientRfc)     { doc.text(`RFC: ${data.clientRfc}`, inX, inY, { width: CW * 0.5 }); inY += 11; }
        if (data.clientAddress) { doc.text(data.clientAddress, inX, inY, { width: CW * 0.5 }); }

        const rcX = M + CW * 0.56;
        let rcY = y + 9;
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(primary).text('CONTACTO', rcX, rcY);
        rcY += 12;
        doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID);
        if (data.clientEmail) { doc.text(data.clientEmail, rcX, rcY, { width: CW * 0.42 }); rcY += 11; }
        if (data.clientPhone) { doc.text(data.clientPhone, rcX, rcY, { width: CW * 0.42 }); }

        y += boxH + 12;
      }

      // ─── Project / scope ─────────────────────────────────────────────────────
      if (sections.showProjectScope && (data.projectName || data.scope)) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(primary).text('PROYECTO / ALCANCE', M, y);
        y += 11;
        if (data.projectName) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_DARK).text(data.projectName, M, y, { width: CW });
          y += 13;
        }
        if (data.scope) {
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID).text(data.scope, M, y, { width: CW });
          y += doc.heightOfString(data.scope, { width: CW }) + 8;
        }
        doc.moveTo(M, y + 4).lineTo(M + CW, y + 4).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        y += 14;
      }

      // ─── Items table ─────────────────────────────────────────────────────────
      if (sections.showItemsTable && data.items.length > 0) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(primary).text('PARTIDAS', M, y);
        y += 10;

        // Column config
        const C = { desc: 195, brand: 60, qty: 38, unit: 44, price: 62, disc: 38, total: 58 };
        const rowH = 22;
        const hdrH = 20;

        // Header
        doc.rect(M, y, CW, hdrH).fill(BRAND_DARK);
        const hCols = [
          { label: 'DESCRIPCIÓN',   x: M + 5,                                    w: C.desc - 5 },
          { label: 'MARCA / MOD.',  x: M + C.desc,                               w: C.brand },
          { label: 'CANT.',         x: M + C.desc + C.brand,                     w: C.qty },
          { label: 'UNIDAD',        x: M + C.desc + C.brand + C.qty,             w: C.unit },
          { label: 'PRECIO UNIT.',  x: M + C.desc + C.brand + C.qty + C.unit,   w: C.price },
          { label: 'DSCTO.',        x: M + C.desc + C.brand + C.qty + C.unit + C.price, w: C.disc },
          { label: 'TOTAL',         x: M + C.desc + C.brand + C.qty + C.unit + C.price + C.disc, w: C.total - 5 },
        ];
        hCols.forEach(col =>
          doc.fontSize(6.5).font('Helvetica-Bold').fillColor(BRAND_WHITE)
             .text(col.label, col.x, y + 6, { width: col.w, align: 'center' })
        );
        y += hdrH;

        data.items.forEach((item, idx) => {
          const hasExtra = !!item.notes || !!item.warrantyMonths;
          const lH = hasExtra ? 32 : rowH;
          doc.rect(M, y, CW, lH).fill(idx % 2 === 0 ? BRAND_WHITE : ROW_ALT);
          doc.rect(M, y, CW, lH).stroke(DIVIDER);

          const cy = y + (lH > rowH ? 5 : 6);
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_DARK)
             .text(item.description, M + 5, cy, { width: C.desc - 10, ellipsis: true });
          if (hasExtra) {
            doc.fontSize(6.5).fillColor(TEXT_LIGHT);
            const extras: string[] = [];
            if (item.warrantyMonths) extras.push(`Garantía: ${item.warrantyMonths} meses`);
            if (item.notes) extras.push(item.notes);
            doc.text(extras.join(' · '), M + 5, cy + 11, { width: C.desc - 10 });
          }

          const bLabel = [item.brand, item.model].filter(Boolean).join(' / ');
          const x2 = M + C.desc;
          doc.fontSize(7).font('Helvetica').fillColor(TEXT_MID)
             .text(bLabel || '—',     x2,                         cy, { width: C.brand, align: 'center' })
             .text(String(item.quantity), x2 + C.brand,           cy, { width: C.qty, align: 'center' })
             .text(item.unit || 'pza',  x2 + C.brand + C.qty,     cy, { width: C.unit, align: 'center' });
          doc.fontSize(7.5).fillColor(TEXT_DARK)
             .text(`$${item.unitPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
               x2 + C.brand + C.qty + C.unit, cy, { width: C.price, align: 'right' });
          doc.fontSize(7).fillColor(item.discount > 0 ? '#dc2626' : TEXT_LIGHT)
             .text(item.discount > 0 ? `${item.discount}%` : '—',
               x2 + C.brand + C.qty + C.unit + C.price, cy, { width: C.disc, align: 'center' });
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(TEXT_DARK)
             .text(`$${item.lineTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
               x2 + C.brand + C.qty + C.unit + C.price + C.disc, cy, { width: C.total - 5, align: 'right' });

          y += lH;
        });

        // Bottom rule
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(1).strokeColor(primary).stroke();
        y += 12;
      }

      // ─── Totals ──────────────────────────────────────────────────────────────
      if (sections.showTotals) {
        const tW = 210;
        const tX = M + CW - tW;

        const rows: Array<{ label: string; value: string; bold?: boolean; highlight?: boolean; neg?: boolean }> = [
          { label: 'Subtotal',  value: fmtMXN(data.subtotal, data.currency) },
        ];
        if (data.discountTotal > 0)  rows.push({ label: 'Descuento', value: `− ${fmtMXN(data.discountTotal, data.currency)}`, neg: true });
        if (data.taxTotal > 0)       rows.push({ label: 'IVA 16%',   value: fmtMXN(data.taxTotal, data.currency) });
        if (data.iepsTotal > 0)      rows.push({ label: 'IEPS',      value: fmtMXN(data.iepsTotal, data.currency) });
        if (data.retentionTotal > 0) rows.push({ label: 'Retención', value: `− ${fmtMXN(data.retentionTotal, data.currency)}`, neg: true });
        rows.push({ label: 'TOTAL', value: fmtMXN(data.total, data.currency), bold: true, highlight: true });

        const rH = 18;
        rows.forEach(row => {
          if (row.highlight) {
            doc.rect(tX - 10, y, tW + 10, rH + 2).fill(primary);
            doc.fontSize(9.5).font('Helvetica-Bold').fillColor(BRAND_WHITE)
               .text(row.label, tX, y + 4, { width: 90 })
               .text(row.value,  tX + 90, y + 4, { width: tW - 90, align: 'right' });
          } else {
            doc.fontSize(8).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
               .fillColor(row.neg ? '#dc2626' : TEXT_MID)
               .text(row.label, tX, y + 4, { width: 90 })
               .fillColor(row.neg ? '#dc2626' : TEXT_DARK)
               .text(row.value,  tX + 90, y + 4, { width: tW - 90, align: 'right' });
          }
          y += rH + (row.highlight ? 2 : 0);
        });

        if (data.depositPercent && data.depositPercent > 0) {
          y += 5;
          const dep = data.total * (data.depositPercent / 100);
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_LIGHT)
             .text(`Anticipo requerido ${data.depositPercent}%: ${fmtMXN(dep, data.currency)}`,
               tX - 10, y, { width: tW + 10, align: 'right' });
          y += 14;
        }
        y += 10;
      }

      // ─── Terms / notes ───────────────────────────────────────────────────────
      if (sections.showTerms || sections.showNotes || sections.showPaymentTerms) {
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        y += 12;
        const colW = (CW - 16) / 2;
        let lY = y;
        let rY = y;

        if (sections.showPaymentTerms && data.paymentTerms) {
          doc.fontSize(7).font('Helvetica-Bold').fillColor(primary).text('CONDICIONES DE PAGO', M, lY);
          lY += 11;
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID).text(data.paymentTerms, M, lY, { width: colW });
          lY += doc.heightOfString(data.paymentTerms, { width: colW }) + 8;
        }
        if (data.deliveryTime) {
          doc.fontSize(7).font('Helvetica-Bold').fillColor(primary).text('TIEMPO DE ENTREGA', M, lY);
          lY += 11;
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID).text(data.deliveryTime, M, lY, { width: colW });
          lY += doc.heightOfString(data.deliveryTime, { width: colW }) + 8;
        }

        if (sections.showNotes && data.notes) {
          const rX = M + colW + 16;
          doc.fontSize(7).font('Helvetica-Bold').fillColor(primary).text('NOTAS ADICIONALES', rX, rY);
          rY += 11;
          doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID).text(data.notes, rX, rY, { width: colW });
          rY += doc.heightOfString(data.notes, { width: colW }) + 8;
        }

        y = Math.max(lY, rY) + 10;
      }

      // ─── Signature area ──────────────────────────────────────────────────────
      if (sections.showPreparedBy) {
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        y += 14;
        const sigW = (CW - 20) / 2;
        doc.fontSize(7).font('Helvetica').fillColor(TEXT_LIGHT)
           .text('FIRMA DE AUTORIZACIÓN CLIENTE', M, y)
           .text('ELABORÓ', M + sigW + 20, y);
        y += 34;
        doc.moveTo(M, y).lineTo(M + sigW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        doc.moveTo(M + sigW + 20, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
        y += 8;
        doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MID)
           .text(data.clientName, M, y, { width: sigW, align: 'center' })
           .text(data.preparedBy || data.companyName, M + sigW + 20, y, { width: sigW, align: 'center' });
      }

      // ─── Footer ──────────────────────────────────────────────────────────────
      const fY = H - 36;
      doc.rect(0, fY, W, 36).fill(BRAND_DARK);
      doc.rect(0, fY, W, 3).fill(primary);

      const ftxt = data.footerText || `${data.companyName} · Propuesta comercial confidencial · ${data.quoteNumber}`;
      doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.55)')
         .text(ftxt, M, fY + 12, { width: CW - 100, align: 'left' })
         .text(`${data.date}`, W - M - 100, fY + 12, { width: 100, align: 'right' });

      doc.rect(0, H - 5, W, 5).fill(primary);
      doc.end();
    });
  }
}
