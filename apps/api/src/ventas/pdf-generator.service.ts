import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, assertCompanyAccess } from '../common/tenant/tenant-scope.js';
import { pdfFecha } from '../common/pdf/nexara-pdf-theme.js';
import { construirPdfDeCotizacion, type QuotePdfData, type TemplateSections } from './cotizacion-ventas-pdf.js';

/** «21 de noviembre de 2026»: la fecha de la propuesta es el día de la empresa, no el del servidor (UTC). */
const FECHA_LARGA: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };

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
    if (!quote) throw new BadRequestException('No se encontró la cotización o su cliente');

    const tenantId = (quote.opportunity as any)?.companyId ?? null;
    const client = await this.prisma.salesClient.findFirst({
      where: { id: clientId, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(client, tenantId, 'Cliente');
    if (!client) throw new BadRequestException('No se encontró la cotización o su cliente');

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
      date: pdfFecha(new Date(), FECHA_LARGA),
      validity: cot?.validUntil ? pdfFecha(cot.validUntil, FECHA_LARGA) : undefined,
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
    if (!project) throw new BadRequestException('Proyecto no encontrado');
    const client = (project.opportunity as any)?.client;
    if (!client) throw new BadRequestException('Cliente no encontrado');
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
      date: pdfFecha(new Date(), FECHA_LARGA),
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

  /** El dibujo del documento vive en `cotizacion-ventas-pdf.ts`; aquí solo se reúnen los datos. */
  private _buildPdf(data: QuotePdfData, sections: TemplateSections): Promise<Buffer> {
    return construirPdfDeCotizacion(data, sections);
  }
}
