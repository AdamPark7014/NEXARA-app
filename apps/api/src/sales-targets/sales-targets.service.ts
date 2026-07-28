import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

@Injectable()
export class SalesTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    dto: {
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
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
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
      companyId: tenantId,
    };

    return this.prisma.salesTarget.upsert({
      where: {
        companyId_ownerId_period_year_month_quarter: {
          companyId: tenantId,
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

  async list(filters?: { ownerId?: number; year?: number; month?: number }, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    if (filters?.year) where.year = filters.year;
    if (filters?.month) where.month = filters.month;
    return this.prisma.salesTarget.findMany({
      where,
      include: { owner: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async remove(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma.salesTarget.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(existing, tenantId, 'Meta de ventas');
    return this.prisma.salesTarget.delete({ where: { id } });
  }

  /** Calcula desempeño actual de cada vendedor vs su meta del mes. */
  async getPerformance(year?: number, month?: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59);

    const salesOrgKeys = ['sales_rep', 'sales_manager', 'vendedor', 'coord_ventas', 'director_commercial'];
    const [targets, salesUsers] = await Promise.all([
      this.prisma.salesTarget.findMany({
        where: { ...companyWhere(tenantId), period: 'MONTHLY', year: y, month: m },
        include: { owner: { select: { id: true, nombre: true } } },
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          companyMemberships: { some: { companyId: tenantId } },
          role: {
            OR: [{ accesoPanelVentas: true }, { orgRoleKey: { in: salesOrgKeys } }],
          },
        },
        select: { id: true, nombre: true, email: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const targetByOwner = new Map<number, any>(targets.map((t: any) => [t.ownerId, t]));
    const ownerIds = new Set<number>([
      ...salesUsers.map((u) => u.id),
      ...targets.map((t: any) => t.ownerId),
    ]);

    const results = await Promise.all(
      [...ownerIds].map(async (ownerId) => {
        const t = targetByOwner.get(ownerId);
        const salesUser = salesUsers.find((u) => u.id === ownerId);
        const [revenueRow, opportunitiesCount, newClients] = await Promise.all([
          this.prisma.salesOpportunity.aggregate({
            where: {
              ...companyWhere(tenantId),
              ownerId,
              stage: 'WON' as any,
              closedAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { value: true },
          }),
          this.prisma.salesOpportunity.count({
            where: {
              ...companyWhere(tenantId),
              ownerId,
              createdAt: { gte: startOfMonth, lte: endOfMonth },
            },
          }),
          this.prisma.salesLead.count({
            where: {
              ...companyWhere(tenantId),
              ownerId,
              createdAt: { gte: startOfMonth, lte: endOfMonth },
              status: 'WON' as any,
            },
          }),
        ]);

        const revenueAchieved = Number(revenueRow._sum?.value || 0);
        const revenueTarget = t ? Number(t.revenueTarget) : 0;
        const attainmentPct = revenueTarget > 0 ? (revenueAchieved / revenueTarget) * 100 : 0;
        const thresholdPct = t ? Number(t.bonusThresholdPct) : 100;

        let commission = 0;
        if (t && revenueAchieved > 0) {
          const baseCommission = revenueAchieved * (Number(t.baseCommissionPct) / 100);
          const bonusCommission =
            attainmentPct >= thresholdPct ? revenueAchieved * (Number(t.bonusCommissionPct) / 100) : 0;
          commission = baseCommission + bonusCommission;
        }

        return {
          targetId: t?.id ?? ownerId,
          ownerId,
          ownerName: salesUser?.nombre || t?.owner?.nombre || `Usuario #${ownerId}`,
          hasQuota: Boolean(t),
          period: t?.period ?? 'MONTHLY',
          year: y,
          month: m,
          quarter: t?.quarter ?? null,
          revenueTarget,
          revenueAchieved,
          attainmentPct: +attainmentPct.toFixed(1),
          opportunitiesTarget: t?.opportunitiesTarget ?? 0,
          opportunitiesCreated: opportunitiesCount,
          newClientsTarget: t?.newClientsTarget ?? 0,
          newClientsAchieved: newClients,
          baseCommissionPct: t ? Number(t.baseCommissionPct) : 0,
          bonusCommissionPct: t ? Number(t.bonusCommissionPct) : 0,
          bonusThresholdPct: thresholdPct,
          commission: +commission.toFixed(2),
          reachedBonus: Boolean(t) && attainmentPct >= thresholdPct,
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
        avgAttainmentPct:
          results.length > 0
            ? +(results.reduce((acc, r) => acc + r.attainmentPct, 0) / results.length).toFixed(1)
            : 0,
      },
    };
  }
}
