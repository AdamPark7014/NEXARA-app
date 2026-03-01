import { Injectable, BadRequestException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service.js';
import fs from 'fs';
import path from 'path';

interface QuotePdfData {
  clientName: string;
  clientCompany?: string;
  clientTaxId?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectName: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    quantity_total: number;
  }>;
  subtotal: number;
  discounts: number;
  taxes: number;
  total: number;
  currency?: string;
  notes?: string;
  date?: string;
  validity?: string;
  quoteNumber: string;
  paymentTerms?: string;
  preparedBy?: string;
}

interface OrderPdfData extends QuotePdfData {
  projectBudget: number;
  projectCosts: number;
  projectMargin: number;
  orderNumber: string;
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

@Injectable()
export class PdfGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveTemplateSections(template: any): TemplateSections {
    const defaults: TemplateSections = {
      showClientInfo: true,
      showProjectScope: true,
      showItemsTable: true,
      showTotals: true,
      showTerms: true,
      showNotes: true,
      showPreparedBy: true,
      showValidity: true,
      showPaymentTerms: true,
      showFooterBrand: true,
    };

    if (!template?.sections || typeof template.sections !== 'object') return defaults;
    const raw = template.sections as Record<string, unknown>;
    return {
      showClientInfo: raw.showClientInfo !== false,
      showProjectScope: raw.showProjectScope !== false,
      showItemsTable: raw.showItemsTable !== false,
      showTotals: raw.showTotals !== false,
      showTerms: raw.showTerms !== false,
      showNotes: raw.showNotes !== false,
      showPreparedBy: raw.showPreparedBy !== false,
      showValidity: raw.showValidity !== false,
      showPaymentTerms: raw.showPaymentTerms !== false,
      showFooterBrand: raw.showFooterBrand !== false,
    };
  }

  /**
   * Genera un PDF de cotización dinámico embebiendo datos del cliente
   */
  async generateQuotePdf(
    opportunityQuoteId: number,
    clientId: number,
    templateId?: number,
  ): Promise<Buffer> {
    // Fetch data
    const quote = await this.prisma.salesOpportunityQuote.findUnique({
      where: { id: opportunityQuoteId },
      include: {
        opportunity: {
          include: { client: true },
        },
        cotizacion: { include: { items: true } },
        createdBy: true,
      },
    });

    const client = await this.prisma.salesClient.findUnique({
      where: { id: clientId },
    });

    let template = null;
    if (templateId) {
      template = await this.prisma.orderTemplate.findUnique({
        where: { id: templateId },
      });
    } else {
      // Get default template
      template = await this.prisma.orderTemplate.findFirst({
        where: { isDefault: true },
      });
    }

    if (!quote || !client) {
      throw new BadRequestException('Quote or client not found');
    }

    // Build PDF data
    const pdfData: QuotePdfData = {
      clientName: client.name,
      clientCompany: client.legalName || undefined,
      clientTaxId: client.taxId || undefined,
      clientAddress: client.fiscalAddress || undefined,
      clientEmail: client.billingEmail || undefined,
      clientPhone: client.billingPhone || undefined,
      projectName: quote.opportunity?.description || 'Proyecto',
      items: (quote.cotizacion?.items || []).map((item: any) => ({
        description: item.name,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        quantity_total: item.qty * item.unitPrice,
      })),
      subtotal: Number(quote.cotizacion?.subtotal || 0),
      discounts: Number(quote.cotizacion?.discountTotal || 0),
      taxes: Number(quote.cotizacion?.taxTotal || 0) + Number(quote.cotizacion?.iepsTotal || 0),
      total: Number(quote.cotizacion?.total || 0),
      currency: 'MXN',
      notes: quote.cotizacion?.note || '',
      date: new Date().toLocaleDateString('es-MX'),
      validity: quote.cotizacion?.validUntil?.toLocaleDateString('es-MX'),
      quoteNumber: quote.cotizacion?.quoteNumber || `COT-${quote.id}`,
      paymentTerms: quote.cotizacion?.paymentTerms || 'Contra entrega',
      preparedBy: quote.createdBy?.nombre || 'NEXARA',
    };

    return this._generatePdfDocument(pdfData, template, 'quote');
  }

