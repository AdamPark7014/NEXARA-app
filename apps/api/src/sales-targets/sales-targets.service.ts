import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SalesTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: {
    ownerId: number;
    period?: string;
    year: number;
    month?: number;
    quarter?: number;
    revenueTarget?: number;
    newClientsTarget?: number;
    opportunitiesTarget?: number;
    baseCommissionPct?: number;
    bonusCommissionPct?: number;
    bonusThresholdPct?: number;
    notes?: string;
  }) {
    const period = (dto.period as any) || 'MONTHLY';
    const data = {
      ownerId: dto.ownerId,
      period,
      year: dto.year,
      month: dto.month ?? null,
      quarter: dto.quarter ?? null,
      revenueTarget: new Prisma.Decimal(dto.revenueTarget || 0),
      newClientsTarget: dto.newClientsTarget ?? 0,
      opportunitiesTarget: dto.opportunitiesTarget ?? 0,
      baseCommissionPct: new Prisma.Decimal(dto.baseCommissionPct || 0),
      bonusCommissionPct: new Prisma.Decimal(dto.bonusCommissionPct || 0),
      bonusThresholdPct: new Prisma.Decimal(dto.bonusThresholdPct ?? 100),
      notes: dto.notes?.trim() || null,
    };

    return (this.prisma as any).salesTarget.upsert({
      where: {
        ownerId_period_year_month_quarter: {
          ownerId: dto.ownerId,
          period,
          year: dto.year,
          month: dto.month ?? null,
          quarter: dto.quarter ?? null,
        },
      },
      create: data,
      update: data,
    });
  }

  async list(filters?: { ownerId?: number; year?: number; month?: number }) {
    const where: any = {};
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.year) where.year = filters.year;
    if (filters?.month) where.month = filters.month;
    return (this.prisma as any).salesTarget.findMany({
      where,
      include: { owner: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async remove(id: number) {
    return (this.prisma as any).salesTarget.delete({ where: { id } });
  }

  /** Calcula desempeño actual de cada vendedor vs su meta del mes. */
  async getPerformance(year?: number, month?: number) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? (now.getMonth() + 1);
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59);

    const targets = await (this.prisma as any).salesTarget.findMany({
      where: { period: 'MONTHLY', year: y, month: m },
      include: { owner: { select: { id: true, nombre: true } } },
    });

    const results = await Promise.all(
      targets.map(async (t: any) => {
        // Revenue: sum WON SalesOpportunity.value en el periodo
        const [revenueRow, opportunitiesCount, newClients] = await Promise.all([
          this.prisma.salesOpportunity.aggregate({
            where: { ownerId: t.ownerId, stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { value: true },
          }),
          this.prisma.salesOpportunity.count({
            where: { ownerId: t.ownerId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
          }),
          this.prisma.salesLead.count({
            where: { ownerId: t.ownerId, createdAt: { gte: startOfMonth, lte: endOfMonth }, status: 'WON' as any },
          }),
        ]);

        const revenueAchieved = Number(revenueRow._sum?.value || 0);
        const revenueTarget = Number(t.revenueTarget);
        const attainmentPct = revenueTarget > 0 ? (revenueAchieved / revenueTarget) * 100 : 0;
        const thresholdPct = Number(t.bonusThresholdPct);

        let commission = 0;
        if (revenueAchieved > 0) {
          const baseCommission = revenueAchieved * (Number(t.baseCommissionPct) / 100);
          const bonusCommission = attainmentPct >= thresholdPct
            ? revenueAchieved * (Number(t.bonusCommissionPct) / 100)
            : 0;
          commission = baseCommission + bonusCommission;
        }

        return {
          targetId: t.id,
          ownerId: t.ownerId,
          ownerName: t.owner?.nombre || `User ${t.ownerId}`,
          period: t.period,
          year: t.year,
          month: t.month,
          quarter: t.quarter,
          revenueTarget,
          revenueAchieved,
          attainmentPct: +attainmentPct.toFixed(1),
          opportunitiesTarget: t.opportunitiesTarget,
          opportunitiesCreated: opportunitiesCount,
          newClientsTarget: t.newClientsTarget,
          newClientsAchieved: newClients,
          baseCommissionPct: Number(t.baseCommissionPct),
          bonusCommissionPct: Number(t.bonusCommissionPct),
          bonusThresholdPct: thresholdPct,
          commission: +commission.toFixed(2),
          reachedBonus: attainmentPct >= thresholdPct,
        };
      }),
    );

    const totals = {
      revenueTarget: results.reduce((acc, r) => acc + r.revenueTarget, 0),
      revenueAchieved: results.reduce((acc, r) => acc + r.revenueAchieved, 0),
      totalCommissions: results.reduce((acc, r) => acc + r.commission, 0),
    };

    return {
      year: y,
      month: m,
      performance: results.sort((a, b) => b.attainmentPct - a.attainmentPct),
      totals: {
        ...totals,
        avgAttainmentPct: results.length > 0
          ? +(results.reduce((acc, r) => acc + r.attainmentPct, 0) / results.length).toFixed(1)
          : 0,
      },
    };
  }
}
