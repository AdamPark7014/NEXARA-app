import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── KPI Snapshots ─────────────────────────────────────────────────
  async recordKpi(dto: {
    kpiName: string;
    value: number;
    unit?: string;
    kpiCategory?: string;
    periodStart?: string;
    periodEnd?: string;
    metadata?: any;
  }) {
    const now = new Date();
    return this.prisma.kpiSnapshot.create({
      data: {
        kpiName: dto.kpiName.trim(),
        kpiCategory: dto.kpiCategory?.trim() || 'GENERAL',
        value: new Prisma.Decimal(dto.value),
        unit: dto.unit?.trim() || null,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : now,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : now,
        metadata: dto.metadata ?? undefined,
      },
    });
  }

  async getKpiTimeSeries(kpiName: string, from?: string, to?: string) {
    const where: any = { kpiName };
    if (from || to) {
      where.periodStart = {};
      if (from) where.periodStart.gte = new Date(from);
      if (to) where.periodStart.lte = new Date(to);
    }
    return this.prisma.kpiSnapshot.findMany({
      where,
      orderBy: { periodStart: 'asc' },
    });
  }

  async listKpiNames() {
    const result = await this.prisma.kpiSnapshot.findMany({
      distinct: ['kpiName'],
      select: { kpiName: true },
      orderBy: { kpiName: 'asc' },
    });
    return result.map((r: any) => r.kpiName);
  }

  // ── Dashboard Aggregations ────────────────────────────────────────
  async getExecutiveDashboard() {
    const [
      totalSales,
      totalExpenses,
      openPOs,
      productionOrders,
      pendingMaintenanceOrders,
      openNCRs,
      activeWorkflows,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.cotizacion.aggregate({ _sum: { total: true }, where: { status: 'APPROVED' } }).catch(() => ({ _sum: { total: null } })),
      this.prisma.expense.aggregate({ _sum: { montoSolicitado: true }, where: { estatusPago: 'Aprobado' } }).catch(() => ({ _sum: { montoSolicitado: null } })),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } } }).catch(() => 0),
      this.prisma.productionOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }).catch(() => 0),
      this.prisma.nonConformanceReport.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }).catch(() => 0),
      this.prisma.workflowInstance.count({ where: { isComplete: false, isCancelled: false } }).catch(() => 0),
      this.prisma.stockLevel.count({ where: { quantity: { lte: this.prisma.stockLevel.fields?.reorderPoint as any || 0 } } }).catch(() => 0),
    ]);

    return {
      revenue: totalSales._sum?.total ?? 0,
      expenses: totalExpenses._sum?.montoSolicitado ?? 0,
      openPurchaseOrders: openPOs,
      activeProductionOrders: productionOrders,
      pendingMaintenanceOrders,
      openNonConformances: openNCRs,
      activeWorkflows,
      lowStockAlerts: lowStockCount,
    };
  }

  async getSalesTrend(months: number = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const result = await this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*)::int as count,
        COALESCE(SUM("total"), 0) as total
      FROM "cotizaciones"
      WHERE "createdAt" >= ${since}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;
    return result;
  }

  async getProductionEfficiency() {
    const completed = await this.prisma.productionOrder.findMany({
      where: { status: 'COMPLETED', actualEndDate: { not: null }, actualStartDate: { not: null } },
      select: { plannedQty: true, completedQty: true, plannedStartDate: true, plannedEndDate: true, actualStartDate: true, actualEndDate: true },
      take: 100,
      orderBy: { actualEndDate: 'desc' },
    });

    return completed.map((o: any) => {
      const yieldRate = Number(o.completedQty) / Number(o.plannedQty) * 100;
      const plannedDays = (new Date(o.plannedEndDate).getTime() - new Date(o.plannedStartDate).getTime()) / 86400000;
      const actualDays = (new Date(o.actualEndDate).getTime() - new Date(o.actualStartDate).getTime()) / 86400000;
      const onTimeRate = actualDays <= plannedDays ? 100 : (plannedDays / actualDays) * 100;
      return { yieldRate: +yieldRate.toFixed(1), onTimeRate: +onTimeRate.toFixed(1) };
    });
  }
}
