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
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { VentasService } from '../ventas/ventas.service.js';
import { resolveRequiredCompanyId, companyWhere, assertCompanyAccess } from '../common/tenant/tenant-scope.js';
import { appUrls } from '../common/app-urls.js';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import {
  calculateLine,
  calculateTotals,
  maxDiscountPercent,
  normalizeItems,
  type NormalizedCotizacionItem,
  type RawCotizacionItem,
} from './cotizacion-totals.js';
import { CtPurchaseOrderService } from '../smart-quote/orders/ct-purchase-order.service.js';

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
    private readonly domainEvents: DomainEventBusService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    @Inject(forwardRef(() => VentasService)) private readonly ventasService: VentasService,
    @Inject(forwardRef(() => CtPurchaseOrderService))
    private readonly ctPurchaseOrders: CtPurchaseOrderService,
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
    return maxDiscountPercent(items);
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private normalizeItems(items: CreateCotizacionDto['items']) {
    return normalizeItems(items as RawCotizacionItem[]);
  }

  private calculateTotals(items: NormalizedCotizacionItem[]) {
    return calculateTotals(items);
  }

  private buildItemData(items: ReturnType<CotizacionesService['normalizeItems']>) {
    // Mismo cálculo que los totales de la cotización: antes estaba duplicado
    // aquí y cualquier cambio en uno dejaba al otro descuadrado.
    return items.map((item) => ({
      ...item,
      lineTotal: round2(calculateLine(item).total),
    }));
  }

  private async ensureUniqueQuoteNumber(base: string, companyId: number) {
    let candidate = base;
    let counter = 1;
    while (
      await this.db.cotizacion.findFirst({
        where: { quoteNumber: candidate, ...companyWhere(companyId) },
      })
    ) {
      candidate = `${base}-${String(counter).padStart(3, '0')}`;
      counter += 1;
      if (counter > 999) {
        throw new BadRequestException('No se pudo generar un folio unico');
      }
    }
    return candidate;
  }

  async create(dto: CreateCotizacionDto, createdById?: number, companyId?: number | null) {
    const items = this.normalizeItems(dto.items);
    const totals = this.calculateTotals(items);
    const status = normalizeStatus(dto.status) || CotizacionStatus.DRAFT;
    const baseQuoteNumber = dto.quoteNumber.trim();

    let salesClientId = dto.salesClientId ? Number(dto.salesClientId) : null;
    let opportunityId = dto.opportunityId ? Number(dto.opportunityId) : null;
    let clientName = dto.clientName?.trim() || null;
    let clientCompany = dto.clientCompany?.trim() || null;
    let clientEmail = dto.clientEmail?.trim() || null;
    let clientPhone = dto.clientPhone?.trim() || null;
    let clientAddress = dto.clientAddress?.trim() || null;

    const resolvedCompanyId = await resolveRequiredCompanyId(this.db, companyId);

    if (opportunityId) {
      const opportunity = await this.db.salesOpportunity.findFirst({
        where: { id: opportunityId, ...companyWhere(resolvedCompanyId) },
        include: { client: true },
      });
      assertCompanyAccess(opportunity, resolvedCompanyId, 'Oportunidad');
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
      const salesClient = await this.db.salesClient.findFirst({
        where: { id: salesClientId, ...companyWhere(resolvedCompanyId) },
      });
      assertCompanyAccess(salesClient, resolvedCompanyId, 'Cliente comercial');
      clientName = clientName || salesClient.name;
      clientCompany = clientCompany || salesClient.legalName || salesClient.name;
      clientEmail = clientEmail || salesClient.billingEmail;
      clientPhone = clientPhone || salesClient.billingPhone;
      clientAddress = clientAddress || salesClient.fiscalAddress;
    }

    const quoteNumber = await this.ensureUniqueQuoteNumber(baseQuoteNumber, resolvedCompanyId);

    // Toda cotización debe quedar ligada a un cliente comercial (maestro CRM),
    // no solo a texto libre: si no vino salesClientId ni oportunidad, se
    // busca o crea el SalesClient a partir del nombre capturado.
    if (!salesClientId) {
      if (!clientName) {
        throw new BadRequestException('La cotización requiere un cliente: selecciona uno existente o captura al menos el nombre.');
      }
      const existingByName = await this.db.salesClient.findFirst({
        where: { companyId: resolvedCompanyId, name: clientName },
      });
      const salesClient =
        existingByName ??
        (await this.db.salesClient.create({
          data: {
            name: clientName,
            legalName: clientCompany || clientName,
            billingEmail: clientEmail,
            billingPhone: clientPhone,
            fiscalAddress: clientAddress,
            companyId: resolvedCompanyId,
          },
        }));
      salesClientId = salesClient.id;
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
      companyId: resolvedCompanyId,
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
        const fallback = await this.ensureUniqueQuoteNumber(
          `${baseQuoteNumber}-${String(Date.now()).slice(-4)}`,
          resolvedCompanyId,
        );
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
      this.domainEvents.requestAutoApproval({
          entityType: 'COTIZACION',
          entityId: created.id,
          userId: createdById,
          companyId: created.companyId,
          payload: { maxDiscountPercent: maxDiscount, total: created.total },
        });
    }

    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'COTIZACION',
      entityId: created.id,
      companyId: created.companyId,
      userId: createdById ?? undefined,
      payload: {
        status: created.status,
        quoteNumber: created.quoteNumber,
        total: Number(created.total),
        clientName: created.clientName,
      },
    });

    return created;
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const include = { items: true, createdBy: true };
    const tenant = companyWhere(companyId ?? null);
    if (query?.limit) {
      const where = {
        ...tenant,
        ...(query.search
          ? {
              OR: [
                { quoteNumber: { contains: query.search, mode: 'insensitive' as const } },
                { clientName: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        this.db.cotizacion.findMany({ where, orderBy: { createdAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.db.cotizacion.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.db.cotizacion.findMany({
      where: tenant,
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true, createdBy: true, company: true },
    });
    assertCompanyAccess(quote, companyId, 'Cotizacion');
    return quote;
  }

  async update(id: number, dto: UpdateCotizacionDto, updatedById?: number, companyId?: number | null) {
    const existing = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true },
    });
    assertCompanyAccess(existing, companyId, 'Cotizacion');

    if (existing.status !== CotizacionStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden editar cotizaciones en borrador. Las enviadas o aprobadas son inmutables.',
      );
    }

    const tenantId = existing.companyId ?? companyId ?? null;

    if (dto.opportunityId) {
      const opportunity = await this.db.salesOpportunity.findFirst({
        where: { id: Number(dto.opportunityId), ...companyWhere(tenantId) },
      });
      assertCompanyAccess(opportunity, tenantId, 'Oportunidad');
    }
    if (dto.salesClientId) {
      const salesClient = await this.db.salesClient.findFirst({
        where: { id: Number(dto.salesClientId), ...companyWhere(tenantId) },
      });
      assertCompanyAccess(salesClient, tenantId, 'Cliente comercial');
    }

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
      this.domainEvents.requestAutoApproval({
          entityType: 'COTIZACION',
          entityId: id,
          userId: requesterId,
          companyId: result.companyId ?? existing.companyId,
          payload: { maxDiscountPercent: maxDiscount, total: result.total },
        });
    }

    if (status === CotizacionStatus.APPROVED) {
      void this.applyQuoteApprovedSideEffects({
        id,
        quoteNumber: result.quoteNumber,
        companyId: result.companyId,
      });
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: id,
      companyId: result.companyId ?? existing.companyId,
      userId: requesterId,
      payload: {
        status: result.status,
        quoteNumber: result.quoteNumber,
        total: Number(result.total),
        maxDiscountPercent: maxDiscountPercent(finalItems),
      },
    });

    return result;
  }

  async getPdfBuffer(id: number, companyId?: number | null, internal = false) {
    const quote = await this.findOne(id, companyId);
    return this.buildPdf(quote, internal);
  }

  async getInternalPdfBuffer(id: number, companyId?: number | null) {
    return this.getPdfBuffer(id, companyId, true);
  }

  async generatePdfFile(id: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
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

  private async applyQuoteApprovedSideEffects(
    quote: { id: number; quoteNumber: string; companyId: number },
  ) {
    try {
      const draft = await this.ctPurchaseOrders.createDraftOnApproval(quote.id, quote.companyId);
      if (draft) {
        await this.notificationsService.notifyCtOrderDraftReady(quote.id, quote.quoteNumber);
      }
    } catch (error) {
      console.error('CT draft on approval:', error);
    }
  }

  /**
   * Workflow de descuento completado — la cotización puede enviarse al cliente.
   * No cambia el estatus (APPROVED = firma del cliente); publica evento de dominio.
   */
  async onWorkflowDiscountApproved(quoteId: number, companyId: number, actorId?: number) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id: quoteId, ...companyWhere(companyId) },
    });
    if (!quote) return;

    const notifyUserId = actorId ?? quote.createdById;
    if (notifyUserId) {
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'QUOTE_DISCOUNT_APPROVED',
          category: 'sales',
          title: '✅ Descuento aprobado',
          message: `La cotización ${quote.quoteNumber} tiene descuento autorizado. Ya puedes enviarla al cliente.`,
          entityType: 'COTIZACION',
          relatedEntityId: quote.id,
          relatedUrl: appUrls.crmQuote(quote.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: quoteId,
      companyId,
      userId: actorId ?? quote.createdById ?? undefined,
      payload: {
        status: quote.status,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        discountApproved: true,
      },
    });
  }

  /** Descuento rechazado en workflow — notifica al vendedor. */
  async onWorkflowDiscountRejected(
    quoteId: number,
    companyId: number,
    actorId?: number,
    comments?: string | null,
  ) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id: quoteId, ...companyWhere(companyId) },
    });
    if (!quote) return;

    const notifyUserId = quote.createdById ?? actorId;
    if (notifyUserId) {
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'QUOTE_DISCOUNT_REJECTED',
          category: 'sales',
          title: '❌ Descuento no autorizado',
          message: `La cotización ${quote.quoteNumber} no obtuvo aprobación de descuento.${comments ? ` Motivo: ${comments}` : ''}`,
          entityType: 'COTIZACION',
          relatedEntityId: quote.id,
          relatedUrl: appUrls.crmQuote(quote.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: quoteId,
      companyId,
      userId: actorId ?? quote.createdById ?? undefined,
      payload: {
        status: quote.status,
        quoteNumber: quote.quoteNumber,
        discountRejected: true,
        comments: comments?.trim() || null,
      },
    });
  }

  /** Firma → notificar vendedor, marcar oportunidad vinculada como WON. */
  private async applyQuoteSignedSideEffects(
    quote: {
      id: number;
      quoteNumber: string;
      total: unknown;
      companyId: number;
      createdById?: number | null;
    },
    signer: SignCotizacionDto,
  ) {
    await this.notificationsService.notifyQuoteSigned(quote.id, signer.name.trim(), signer.email.trim());
    void this.applyQuoteApprovedSideEffects(quote);

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

  async send(id: number, dto: SendCotizacionDto, senderId?: number, companyId?: number | null) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true },
    });
    assertCompanyAccess(quote, companyId, 'Cotizacion');

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

  private async buildPdf(quote: any, internal = false) {
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
      unitCost: item.unitCost != null ? Number(item.unitCost) : null,
      marginPercent: item.marginPercent != null ? Number(item.marginPercent) : null,
      discount: item.discount,
      tax: item.tax,
      ieps: item.ieps,
      retention: item.retention,
      laborHours: Number(item.laborHours || 0),
      laborRate: Number(item.laborRate || 0),
      warrantyMonths: item.warrantyMonths,
      lineTotal: Number(item.lineTotal),
    }));

    let company = quote.company;
    if (!company && quote.companyId) {
      company = await this.db.companyProfile.findUnique({ where: { id: quote.companyId } });
    }

    return generateCotizacionPdf(
      {
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
      company: company
        ? {
            legalName: company.legalName || 'NEXARA',
            tradeName: company.tradeName,
            rfc: company.rfc,
            fiscalAddress: company.fiscalAddress,
            fiscalPostalCode: company.fiscalPostalCode,
            contactEmail: company.contactEmail,
            contactPhone: company.contactPhone,
            websiteUrl: company.websiteUrl,
          }
        : null,
      items,
    },
    { internal },
    );
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
