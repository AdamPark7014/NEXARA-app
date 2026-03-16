import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Leave Requests ────────────────────────────────────────────────

  async createLeave(dto: {
    type: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }, userId: number) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
    const diffMs = end.getTime() - start.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    return this.prisma.leaveRequest.create({
      data: {
        userId,
        type: dto.type as any,
        startDate: start,
        endDate: end,
        days,
        reason: dto.reason?.trim() || null,
      },
      include: { user: { select: { id: true, nombre: true } } },
    });
  }

  async listLeaves(query?: PaginationQueryDto, filters?: { status?: string; type?: string; userId?: number }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.type) where.type = filters.type;
    if (filters?.userId) where.userId = filters.userId;
    if (query?.search) {
      where.OR = [
        { user: { nombre: { contains: query.search, mode: 'insensitive' } } },
        { reason: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const include = {
      user: { select: { id: true, nombre: true, email: true } },
      approvedBy: { select: { id: true, nombre: true } },
    };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.leaveRequest.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.leaveRequest.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.leaveRequest.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLeave(id: number) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        approvedBy: { select: { id: true, nombre: true } },
      },
    });
    if (!leave) throw new NotFoundException('Solicitud de permiso no encontrada');
    return leave;
  }

  async approveLeave(id: number, approverId: number) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Solicitud de permiso no encontrada');
    if (leave.status !== 'PENDING') throw new BadRequestException('Solo se pueden aprobar solicitudes pendientes');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approverId, approvedAt: new Date() },
      include: { user: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } },
    });
  }

  async rejectLeave(id: number, approverId: number, rejectionReason?: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Solicitud de permiso no encontrada');
    if (leave.status !== 'PENDING') throw new BadRequestException('Solo se pueden rechazar solicitudes pendientes');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason?.trim() || null,
      },
      include: { user: { select: { id: true, nombre: true } } },
    });
  }

  async cancelLeave(id: number, userId: number) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Solicitud de permiso no encontrada');
    if (leave.userId !== userId) throw new BadRequestException('Solo el solicitante puede cancelar');
    if (leave.status !== 'PENDING') throw new BadRequestException('Solo se pueden cancelar solicitudes pendientes');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getLeaveBalance(userId: number, year?: number) {
    const y = year ?? new Date().getFullYear();
    const startOfYear = new Date(`${y}-01-01`);
    const endOfYear = new Date(`${y}-12-31`);

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: 'APPROVED',
        startDate: { gte: startOfYear },
        endDate: { lte: endOfYear },
      },
      select: { type: true, days: true },
    });

    const byType: Record<string, number> = {};
    for (const l of approved) {
      byType[l.type] = (byType[l.type] || 0) + l.days;
    }

    return { year: y, userId, usedByType: byType, totalUsed: Object.values(byType).reduce((a, b) => a + b, 0) };
  }

  // ── Performance Reviews ───────────────────────────────────────────

  async createReview(dto: {
    userId: number;
    period: string;
    reviewDate: string;
    overallRating: number;
    strengths?: string;
    areasOfImprovement?: string;
    goals?: string;
    comments?: string;
  }, reviewerId: number) {
    if (dto.overallRating < 1 || dto.overallRating > 5) {
      throw new BadRequestException('La calificación debe estar entre 1 y 5');
    }

    return this.prisma.performanceReview.create({
      data: {
        userId: dto.userId,
        reviewerId,
        period: dto.period as any,
        reviewDate: new Date(dto.reviewDate),
        overallRating: dto.overallRating,
        strengths: dto.strengths?.trim() || null,
        areasOfImprovement: dto.areasOfImprovement?.trim() || null,
        goals: dto.goals?.trim() || null,
        comments: dto.comments?.trim() || null,
      },
      include: {
        user: { select: { id: true, nombre: true } },
        reviewer: { select: { id: true, nombre: true } },
      },
    });
  }

  async listReviews(query?: PaginationQueryDto, filters?: { period?: string; status?: string; userId?: number; reviewerId?: number }) {
    const where: any = {};
    if (filters?.period) where.period = filters.period;
    if (filters?.status) where.status = filters.status;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.reviewerId) where.reviewerId = filters.reviewerId;
    if (query?.search) {
      where.OR = [
        { user: { nombre: { contains: query.search, mode: 'insensitive' } } },
        { strengths: { contains: query.search, mode: 'insensitive' } },
        { goals: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const include = {
      user: { select: { id: true, nombre: true } },
      reviewer: { select: { id: true, nombre: true } },
    };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.performanceReview.findMany({
          where,
          include,
          orderBy: { reviewDate: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.performanceReview.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.performanceReview.findMany({
      where,
      include,
      orderBy: { reviewDate: 'desc' },
    });
  }

  async getReview(id: number) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        reviewer: { select: { id: true, nombre: true } },
      },
    });
    if (!review) throw new NotFoundException('Evaluación de desempeño no encontrada');
    return review;
  }

  async updateReview(id: number, dto: any) {
    return this.prisma.performanceReview.update({ where: { id }, data: dto });
  }

  async submitReview(id: number) {
    return this.prisma.performanceReview.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });
  }

  async acknowledgeReview(id: number) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Evaluación de desempeño no encontrada');
    if (review.status !== 'SUBMITTED') throw new BadRequestException('Solo se pueden acusar de recibido evaluaciones enviadas');

    return this.prisma.performanceReview.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
    });
  }

  // ── HR Dashboard ──────────────────────────────────────────────────

  async getDashboard() {
    const [
      pendingLeaves,
      approvedLeavesThisMonth,
      totalReviews,
      avgRating,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      this.prisma.performanceReview.count(),
      this.prisma.performanceReview.aggregate({ _avg: { overallRating: true } }),
    ]);

    return {
      pendingLeaves,
      approvedLeavesThisMonth,
      totalReviews,
      avgRating: avgRating._avg.overallRating ?? 0,
    };
  }
}
