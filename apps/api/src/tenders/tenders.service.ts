import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  private async generateTenderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await (this.prisma as any).tender.count({
      where: { tenderNumber: { startsWith: `LIC-${year}` } },
    });
    return `LIC-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: {
    title: string;
    description?: string;
    tenderType?: string;
    conveningEntity: string;
    conveningContact?: string;
    conveningEmail?: string;
    conveningPhone?: string;
    publicationUrl?: string;
    externalReference?: string;
    budgetCeiling?: number;
    ourBidAmount?: number;
    estimatedCost?: number;
    guaranteeAmount?: number;
    currency?: string;
    publishDate?: string;
    questionsDeadline?: string;
    submissionDeadline?: string;
    openingDate?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    scope?: string;
    technicalRequirements?: string;
    legalRequirements?: string;
    ownerId?: number;
  }) {
    const tenderNumber = await this.generateTenderNumber();
    const expectedMargin = (dto.ourBidAmount || 0) - (dto.estimatedCost || 0);

    const tender = await (this.prisma as any).tender.create({
      data: {
        tenderNumber,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        tenderType: (dto.tenderType as any) || 'PUBLIC_GOV',
        conveningEntity: dto.conveningEntity.trim(),
        conveningContact: dto.conveningContact?.trim() || null,
        conveningEmail: dto.conveningEmail?.trim() || null,
        conveningPhone: dto.conveningPhone?.trim() || null,
        publicationUrl: dto.publicationUrl?.trim() || null,
        externalReference: dto.externalReference?.trim() || null,
        budgetCeiling: new Prisma.Decimal(dto.budgetCeiling || 0),
        ourBidAmount: new Prisma.Decimal(dto.ourBidAmount || 0),
        estimatedCost: new Prisma.Decimal(dto.estimatedCost || 0),
        expectedMargin: new Prisma.Decimal(expectedMargin),
        guaranteeAmount: new Prisma.Decimal(dto.guaranteeAmount || 0),
        currency: dto.currency || 'MXN',
        publishDate: dto.publishDate ? new Date(dto.publishDate) : null,
        questionsDeadline: dto.questionsDeadline ? new Date(dto.questionsDeadline) : null,
        submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : null,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
        contractStartDate: dto.contractStartDate ? new Date(dto.contractStartDate) : null,
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
        scope: dto.scope?.trim() || null,
        technicalRequirements: dto.technicalRequirements?.trim() || null,
        legalRequirements: dto.legalRequirements?.trim() || null,
        ownerId: dto.ownerId ?? null,
      },
      include: { owner: { select: { id: true, nombre: true } } },
    });

    return tender;
  }

  async list(filters?: { status?: string; tenderType?: string; ownerId?: number }) {
    const where: any = { deletedAt: null };
    if (filters?.status) where.status = filters.status;
    if (filters?.tenderType) where.tenderType = filters.tenderType;
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    return (this.prisma as any).tender.findMany({
      where,
      include: {
        owner: { select: { id: true, nombre: true } },
        opportunity: { select: { id: true, title: true, stage: true } },
        _count: { select: { documents: true, events: true } },
      },
      orderBy: { submissionDeadline: 'asc' },
    });
  }

  async getOne(id: number) {
    const tender = await (this.prisma as any).tender.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, nombre: true, email: true } },
        opportunity: { select: { id: true, title: true, stage: true, value: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { occursAt: 'asc' } },
      },
    });
    if (!tender) throw new NotFoundException('Licitación no encontrada');
    return tender;
  }

  async update(id: number, dto: any) {
    const existing = await (this.prisma as any).tender.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Licitación no encontrada');

    const data: any = { ...dto };
    if (dto.publishDate) data.publishDate = new Date(dto.publishDate);
    if (dto.questionsDeadline) data.questionsDeadline = new Date(dto.questionsDeadline);
    if (dto.submissionDeadline) data.submissionDeadline = new Date(dto.submissionDeadline);
    if (dto.openingDate) data.openingDate = new Date(dto.openingDate);
    if (dto.awardDate) data.awardDate = new Date(dto.awardDate);
    if (dto.contractStartDate) data.contractStartDate = new Date(dto.contractStartDate);
    if (dto.contractEndDate) data.contractEndDate = new Date(dto.contractEndDate);
    if (dto.budgetCeiling !== undefined) data.budgetCeiling = new Prisma.Decimal(dto.budgetCeiling);
    if (dto.ourBidAmount !== undefined) data.ourBidAmount = new Prisma.Decimal(dto.ourBidAmount);
    if (dto.estimatedCost !== undefined) data.estimatedCost = new Prisma.Decimal(dto.estimatedCost);
    if (dto.guaranteeAmount !== undefined) data.guaranteeAmount = new Prisma.Decimal(dto.guaranteeAmount);

    // Recompute expected margin
    const bid = Number(data.ourBidAmount ?? existing.ourBidAmount);
    const cost = Number(data.estimatedCost ?? existing.estimatedCost);
    data.expectedMargin = new Prisma.Decimal(bid - cost);

    return (this.prisma as any).tender.update({
      where: { id },
      data,
      include: { owner: { select: { id: true, nombre: true } } },
    });
  }

  async setStatus(id: number, status: string, opts?: { awardedToCompetitor?: string; awardNotes?: string }) {
    const tender = await (this.prisma as any).tender.findUnique({ where: { id } });
    if (!tender) throw new NotFoundException('Licitación no encontrada');

    const data: any = { status };
    if (status === 'AWARDED' || status === 'LOST') {
      data.awardDate = new Date();
    }
    if (opts?.awardedToCompetitor) data.awardedToCompetitor = opts.awardedToCompetitor;
    if (opts?.awardNotes) data.awardNotes = opts.awardNotes;

    const updated = await (this.prisma as any).tender.update({ where: { id }, data });

    if (status === 'AWARDED') {
      try {
        await this.promoteToOpportunity(id);
      } catch (e) {
        // swallow — promotion is optional
      }
    }

    return updated;
  }

  /** Si se gana la licitación, crea SalesOpportunity en stage WON y vincula. */
  async promoteToOpportunity(tenderId: number) {
    const tender = await (this.prisma as any).tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Licitación no encontrada');
    if (tender.salesOpportunityId) {
      return this.prisma.salesOpportunity.findUnique({ where: { id: tender.salesOpportunityId } });
    }
    if (tender.status !== 'AWARDED') {
      throw new BadRequestException('Solo licitaciones adjudicadas se promueven a oportunidad');
    }

    const opportunity = await this.prisma.salesOpportunity.create({
      data: {
        title: `Licitación ${tender.tenderNumber} — ${tender.title}`,
        description: tender.scope || tender.description || null,
        stage: 'WON' as any,
        value: new Prisma.Decimal(tender.ourBidAmount),
        probability: 100,
        ownerId: tender.ownerId ?? null,
        closedAt: tender.awardDate || new Date(),
      },
    });

    await (this.prisma as any).tender.update({
      where: { id: tenderId },
      data: { salesOpportunityId: opportunity.id },
    });

    return opportunity;
  }

  // ── Documents ─────────────────────────────────────────────────────
  async addDocument(tenderId: number, dto: { documentType: string; name: string; url?: string; notes?: string; uploadedBy?: number }) {
    return (this.prisma as any).tenderDocument.create({
      data: {
        tenderId,
        documentType: dto.documentType as any,
        name: dto.name.trim(),
        url: dto.url?.trim() || null,
        notes: dto.notes?.trim() || null,
        uploadedBy: dto.uploadedBy ?? null,
      },
    });
  }

  async listDocuments(tenderId: number) {
    return (this.prisma as any).tenderDocument.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Events ────────────────────────────────────────────────────────
  async addEvent(tenderId: number, dto: { eventName: string; description?: string; occursAt: string }) {
    return (this.prisma as any).tenderEvent.create({
      data: {
        tenderId,
        eventName: dto.eventName.trim(),
        description: dto.description?.trim() || null,
        occursAt: new Date(dto.occursAt),
      },
    });
  }

  // ── Dashboard ─────────────────────────────────────────────────────
  async getDashboard() {
    const [byStatus, byType, totalValue, upcoming] = await Promise.all([
      (this.prisma as any).tender.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { ourBidAmount: true },
        where: { deletedAt: null },
      }),
      (this.prisma as any).tender.groupBy({
        by: ['tenderType'],
        _count: { _all: true },
        _sum: { ourBidAmount: true },
        where: { deletedAt: null },
      }),
      (this.prisma as any).tender.aggregate({
        _sum: { ourBidAmount: true, expectedMargin: true },
        where: { deletedAt: null, status: { in: ['IN_REVIEW', 'PREPARING_BID', 'SUBMITTED'] } },
      }),
      (this.prisma as any).tender.findMany({
        where: {
          deletedAt: null,
          submissionDeadline: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) },
          status: { in: ['IN_REVIEW', 'PREPARING_BID'] },
        },
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          conveningEntity: true,
          submissionDeadline: true,
          ourBidAmount: true,
          status: true,
        },
        orderBy: { submissionDeadline: 'asc' },
        take: 10,
      }),
    ]);

    const won = byStatus.find((g: any) => g.status === 'AWARDED');
    const lost = byStatus.find((g: any) => g.status === 'LOST');
    const winRate = won && lost
      ? (won._count._all / (won._count._all + lost._count._all)) * 100
      : won ? 100 : 0;

    return {
      byStatus: byStatus.map((g: any) => ({
        status: g.status,
        count: g._count._all,
        value: Number(g._sum.ourBidAmount || 0),
      })),
      byType: byType.map((g: any) => ({
        tenderType: g.tenderType,
        count: g._count._all,
        value: Number(g._sum.ourBidAmount || 0),
      })),
      activePipelineValue: Number(totalValue._sum?.ourBidAmount || 0),
      activeExpectedMargin: Number(totalValue._sum?.expectedMargin || 0),
      winRate: +winRate.toFixed(1),
      upcoming,
    };
  }
}