  /**
   * Genera un PDF de orden embebiendo datos del proyecto y cliente
   */
  async generateOrderPdf(projectId: number, templateId?: number): Promise<Buffer> {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: {
        opportunity: {
          include: {
            client: true,
            quotes: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                cotizacion: { include: { items: true } },
                createdBy: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const client = project.opportunity?.client;
    const quote = project.opportunity?.quotes?.[0];

    if (!client) {
      throw new BadRequestException('Client not found');
    }

    let template = null;
    if (templateId) {
      template = await this.prisma.orderTemplate.findUnique({
        where: { id: templateId },
      });
    } else {
      template = await this.prisma.orderTemplate.findFirst({
        where: { isDefault: true },
      });
    }

    const pdfData: OrderPdfData = {
      clientName: client.name,
      clientCompany: client.legalName || undefined,
      clientTaxId: client.taxId || undefined,
      clientAddress: client.fiscalAddress || undefined,
      clientEmail: client.billingEmail || undefined,
      clientPhone: client.billingPhone || undefined,
      projectName: project.name,
      items: (quote?.cotizacion?.items || []).map((item: any) => ({
        description: item.name,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        quantity_total: item.qty * item.unitPrice,
      })),
      subtotal: Number(quote?.cotizacion?.subtotal || 0),
      discounts: Number(quote?.cotizacion?.discountTotal || 0),
      taxes: Number(quote?.cotizacion?.taxTotal || 0) + Number(quote?.cotizacion?.iepsTotal || 0),
      total: Number(quote?.cotizacion?.total || 0),
      projectBudget: Number(project.budget),
      projectCosts:
        Number(project.costProducts) +
        Number(project.costViaticos) +
        Number(project.costOperativo),
      projectMargin: Number(project.margin),
      currency: 'MXN',
      notes: quote?.cotizacion?.note || '',
      date: new Date().toLocaleDateString('es-MX'),
      orderNumber: `ORD-${project.id}-${Date.now()}`,
      quoteNumber: quote?.cotizacion?.quoteNumber || `COT-${quote?.id}`,
      paymentTerms: quote?.cotizacion?.paymentTerms || 'Contra entrega',
      preparedBy: quote?.createdBy?.nombre || 'NEXARA',
    };

    return this._generatePdfDocument(pdfData, template, 'order');
  }

  /**
   * Método privado para generar el documento PDF con estilos personalizados
   */
  private _generatePdfDocument(
    data: QuotePdfData | OrderPdfData,
    template: any,
    docType: 'quote' | 'order',
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error) => reject(error));

      const primaryColor = template?.primaryColor || '#1F6BBA';
      const secondaryColor = template?.secondaryColor || '#F5F7FB';
      const textColor = template?.textColor || '#1E293B';
      const darkColor = '#0B1F3A';
      const sections = this.resolveTemplateSections(template);

      const margin = 40;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - margin * 2;

      // ===== HEADER =====
      this._drawHeader(doc, data, template, primaryColor, darkColor, secondaryColor, margin, pageWidth, sections);

      doc.fillColor(textColor);

      if (sections.showClientInfo) {
        doc.moveDown(1);
        this._drawClientInfo(doc, data, primaryColor, margin, contentWidth);
      }

      if (sections.showItemsTable) {
        doc.moveDown(1);
        this._drawItemsTable(doc, data, primaryColor, margin, contentWidth);
      }

      if (sections.showTotals) {
        doc.moveDown(0.5);
        this._drawTotalsSection(doc, data, primaryColor, darkColor, margin, contentWidth);
      }

      if (docType === 'order' && 'projectBudget' in data && sections.showProjectScope) {
        doc.moveDown(0.8);
        this._drawBudgetSection(doc, data as OrderPdfData, primaryColor, margin, contentWidth);
      }

      if (sections.showTerms || sections.showNotes || sections.showPaymentTerms) {
        doc.moveDown(1);
        this._drawTermsAndNotes(doc, data, primaryColor, margin, contentWidth, sections);
      }

      // ===== FOOTER =====
      doc.moveDown(1);
      this._drawFooter(doc, data, template, primaryColor, darkColor, margin, pageWidth, sections);

      doc.end();
    });
  }

  /**
   * Dibuja el header del documento
   */
  private _drawHeader(
    doc: any,
    data: any,
    template: any,
    primaryColor: string,
    darkColor: string,
    lightColor: string,
    margin: number,
    pageWidth: number,
    sections: TemplateSections,
  ): void {
    // Background color
    doc.rect(0, 0, pageWidth, 100).fill(lightColor);
    doc.rect(0, 0, pageWidth, 5).fill(primaryColor);

    // Logo (if exists)
    if (template?.headerLogo && fs.existsSync(template.headerLogo)) {
      try {
        doc.image(template.headerLogo, margin, 20, { width: 80, height: 60 });
      } catch {
        // Silent fail if logo not loadable
      }
    }

    // Title
    doc
      .fillColor(darkColor)
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(template?.headerText || data.quoteNumber || 'COTIZACIÓN', margin + 100, 25, { width: 260 });

    // Doc type badge
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666')
      .text(data.quoteNumber || 'Propuesta Comercial', margin + 100, 55);

    if (template?.companyName) {
      doc.fontSize(9).font('Helvetica').fillColor('#4b5563').text(template.companyName, margin + 100, 70);
    }

    // Right column info
    const rightX = margin + pageWidth - 200;
    doc
      .fontSize(9)
      .fillColor('#333')
      .text(`Fecha: ${data.date || ''}`, rightX, 25);
    if (sections.showValidity && data.validity) {
      doc.text(`Vigencia: ${data.validity}`, rightX, 40);
    }
    doc.text(`Moneda: ${data.currency || 'MXN'}`, rightX, 55);
    if (template?.companyEmail) {
      doc.text(`Email: ${template.companyEmail}`, rightX, 70);
    }
    if (template?.companyPhone) {
      doc.text(`Tel: ${template.companyPhone}`, rightX, 85);
    }
  }

  /**
   * Dibuja información de cliente
   */
  private _drawClientInfo(
    doc: any,
    data: any,
    primaryColor: string,
    margin: number,
    contentWidth: number,
  ): void {
    // Sección Cliente
    doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor).text('CLIENTE', margin);

    const boxWidth = contentWidth / 2 - 10;

    // Left column
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    const leftX = margin;
    let y = doc.y + 5;

    doc.text(`Nombre: ${data.clientName || 'N/A'}`, leftX, y);
    y += 15;
    if (data.clientCompany) {
      doc.text(`Empresa: ${data.clientCompany}`, leftX, y);
      y += 15;
    }
    if (data.clientTaxId) {
      doc.text(`RFC: ${data.clientTaxId}`, leftX, y);
      y += 15;
    }

    // Right column
    const rightX = margin + contentWidth / 2;
    y = doc.y - 45;

    if (data.clientEmail) {
      doc.text(`Email: ${data.clientEmail}`, rightX, y);
      y += 15;
    }
    if (data.clientPhone) {
      doc.text(`Tel: ${data.clientPhone}`, rightX, y);
      y += 15;
    }
    if (data.clientAddress) {
      doc.text(`Domicilio: ${data.clientAddress}`, rightX, y, { width: boxWidth });
    }
  }

  /**
   * Dibuja tabla de items
   */
  private _drawItemsTable(doc: any, data: any, primaryColor: string, margin: number, contentWidth: number): void {
    const tableMargin = margin;
    const tableTop = doc.y + 10;
    const colWidth = [250, 60, 80, 100];
    const rowHeight = 25;

    // Header
    doc.rect(tableMargin, tableTop, contentWidth, rowHeight).fill(primaryColor);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white');
    doc.text('Descripción', tableMargin + 5, tableTop + 5, { width: colWidth[0] - 10 });
    doc.text('Cantidad', tableMargin + colWidth[0], tableTop + 5, { width: colWidth[1] });
    doc.text('P. Unitario', tableMargin + colWidth[0] + colWidth[1], tableTop + 5, { width: colWidth[2] });
    doc.text('Total', tableMargin + colWidth[0] + colWidth[1] + colWidth[2], tableTop + 5, { width: colWidth[3] });

    // Items
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    let currentY = tableTop + rowHeight;

    (data.items || []).forEach((item: any, index: number) => {
      const itemTotal = (item.quantity * item.unitPrice).toFixed(2);
      const bgColor = index % 2 === 0 ? '#f9f9f9' : 'white';

      doc.rect(tableMargin, currentY, contentWidth, rowHeight).fill(bgColor);

      doc.text(item.description || '', tableMargin + 5, currentY + 5, { width: colWidth[0] - 10 });
      doc.text(String(item.quantity), tableMargin + colWidth[0], currentY + 5, { width: colWidth[1] });
      doc.text(`$${Number(item.unitPrice).toFixed(2)}`, tableMargin + colWidth[0] + colWidth[1], currentY + 5, {
        width: colWidth[2],
      });
      doc.text(`$${itemTotal}`, tableMargin + colWidth[0] + colWidth[1] + colWidth[2], currentY + 5, {
        width: colWidth[3],
      });

      currentY += rowHeight;
    });

    doc.moveDown(data.items.length + 1);
  }

  /**
   * Dibuja sección de totales
   */
  private _drawTotalsSection(
    doc: any,
    data: any,
    primaryColor: string,
    darkColor: string,
    margin: number,
    contentWidth: number,
  ): void {
    const rightX = margin + contentWidth - 200;
    const colWidth = 80;

    // Subtotal
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('Subtotal:', rightX, doc.y, { width: 80 });
    doc.text(`$${Number(data.subtotal).toFixed(2)}`, rightX + colWidth, doc.y - 15);

    // Discounts
    if (data.discounts && data.discounts > 0) {
      doc.text('Descuentos:', rightX, doc.y + 5, { width: 80 });
      doc.text(`-$${Number(data.discounts).toFixed(2)}`, rightX + colWidth, doc.y - 15);
    }

    // Taxes
    if (data.taxes && data.taxes > 0) {
      doc.text('Impuestos:', rightX, doc.y + 5, { width: 80 });
      doc.text(`$${Number(data.taxes).toFixed(2)}`, rightX + colWidth, doc.y - 15);
    }

    // Total (highlighted)
    doc.moveDown(1);
    doc.rect(rightX - 10, doc.y, 200, 30).fill(primaryColor);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('white');
    doc.text('TOTAL:', rightX, doc.y + 5, { width: 80 });
    doc.text(`$${Number(data.total).toFixed(2)}`, rightX + colWidth, doc.y - 15);

    doc.moveDown(2);
  }

  /**
   * Dibuja sección de presupuesto (solo para órdenes)
   */
  private _drawBudgetSection(
    doc: any,
    data: OrderPdfData,
    primaryColor: string,
    margin: number,
    contentWidth: number,
  ): void {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor).text('INFORMACIÓN DE PROYECTO', margin);

    const col1 = margin;
    const col2 = margin + contentWidth / 3;
    const col3 = margin + (contentWidth * 2) / 3;

    doc.fontSize(9).font('Helvetica').fillColor('#333').moveDown(0.3);

    doc.text(
      `Presupuesto: $${Number(data.projectBudget).toFixed(2)}`,
      col1,
      doc.y,
    );
    doc.text(
      `Costos: $${Number(data.projectCosts).toFixed(2)}`,
      col2,
      doc.y - 15,
    );
    doc.text(
      `Margen: $${Number(data.projectMargin).toFixed(2)}`,
      col3,
      doc.y - 15,
    );
  }

  /**
   * Dibuja términos y notas
   */
  private _drawTermsAndNotes(
    doc: any,
    data: any,
    primaryColor: string,
    margin: number,
    contentWidth: number,
    sections: TemplateSections,
  ): void {
    if (sections.showPaymentTerms && data.paymentTerms) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('TÉRMINOS DE PAGO', margin);
      doc.fontSize(9).font('Helvetica').fillColor('#333').text(data.paymentTerms, margin, doc.y + 3, {
        width: contentWidth,
      });
    }

    if (sections.showNotes && data.notes) {
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('NOTAS', margin);
      doc.fontSize(9).font('Helvetica').fillColor('#333').text(data.notes, margin, doc.y + 3, {
        width: contentWidth,
      });
    }
  }

  /**
   * Dibuja footer del documento
   */
  private _drawFooter(
    doc: any,
    data: any,
    template: any,
    primaryColor: string,
    darkColor: string,
    margin: number,
    pageWidth: number,
    sections: TemplateSections,
  ): void {
    const footerY = doc.page.height - 50;

    doc.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).stroke(primaryColor);

    const footerAlignment = (template?.footerAlignment || 'center') as 'left' | 'center' | 'right';
    const company = template?.companyName || 'NEXARA SOFTWARE';
    const footerText = template?.footerText || `${company} · Documento comercial confidencial`;

    doc.fontSize(9).font('Helvetica').fillColor('#666');
    if (sections.showPreparedBy) {
      doc.text(`Preparado por: ${data.preparedBy || company}`, margin, footerY + 10);
    }
    doc.text(`Documento: ${data.quoteNumber} - ${data.date}`, margin, footerY + 20);
    if (sections.showFooterBrand) {
      doc.text(footerText, margin, footerY + 30, {
        align: footerAlignment,
        width: pageWidth - margin * 2,
      });
    }
  }
}
