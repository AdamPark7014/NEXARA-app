import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CotizacionStatus, Prisma } from '@prisma/client';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto.js';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';
import { SendCotizacionDto } from './dto/send-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';
import { generateCotizacionPdf } from './cotizacion-pdf.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { VentasService } from '../ventas/ventas.service.js';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeStatus = (status?: string) => {
  if (!status) return undefined;
  const normalized = status.trim().toLowerCase();
  if (normalized === 'draft') return CotizacionStatus.DRAFT;
  if (normalized === 'sent') return CotizacionStatus.SENT;
  if (normalized === 'approved') return CotizacionStatus.APPROVED;
  return undefined;
};

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoApproval: AutoApprovalService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    @Inject(forwardRef(() => VentasService)) private readonly ventasService: VentasService,
  ) {}

  private get db() {
    return this.prisma;
  }

  /**
   * Devuelve el descuento máximo (en %) entre todas las líneas de una cotización.
   * Sirve para evaluar la política de descuentos: si supera 15% se dispara el
   * workflow "Aprobación de descuento en cotización".
   */
  private maxDiscountPercent(items: Array<{ discount: number }>): number {
    if (!items.length) return 0;
    return items.reduce((max, it) => Math.max(max, Number(it.discount) || 0), 0);
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private normalizeItems(items: CreateCotizacionDto['items']) {
    if (!items || !items.length) {
      throw new BadRequestException('Se requiere al menos un concepto');
    }

    return items.map((item) => ({
      productId: item.productId ? Number(item.productId) : null,
      category: item.category?.trim() || 'Otros',
      name: item.name?.trim() || 'Concepto',
      description: item.description?.trim() || null,
      scope: item.scope?.trim() || null,
      brand: item.brand?.trim() || null,
      model: item.model?.trim() || null,
      sku: item.sku?.trim() || null,
      partNumber: item.partNumber?.trim() || null,
      batchReference: item.batchReference?.trim() || null,
      unit: item.unit?.trim() || 'pieza',
      qty: Math.max(1, Number(item.qty) || 1),
      unitPrice: Number(item.unitPrice) || 0,
      discount: Math.max(0, Math.min(100, Number(item.discount) || 0)),
      tax: Math.max(0, Math.min(100, Number(item.tax) || 0)),
      ieps: Math.max(0, Math.min(100, Number(item.ieps) || 0)),
      retention: Math.max(0, Math.min(100, Number(item.retention) || 0)),
      laborHours: Math.max(0, Number(item.laborHours) || 0),
      laborRate: Math.max(0, Number(item.laborRate) || 0),
      warrantyMonths: Math.max(0, Number(item.warrantyMonths) || 0),
      deliveryTime: item.deliveryTime?.trim() || null,
      countryOrigin: item.countryOrigin?.trim() || null,
      notes: item.notes?.trim() || null,
    }));
  }

  private calculateTotals(items: ReturnType<CotizacionesService['normalizeItems']>) {
    return items.reduce(
      (acc, item) => {
        const subtotal = item.qty * item.unitPrice;
        const discount = subtotal * (item.discount / 100);
        const taxable = subtotal - discount;
        const taxAmount = taxable * (item.tax / 100);
        const iepsAmount = taxable * (item.ieps / 100);
        const retentionAmount = taxable * (item.retention / 100);
        const total = taxable + taxAmount + iepsAmount - retentionAmount;
        return {
          subtotal: acc.subtotal + subtotal,
          discountTotal: acc.discountTotal + discount,
          taxTotal: acc.taxTotal + taxAmount,
          iepsTotal: acc.iepsTotal + iepsAmount,
          retentionTotal: acc.retentionTotal + retentionAmount,
          total: acc.total + total,
        };
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, iepsTotal: 0, retentionTotal: 0, total: 0 },
    );
  }

  private buildItemData(items: ReturnType<CotizacionesService['normalizeItems']>) {
    return items.map((item) => {
      const subtotal = item.qty * item.unitPrice;
      const discount = subtotal * (item.discount / 100);
      const taxable = subtotal - discount;
      const taxAmount = taxable * (item.tax / 100);
      const iepsAmount = taxable * (item.ieps / 100);
      const retentionAmount = taxable * (item.retention / 100);
      const total = taxable + taxAmount + iepsAmount - retentionAmount;
      return {
        ...item,
        lineTotal: round2(total),
      };
    });
  }

  private async ensureUniqueQuoteNumber(base: string) {
    let candidate = base;
    let counter = 1;
    while (await this.db.cotizacion.findUnique({ where: { quoteNumber: candidate } })) {
      candidate = `${base}-${String(counter).padStart(3, '0')}`;
      counter += 1;
      if (counter > 999) {
        throw new BadRequestException('No se pudo generar un folio unico');
      }
    }
    return candidate;
  }

  async create(dto: CreateCotizacionDto, createdById?: number) {
    const items = this.normalizeItems(dto.items);
    const totals = this.calculateTotals(items);
    const status = normalizeStatus(dto.status) || CotizacionStatus.DRAFT;
    const baseQuoteNumber = dto.quoteNumber.trim();
    const quoteNumber = await this.ensureUniqueQuoteNumber(baseQuoteNumber);

    let salesClientId = dto.salesClientId ? Number(dto.salesClientId) : null;
    let opportunityId = dto.opportunityId ? Number(dto.opportunityId) : null;
    let clientName = dto.clientName?.trim() || null;
    let clientCompany = dto.clientCompany?.trim() || null;
    let clientEmail = dto.clientEmail?.trim() || null;
    let clientPhone = dto.clientPhone?.trim() || null;
    let clientAddress = dto.clientAddress?.trim() || null;

    if (opportunityId) {
      const opportunity = await this.db.salesOpportunity.findUnique({
        where: { id: opportunityId },
        include: { client: true },
      });
      if (!opportunity) throw new BadRequestException('Oportunidad no encontrada');
      if (!salesClientId && opportunity.clientId) salesClientId = opportunity.clientId;
      if (!clientName && opportunity.client) {
        clientName = opportunity.client.name;
        clientCompany = clientCompany || opportunity.client.legalName || opportunity.client.name;
        clientEmail = clientEmail || opportunity.client.billingEmail;
        clientPhone = clientPhone || opportunity.client.billingPhone;
        clientAddress = clientAddress || opportunity.client.fiscalAddress;
      }
    }

    if (salesClientId) {
      const salesClient = await this.db.salesClient.findUnique({ where: { id: salesClientId } });
      if (!salesClient) throw new BadRequestException('Cliente comercial no encontrado');
      clientName = clientName || salesClient.name;
      clientCompany = clientCompany || salesClient.legalName || salesClient.name;
      clientEmail = clientEmail || salesClient.billingEmail;
      clientPhone = clientPhone || salesClient.billingPhone;
      clientAddress = clientAddress || salesClient.fiscalAddress;
    }

    const data: Prisma.CotizacionUncheckedCreateInput = {
      quoteNumber,
      issueDate: this.parseDate(dto.issueDate) || new Date(),
      validUntil: this.parseDate(dto.validUntil),
      status,
      salesClientId,
      opportunityId,
      clientName,
      clientCompany,
      clientEmail,
      clientPhone,
      clientAddress,
      projectName: dto.projectName?.trim() || null,
      scope: dto.scope?.trim() || null,
      paymentTerms: dto.paymentTerms?.trim() || null,
      deliveryTime: dto.deliveryTime?.trim() || null,
      preparedBy: dto.preparedBy?.trim() || null,
      preparedRole: dto.preparedRole?.trim() || null,
      currency: dto.currency?.trim() || 'MXN',
      depositPercent: dto.depositPercent ?? 0,
      note: dto.note?.trim() || null,
      subtotal: round2(totals.subtotal),
      discountTotal: round2(totals.discountTotal),
      taxTotal: round2(totals.taxTotal),
      iepsTotal: round2(totals.iepsTotal),
      retentionTotal: round2(totals.retentionTotal),
      total: round2(totals.total),
      createdById: createdById || null,
      items: { create: this.buildItemData(items) },
    };

    let created: Awaited<ReturnType<typeof this.db.cotizacion.create>>;
    try {
      created = await this.db.cotizacion.create({
        data,
        include: { items: true, salesClient: true, opportunity: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fallback = await this.ensureUniqueQuoteNumber(`${baseQuoteNumber}-${String(Date.now()).slice(-4)}`);
        created = await this.db.cotizacion.create({
          data: { ...data, quoteNumber: fallback },
          include: { items: true, salesClient: true, opportunity: true },
        });
      } else {
        throw error;
      }
    }

    if (opportunityId && createdById) {
      await this.db.salesOpportunityQuote.create({
        data: {
          opportunityId,
          cotizacionId: created.id,
          versionLabel: created.quoteNumber,
          createdById,
        },
      }).catch(() => undefined);
    }

    if (createdById) {
      const maxDiscount = this.maxDiscountPercent(items);
      this.autoApproval
        .evaluate({
          entityType: 'COTIZACION',
          entityId: created.id,
          userId: createdById,
          payload: { maxDiscountPercent: maxDiscount, total: created.total },
        })
        .catch(() => undefined);
    }

    return created;
  }

  async findAll(query?: PaginationQueryDto) {
    const include = { items: true, createdBy: true };
    if (query?.limit) {
      const where = query.search ? { OR: [{ quoteNumber: { contains: query.search, mode: 'insensitive' as const } }, { clientName: { contains: query.search, mode: 'insensitive' as const } }] } : undefined;
      const [data, total] = await Promise.all([
        this.db.cotizacion.findMany({ where, orderBy: { createdAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.db.cotizacion.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.db.cotizacion.findMany({
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: number) {
    const quote = await this.db.cotizacion.findUnique({
      where: { id },
      include: { items: true, createdBy: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');
    return quote;
  }

  async update(id: number, dto: UpdateCotizacionDto, updatedById?: number) {
    const existing = await this.db.cotizacion.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Cotizacion no encontrada');

    const updateData: Record<string, any> = {
      quoteNumber: dto.quoteNumber?.trim(),
      issueDate: this.parseDate(dto.issueDate),
      validUntil: this.parseDate(dto.validUntil),
      salesClientId: dto.salesClientId !== undefined ? (dto.salesClientId ? Number(dto.salesClientId) : null) : undefined,
      opportunityId: dto.opportunityId !== undefined ? (dto.opportunityId ? Number(dto.opportunityId) : null) : undefined,
      clientName: dto.clientName?.trim(),
      clientCompany: dto.clientCompany?.trim(),
      clientEmail: dto.clientEmail?.trim(),
      clientPhone: dto.clientPhone?.trim(),
      clientAddress: dto.clientAddress?.trim(),
      projectName: dto.projectName?.trim(),
      scope: dto.scope?.trim(),
      paymentTerms: dto.paymentTerms?.trim(),
      deliveryTime: dto.deliveryTime?.trim(),
      preparedBy: dto.preparedBy?.trim(),
      preparedRole: dto.preparedRole?.trim(),
      currency: dto.currency?.trim(),
      depositPercent: dto.depositPercent,
      note: dto.note?.trim(),
    };

    const status = normalizeStatus(dto.status);
    if (status) updateData['status'] = status;

    let result: Awaited<ReturnType<typeof this.db.cotizacion.update>>;
    let finalItems: Array<{ discount: number }>;

    if (dto.items) {
      const items = this.normalizeItems(dto.items);
      const totals = this.calculateTotals(items);
      const itemData = this.buildItemData(items);

      updateData['subtotal'] = round2(totals.subtotal);
      updateData['discountTotal'] = round2(totals.discountTotal);
      updateData['taxTotal'] = round2(totals.taxTotal);
      updateData['iepsTotal'] = round2(totals.iepsTotal);
      updateData['retentionTotal'] = round2(totals.retentionTotal);
      updateData['total'] = round2(totals.total);

      result = await this.db.$transaction(async (tx) => {
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: id } });
        return tx.cotizacion.update({
          where: { id },
          data: {
            ...Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
            items: { create: itemData },
          },
          include: { items: true, createdBy: true },
        });
      });
      finalItems = items;
    } else {
      result = await this.db.cotizacion.update({
        where: { id },
        data: Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
        include: { items: true, createdBy: true },
      });
      // Sin items en el payload reutilizamos los existentes para evaluar política
      // de descuentos: así detectamos si el descuento previo (1%) ya rebasaba
      // los umbrales aunque el PATCH actual sólo cambió status/cliente/etc.
      finalItems = existing.items.map((it) => ({ discount: Number(it.discount) }));
    }

    const requesterId = updatedById ?? existing.createdById ?? undefined;
    if (requesterId) {
      const maxDiscount = this.maxDiscountPercent(finalItems);
      // Siempre re-evaluamos en update (parcial o total). El servicio de
      // auto-approval es idempotente: no creará un workflow nuevo si ya hay
      // uno activo para la misma entidad.
      this.autoApproval
        .evaluate({
          entityType: 'COTIZACION',
          entityId: id,
          userId: requesterId,
          payload: { maxDiscountPercent: maxDiscount, total: result.total },
        })
        .catch(() => undefined);
    }
    return result;
  }

  async getPdfBuffer(id: number) {
    const quote = await this.findOne(id);
    return this.buildPdf(quote);
  }

  async generatePdfFile(id: number) {
    const quote = await this.findOne(id);
    const pdf = await this.buildPdf(quote);
    const dir = path.resolve(process.cwd(), 'uploads', 'cotizaciones');
    await fs.mkdir(dir, { recursive: true });
    const filename = `cotizacion-${quote.quoteNumber}-${Date.now()}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.writeFile(outPath, pdf);
    return { pdfUrl: `/uploads/cotizaciones/${filename}` };
  }

  async getPublicByToken(token: string) {
    const quote = await this.db.cotizacion.findUnique({
      where: { publicToken: token },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      projectName: quote.projectName,
      currency: quote.currency,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      iepsTotal: quote.iepsTotal,
      retentionTotal: quote.retentionTotal,
      total: quote.total,
      items: quote.items,
    };
  }

  async signByToken(token: string, dto: SignCotizacionDto) {
    const quote = await this.db.cotizacion.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    if (quote.status === CotizacionStatus.APPROVED) {
      return this.db.cotizacion.findUnique({
        where: { id: quote.id },
        include: { items: true },
      });
    }

    const updated = await this.db.cotizacion.update({
      where: { id: quote.id },
      data: {
        status: CotizacionStatus.APPROVED,
        signedByName: dto.name.trim(),
        signedByEmail: dto.email.trim(),
        signedAt: new Date(),
      },
      include: { items: true },
    });

    void this.applyQuoteSignedSideEffects(updated, dto).catch((error) => {
      console.error('Error applying quote signed side effects:', error);
    });

    return updated;
  }

  /** Firma → notificar vendedor, marcar oportunidad vinculada como WON. */
  private async applyQuoteSignedSideEffects(
    quote: { id: number; quoteNumber: string; total: unknown; createdById?: number | null },
    signer: SignCotizacionDto,
  ) {
    await this.notificationsService.notifyQuoteSigned(quote.id, signer.name.trim(), signer.email.trim());

    const links = await this.db.salesOpportunityQuote.findMany({
      where: { cotizacionId: quote.id },
      include: { opportunity: true },
    });

    const quoteTotal = Number(quote.total ?? 0);
    for (const link of links) {
      const opp = link.opportunity;
      if (!opp || opp.stage === 'WON' || opp.stage === 'LOST') continue;

      const prevStage = opp.stage;
      const actorId = quote.createdById || opp.ownerId || link.createdById;
      const closedAt = new Date();

      await this.db.salesOpportunity.update({
        where: { id: opp.id },
        data: {
          stage: 'WON',
          closedAt,
          probability: 100,
          ...(quoteTotal > 0 ? { value: quoteTotal } : {}),
        },
      });

      await this.db.salesOpportunityNote.create({
        data: {
          opportunityId: opp.id,
          message: `Cotización ${quote.quoteNumber} firmada por ${signer.name.trim()} (${signer.email.trim()}). Oportunidad marcada como ganada automáticamente.`,
          createdById: actorId,
        },
      });

      if (actorId) {
        void this.notificationHierarchy
          .notifySalesOpportunityStageChanged(
            actorId,
            opp.id,
            opp.title,
            String(prevStage),
            'WON',
            'Cliente',
          )
          .catch(() => undefined);
      }

      void this.ventasService
        .autoEnsureSalesProjectFromWonOpportunity(opp.id, actorId || undefined)
        .catch(() => undefined);
    }
  }

  /** Envío → mover oportunidad vinculada a etapa Cotización (PROPOSAL). */
  private async applyQuoteSentSideEffects(quoteId: number) {
    const links = await this.db.salesOpportunityQuote.findMany({
      where: { cotizacionId: quoteId },
      include: { opportunity: true },
    });

    const bumpFrom = new Set(['DISCOVERY', 'QUALIFICATION']);
    for (const link of links) {
      const opp = link.opportunity;
      if (!opp || opp.stage === 'WON' || opp.stage === 'LOST') continue;
      if (!bumpFrom.has(opp.stage)) continue;

      const prevStage = opp.stage;
      const actorId = opp.ownerId || link.createdById;
      await this.db.salesOpportunity.update({
        where: { id: opp.id },
        data: { stage: 'PROPOSAL' },
      });

      if (actorId) {
        void this.notificationHierarchy
          .notifySalesOpportunityStageChanged(
            actorId,
            opp.id,
            opp.title,
            String(prevStage),
            'PROPOSAL',
            'Sistema',
          )
          .catch(() => undefined);
      }
    }
  }

  async send(id: number, dto: SendCotizacionDto, senderId?: number) {
    const quote = await this.db.cotizacion.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    const email = dto.email?.trim() || quote.clientEmail?.trim();
    if (!email) throw new BadRequestException('Email de cliente requerido');

    const token = quote.publicToken || randomBytes(24).toString('hex');
    const status = CotizacionStatus.SENT;

    const updated = await this.db.cotizacion.update({
      where: { id },
      data: {
        status,
        publicToken: token,
        sentToEmail: email,
        sentAt: new Date(),
        updatedAt: new Date(),
        createdBy: quote.createdById || senderId ? { connect: { id: quote.createdById || senderId! } } : undefined,
      },
      include: { items: true },
    });

    const pdf = await this.buildPdf(updated);
    await this.sendEmail(updated, email, dto.message, pdf, token);

    void this.applyQuoteSentSideEffects(updated.id).catch((error) => {
      console.error('Error applying quote sent side effects:', error);
    });

    return updated;
  }

  private async buildPdf(quote: any) {
    const items = quote.items.map((item: any) => ({
      category: item.category,
      name: item.name,
      description: item.description,
      brand: item.brand,
      model: item.model,
      sku: item.sku,
      partNumber: item.partNumber,
      batchReference: item.batchReference,
      unit: item.unit,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
      discount: item.discount,
      tax: item.tax,
      ieps: item.ieps,
      retention: item.retention,
      laborHours: Number(item.laborHours || 0),
      laborRate: Number(item.laborRate || 0),
      warrantyMonths: item.warrantyMonths,
      lineTotal: Number(item.lineTotal),
    }));

    return generateCotizacionPdf({
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate.toISOString().slice(0, 10),
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      clientPhone: quote.clientPhone,
      clientAddress: quote.clientAddress,
      projectName: quote.projectName,
      scope: quote.scope,
      paymentTerms: quote.paymentTerms,
      deliveryTime: quote.deliveryTime,
      preparedBy: quote.preparedBy,
      preparedRole: quote.preparedRole,
      currency: quote.currency,
      depositPercent: quote.depositPercent,
      note: quote.note,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      taxTotal: Number(quote.taxTotal),
      iepsTotal: Number(quote.iepsTotal || 0),
      retentionTotal: Number(quote.retentionTotal || 0),
      total: Number(quote.total),
      items,
    });
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_USER'];
    const pass = process.env['SMTP_VENTAS_PASS'] || process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendEmail(quote: any, email: string, message: string | undefined, pdf: Buffer, token: string) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_FROM'] || 'ventas@nexara.com.mx';
    const baseUrl = process.env['PUBLIC_WEB_URL'] || 'http://localhost:3000';
    const signUrl = `${baseUrl.replace(/\/+$/, '')}/cotizaciones/firmar/${token}`;

    const htmlMessage = `
      <p>Hola ${quote.clientName || 'cliente'},</p>
      <p>Adjuntamos la cotizacion ${quote.quoteNumber}.</p>
      ${message ? `<p>${message}</p>` : ''}
      <p>Para firmar la cotizacion visita: <a href="${signUrl}">${signUrl}</a></p>
    `;

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: `Cotizacion ${quote.quoteNumber}`,
        html: htmlMessage,
        attachments: [
          {
            filename: `cotizacion-${quote.quoteNumber}.pdf`,
            content: pdf,
          },
        ],
      });
    } catch {
      throw new InternalServerErrorException('No se pudo enviar el correo');
    }
  }
}
