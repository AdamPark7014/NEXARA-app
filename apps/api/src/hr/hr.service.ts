import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Leave Requests ────────────────────────────────────────────────

  async createLeave(
    dto: {
      type: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
    userId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
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
        companyId: tenantId,
      },
      include: { user: { select: { id: true, nombre: true } } },
    });
  }

  async listLeaves(
    companyId?: number | null,
    query?: PaginationQueryDto,
    filters?: { status?: string; type?: string; userId?: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
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

  async getLeave(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        approvedBy: { select: { id: true, nombre: true } },
      },
    });
    assertCompanyAccess(leave, tenantId, 'Solicitud de permiso');
    return leave;
  }

  async approveLeave(id: number, approverId: number, companyId?: number | null) {
    const leave = await this.getLeave(id, companyId);
    if (leave.status !== 'PENDING') throw new BadRequestException('Solo se pueden aprobar solicitudes pendientes');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approverId, approvedAt: new Date() },
      include: { user: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } },
    });
  }

  async rejectLeave(id: number, approverId: number, rejectionReason?: string, companyId?: number | null) {
    const leave = await this.getLeave(id, companyId);
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

  async cancelLeave(id: number, userId: number, companyId?: number | null) {
    const leave = await this.getLeave(id, companyId);
    if (leave.userId !== userId) throw new BadRequestException('Solo el solicitante puede cancelar');
    if (leave.status !== 'PENDING') throw new BadRequestException('Solo se pueden cancelar solicitudes pendientes');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getLeaveBalance(userId: number, companyId?: number | null, year?: number) {
    const tenantId = requireCompanyId(companyId);
    const y = year ?? new Date().getFullYear();
    const startOfYear = new Date(`${y}-01-01`);
    const endOfYear = new Date(`${y}-12-31`);

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        ...companyWhere(tenantId),
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

  async createReview(
    dto: {
      userId: number;
      period: string;
      reviewDate: string;
      overallRating: number;
      strengths?: string;
      areasOfImprovement?: string;
      goals?: string;
      comments?: string;
    },
    reviewerId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
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
        companyId: tenantId,
      },
      include: {
        user: { select: { id: true, nombre: true } },
        reviewer: { select: { id: true, nombre: true } },
      },
    });
  }

  async listReviews(
    query?: PaginationQueryDto,
    filters?: { period?: string; status?: string; userId?: number; reviewerId?: number },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
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

  async getReview(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const review = await this.prisma.performanceReview.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        reviewer: { select: { id: true, nombre: true } },
      },
    });
    assertCompanyAccess(review, tenantId, 'Evaluación de desempeño');
    return review;
  }

  async updateReview(id: number, dto: any, companyId?: number | null) {
    await this.getReview(id, companyId);
    const { companyId: _omit, ...safe } = dto || {};
    return this.prisma.performanceReview.update({ where: { id }, data: safe });
  }

  async submitReview(id: number, companyId?: number | null) {
    await this.getReview(id, companyId);
    return this.prisma.performanceReview.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });
  }

  async acknowledgeReview(id: number, companyId?: number | null) {
    const review = await this.getReview(id, companyId);
    if (review.status !== 'SUBMITTED') {
      throw new BadRequestException('Solo se pueden acusar de recibido evaluaciones enviadas');
    }

    return this.prisma.performanceReview.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
    });
  }

  // ── HR Dashboard / People Intelligence ────────────────────────────

  async getDashboard(companyId?: number | null) {
    return this.getPeopleInsights(companyId);
  }

  /**
   * Inteligencia de personas: asistencia, puntualidad, carga, leaves,
   * reviews, rotación y rankings — alimenta /erp/hr/kpis.
   */
  async getPeopleInsights(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const since12m = new Date(now);
    since12m.setMonth(since12m.getMonth() - 12);

    const [
      pendingLeaves,
      approvedLeavesThisMonth,
      totalReviews,
      avgRating,
      staff,
      attendanceDays30,
      entries30,
      lunchLate30,
      leavesPendingList,
      recentReviews,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { status: 'PENDING', ...scope } }),
      this.prisma.leaveRequest.count({
        where: { status: 'APPROVED', startDate: { gte: startMonth }, ...scope },
      }),
      this.prisma.performanceReview.count(),
      this.prisma.performanceReview.aggregate({ _avg: { overallRating: true } }),
      this.prisma.user.findMany({
        where: {
          email: { notIn: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] },
          companyMemberships: { some: { companyId: tenantId } },
        },
        select: {
          id: true,
          nombre: true,
          isActive: true,
          estadoRRHH: true,
          fechaIngreso: true,
          fechaCreacion: true,
          department: { select: { nombre: true } },
        },
      }),
      this.prisma.attendanceDay.findMany({
        where: {
          date: { gte: d30 },
          user: { companyMemberships: { some: { companyId: tenantId } } },
        },
        select: { userId: true, date: true, totalMinutes: true, lastEntryAt: true, isOpen: true },
      }),
      this.prisma.attendance.findMany({
        where: {
          type: 'entrada',
          timestamp: { gte: d30 },
          user: { companyMemberships: { some: { companyId: tenantId } } },
        },
        select: { userId: true, timestamp: true },
      }),
      this.prisma.lunchBreak.count({
        where: {
          date: { gte: d30 },
          OR: [{ isCheckinLate: true }, { isCheckoutLate: true }],
          user: { companyMemberships: { some: { companyId: tenantId } } },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'PENDING', ...scope },
        take: 8,
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, nombre: true } } },
      }),
      this.prisma.performanceReview.findMany({
        take: 8,
        orderBy: { reviewDate: 'desc' },
        where: {
          user: { companyMemberships: { some: { companyId: tenantId } } },
        },
        include: {
          user: { select: { id: true, nombre: true } },
          reviewer: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    const active = staff.filter((u) => u.isActive !== false && u.estadoRRHH !== 'Baja');
    const bajas = staff.filter((u) => u.estadoRRHH === 'Baja' || u.isActive === false);
    const altas12m = staff.filter((u) => {
      const d = u.fechaIngreso ?? u.fechaCreacion;
      return d && d >= since12m;
    });

    // Puntualidad: entrada antes de 09:15 = on time (configurable soft rule)
    const lateByUser = new Map<number, number>();
    const presentDaysByUser = new Map<number, number>();
    for (const e of entries30) {
      const localHour = e.timestamp.getHours();
      const localMin = e.timestamp.getMinutes();
      const late = localHour > 9 || (localHour === 9 && localMin > 15);
      if (late) lateByUser.set(e.userId, (lateByUser.get(e.userId) ?? 0) + 1);
    }
    for (const d of attendanceDays30) {
      presentDaysByUser.set(d.userId, (presentDaysByUser.get(d.userId) ?? 0) + 1);
    }

    const totalEntryEvents = entries30.length;
    const totalLateEvents = [...lateByUser.values()].reduce((a, b) => a + b, 0);
    const punctualityPct = totalEntryEvents
      ? Math.round(((totalEntryEvents - totalLateEvents) / totalEntryEvents) * 1000) / 10
      : 100;

    const avgMinutesByUser = new Map<number, { sum: number; n: number }>();
    for (const d of attendanceDays30) {
      const cur = avgMinutesByUser.get(d.userId) ?? { sum: 0, n: 0 };
      cur.sum += d.totalMinutes;
      cur.n += 1;
      avgMinutesByUser.set(d.userId, cur);
    }

    const workload = [...avgMinutesByUser.entries()]
      .map(([userId, v]) => {
        const user = staff.find((u) => u.id === userId);
        return {
          userId,
          nombre: user?.nombre ?? `User #${userId}`,
          department: user?.department?.nombre ?? '—',
          daysPresent: presentDaysByUser.get(userId) ?? 0,
          avgMinutes: v.n ? Math.round(v.sum / v.n) : 0,
          lateCount: lateByUser.get(userId) ?? 0,
        };
      })
      .sort((a, b) => b.avgMinutes - a.avgMinutes);

    const lateLeaders = [...lateByUser.entries()]
      .map(([userId, lateCount]) => ({
        userId,
        nombre: staff.find((u) => u.id === userId)?.nombre ?? `User #${userId}`,
        lateCount,
        daysPresent: presentDaysByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => b.lateCount - a.lateCount)
      .slice(0, 8);

    const headcountByDept: Record<string, number> = {};
    for (const u of active) {
      const d = u.department?.nombre ?? 'Sin depto.';
      headcountByDept[d] = (headcountByDept[d] ?? 0) + 1;
    }

    // Asistencia tendencia 14d (días con check-in)
    const presentByDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const k = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      presentByDay[k] = 0;
    }
    for (const d of attendanceDays30) {
      const k = d.date.toISOString().slice(0, 10);
      if (k in presentByDay) presentByDay[k] += 1;
    }

    const openDays = attendanceDays30.filter((d) => d.isOpen).length;
    const avgDailyPresent = Object.values(presentByDay).reduce((a, b) => a + b, 0) / 14;

    return {
      generatedAt: now.toISOString(),
      pendingLeaves,
      approvedLeavesThisMonth,
      totalReviews,
      avgRating: avgRating._avg.overallRating ?? 0,
      kpis: {
        headcount: active.length,
        inactiveOrBaja: bajas.length,
        turnoverPct: staff.length ? Math.round((bajas.length / staff.length) * 1000) / 10 : 0,
        hires12m: altas12m.length,
        punctualityPct,
        lateEvents30d: totalLateEvents,
        lunchLate30d: lunchLate30,
        avgDailyPresent: Math.round(avgDailyPresent * 10) / 10,
        openAttendanceDays: openDays,
        pendingLeaves,
        approvedLeavesThisMonth,
        avgPerformanceRating: Math.round((avgRating._avg.overallRating ?? 0) * 10) / 10,
        reviewsCount: totalReviews,
      },
      trends: {
        present14d: Object.entries(presentByDay).map(([date, count]) => ({ date, count })),
      },
      distributions: {
        byDepartment: Object.entries(headcountByDept)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      },
      workloadTop: workload.slice(0, 10),
      lateLeaders,
      pendingLeaveQueue: leavesPendingList.map((l) => ({
        id: l.id,
        type: l.type,
        days: l.days,
        startDate: l.startDate,
        user: l.user,
        createdAt: l.createdAt,
      })),
      recentReviews: recentReviews.map((r) => ({
        id: r.id,
        period: r.period,
        overallRating: r.overallRating,
        status: r.status,
        user: r.user,
        reviewer: r.reviewer,
        reviewDate: r.reviewDate,
      })),
      alerts: [
        ...(pendingLeaves
          ? [{ severity: 'warning' as const, message: `${pendingLeaves} permiso(s) pendiente(s) de aprobación` }]
          : []),
        ...(totalLateEvents > active.length
          ? [{ severity: 'warning' as const, message: `${totalLateEvents} llegadas tarde en 30d` }]
          : []),
        ...(lunchLate30
          ? [{ severity: 'warning' as const, message: `${lunchLate30} comida(s) fuera de horario en 30d` }]
          : []),
        ...(openDays > 5
          ? [{ severity: 'warning' as const, message: `${openDays} jornada(s) de asistencia aún abiertas` }]
          : []),
      ],
    };
  }
}
