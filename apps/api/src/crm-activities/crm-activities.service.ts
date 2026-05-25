import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

@Injectable()
export class CrmActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  async create(dto: {
    activityType?: string;
    subject: string;
    description?: string;
    dueDate: string;
    leadId?: number;
    opportunityId?: number;
    tenderId?: number;
    ownerId?: number;
    remindAt?: string;
    createdById?: number;
  }) {
    if (!dto.leadId && !dto.opportunityId && !dto.tenderId) {
      throw new BadRequestException('Una actividad CRM debe asociarse a un lead, oportunidad o licitación');
    }
    return (this.prisma as any).crmActivity.create({
      data: {
        activityType: (dto.activityType as any) || 'TASK',
        subject: dto.subject.trim(),
        description: dto.description?.trim() || null,
        dueDate: new Date(dto.dueDate),
        remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
        leadId: dto.leadId ?? null,
        opportunityId: dto.opportunityId ?? null,
        tenderId: dto.tenderId ?? null,
        ownerId: dto.ownerId ?? null,
        createdById: dto.createdById ?? null,
      },
      include: {
        owner: { select: { id: true, nombre: true } },
        lead: { select: { id: true, name: true, company: true } },
        opportunity: { select: { id: true, title: true, stage: true } },
        tender: { select: { id: true, tenderNumber: true, title: true } },
      },
    });
  }

  async list(filters?: {
    ownerId?: number;
    status?: string;
    activityType?: string;
    leadId?: number;
    opportunityId?: number;
    tenderId?: number;
    from?: string;
    to?: string;
    overdue?: boolean;
  }) {
    const where: any = {};
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.status) where.status = filters.status;
    if (filters?.activityType) where.activityType = filters.activityType;
    if (filters?.leadId) where.leadId = filters.leadId;
    if (filters?.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters?.tenderId) where.tenderId = filters.tenderId;
    if (filters?.from || filters?.to) {
      where.dueDate = {};
      if (filters.from) where.dueDate.gte = new Date(filters.from);
      if (filters.to) where.dueDate.lte = new Date(filters.to);
    }
    if (filters?.overdue) {
      where.status = 'PENDING';
      where.dueDate = { lt: new Date() };
    }
    return (this.prisma as any).crmActivity.findMany({
      where,
      include: {
        owner: { select: { id: true, nombre: true } },
        lead: { select: { id: true, name: true, company: true } },
        opportunity: { select: { id: true, title: true, stage: true, value: true } },
        tender: { select: { id: true, tenderNumber: true, title: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async complete(id: number, outcome?: string) {
    const existing = await (this.prisma as any).crmActivity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Actividad no encontrada');
    return (this.prisma as any).crmActivity.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        outcome: outcome?.trim() || null,
      },
    });
  }

  async update(id: number, dto: any) {
    const data: any = { ...dto };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.remindAt) data.remindAt = new Date(dto.remindAt);
    if (dto.completedAt) data.completedAt = new Date(dto.completedAt);
    return (this.prisma as any).crmActivity.update({ where: { id }, data });
  }

  async remove(id: number) {
    return (this.prisma as any).crmActivity.delete({ where: { id } });
  }

  async getMyAgenda(ownerId: number) {
    const now = new Date();
    const next7 = new Date(now.getTime() + 7 * 86400000);
    const [pendingToday, overdue, upcoming, recentlyCompleted, totalsByType] = await Promise.all([
      (this.prisma as any).crmActivity.findMany({
        where: {
          ownerId,
          status: 'PENDING',
          dueDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) },
        },
        include: {
          lead: { select: { id: true, name: true, company: true } },
          opportunity: { select: { id: true, title: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      (this.prisma as any).crmActivity.findMany({
        where: { ownerId, status: 'PENDING', dueDate: { lt: now } },
        include: {
          lead: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      (this.prisma as any).crmActivity.findMany({
        where: { ownerId, status: 'PENDING', dueDate: { gte: now, lte: next7 } },
        include: {
          lead: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 30,
      }),
      (this.prisma as any).crmActivity.findMany({
        where: { ownerId, status: 'COMPLETED' },
        include: {
          opportunity: { select: { id: true, title: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      }),
      (this.prisma as any).crmActivity.groupBy({
        by: ['activityType'],
        where: { ownerId, status: 'PENDING' },
        _count: { _all: true },
      }),
    ]);

    return {
      pendingToday,
      overdue,
      upcoming,
      recentlyCompleted,
      countersByType: totalsByType.map((g: any) => ({ type: g.activityType, count: g._count._all })),
    };
  }
}
