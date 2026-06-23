import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(dto: {
    entityType: string;
    entityId: number;
    action: string;
    changes?: any;
    previousData?: any;
    ipAddress?: string;
    userAgent?: string;
  }, userId?: number) {
    return this.prisma.auditLog.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        action: dto.action,
        changes: dto.changes ?? undefined,
        previousData: dto.previousData ?? undefined,
        userId: userId ?? null,
        ipAddress: dto.ipAddress?.trim() || null,
        userAgent: dto.userAgent?.trim() || null,
      },
    });
  }

  async query(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    userId?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, nombre: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEntityHistory(entityType: string, entityId: number) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
