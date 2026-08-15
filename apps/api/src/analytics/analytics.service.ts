import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { RecordPublicLandingEventDto } from './dto/record-public-landing-event.dto.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';
import { OPEN_ACTIVITY_WHERE, finishedStatusSqlList } from '../activities/activity-status.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeLandingKey(raw: string) {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9:/_-]/g, '-')
      .slice(0, 90);
  }

  async recordPublicLandingEvent(dto: RecordPublicLandingEventDto) {
    const now = new Date();
    const key = this.normalizeLandingKey(dto.landingKey || 'unknown');

    return withTenantBypassAsync(() =>
      this.prisma.kpiSnapshot.create({
        data: {
          kpiName: `landing:${key}`,
          kpiCategory: 'PUBLIC_TRAFFIC',
          value: new Prisma.Decimal(1),
          unit: dto.eventType,
          periodStart: now,
          periodEnd: now,
          companyId: null,
          metadata: {
            eventName: dto.eventName || null,
            landingPath: dto.landingPath || null,
            referrer: dto.referrer || null,
            ...(dto.metadata || {}),
          },
        },
      }),
    );
  }

  async getPublicLandingSummary(days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await withTenantBypassAsync(() =>
      this.prisma.$queryRaw<Array<{ landing: string; event: string | null; total: bigint }>>`
        SELECT
          "kpiName" AS landing,
          "unit" AS event,
          COUNT(*)::bigint AS total
        FROM "kpi_snapshots"
        WHERE "kpiCategory" = 'PUBLIC_TRAFFIC'
          AND "companyId" IS NULL
          AND "createdAt" >= ${since}
        GROUP BY "kpiName", "unit"
        ORDER BY total DESC
      `,
    );

    const summaryMap = new Map<string, { views: number; clicks: number; conversions: number }>();

    for (const row of rows) {
      const landing = String(row.landing || 'landing:unknown');
      const current = summaryMap.get(landing) || { views: 0, clicks: 0, conversions: 0 };
      const total = Number(row.total || 0n);
      if (row.event === 'view') current.views += total;
      if (row.event === 'click') current.clicks += total;
      if (row.event === 'conversion') current.conversions += total;
      summaryMap.set(landing, current);
    }

    return Array.from(summaryMap.entries()).map(([landing, values]) => {
      const ctr = values.views > 0 ? +(values.clicks / values.views * 100).toFixed(2) : 0;
      const conversionRate = values.views > 0 ? +(values.conversions / values.views * 100).toFixed(2) : 0;
      return {
        landing,
        ...values,
        ctr,
        conversionRate,
      };
    });
  }

  async recordKpi(
    dto: {
      kpiName: string;
      value: number;
      unit?: string;
      kpiCategory?: string;
      periodStart?: string;
      periodEnd?: string;
      metadata?: any;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
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
        companyId: tenantId,
      },
    });
  }

  async getKpiTimeSeries(kpiName: string, companyId?: number | null, from?: string, to?: string) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { kpiName, ...companyWhere(tenantId) };
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

  async listKpiNames(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const result = await this.prisma.kpiSnapshot.findMany({
      where: companyWhere(tenantId),
      distinct: ['kpiName'],
      select: { kpiName: true },
      orderBy: { kpiName: 'asc' },
    });
    return result.map((r: any) => r.kpiName);
  }

  async getExecutiveDashboard(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const [
      totalSales,
      totalExpenses,
      openPOs,
      pendingMaintenanceOrders,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.cotizacion.aggregate({ _sum: { total: true }, where: { status: 'APPROVED', ...scope } }).catch(() => ({ _sum: { total: null } })),
      this.prisma.expense.aggregate({ _sum: { montoSolicitado: true }, where: { estatusPago: 'Aprobado', ...scope } }).catch(() => ({ _sum: { montoSolicitado: null } })),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] }, ...scope } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] }, ...scope } }).catch(() => 0),
      this.prisma.stockLevel.count({
        where: {
          quantity: { lte: 5 },
          warehouse: { companyId: tenantId },
        },
      }).catch(() => 0),
    ]);

    const revenue = Number(totalSales._sum?.total ?? 0);
    const expenses = Number(totalExpenses._sum?.montoSolicitado ?? 0);
    const margin = revenue - expenses;

    return {
      revenue,
      expenses,
      margin,
      marginPercent: revenue > 0 ? +((margin / revenue) * 100).toFixed(1) : 0,
      openPurchaseOrders: openPOs,
      pendingMaintenanceOrders,
      lowStockAlerts: lowStockCount,
    };
  }

  async getSalesTrend(companyId?: number | null, months: number = 12) {
    const tenantId = requireCompanyId(companyId);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    return this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*)::int as count,
        COALESCE(SUM("total"), 0) as total
      FROM "cotizaciones"
      WHERE "createdAt" >= ${since}
        AND "companyId" = ${tenantId}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;
  }

  async getComputedKpis(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

    const [
      attendanceToday,
      activitiesMonth,
      pendingActivities,
      overdueActivities,
      openPurchaseOrders,
      lowStock,
      pendingMaintenance,
      overdueMaintenance,
      cotizacionesMonth,
      approvedSalesMonth,
      totalUsers,
    ] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          type: 'entrada',
          timestamp: { gte: startOfDay },
          user: { companyMemberships: { some: { companyId: tenantId } } },
        },
      }).catch(() => 0),
      this.prisma.activity.count({ where: { fechaAsignacion: { gte: startOfMonth }, ...scope } }).catch(() => 0),
      this.prisma.activity.count({ where: { estatus: { in: ['Pendiente', 'En Proceso'] }, ...scope } }).catch(() => 0),
      this.prisma.activity.count({
        where: {
          ...scope,
          ...OPEN_ACTIVITY_WHERE,
          fechaMaxima: { lt: now },
        },
      }).catch(() => 0),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] }, ...scope } }).catch(() => 0),
      this.prisma.stockLevel.count({ where: { quantity: { lte: 5 }, warehouse: { companyId: tenantId } } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] }, ...scope } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: 'PLANNED', plannedDate: { lt: now }, ...scope } }).catch(() => 0),
      this.prisma.cotizacion.count({ where: { createdAt: { gte: startOfMonth }, ...scope } }).catch(() => 0),
      this.prisma.cotizacion.aggregate({
        _sum: { total: true },
        where: { status: 'APPROVED', createdAt: { gte: startOfMonth }, ...scope },
      }).catch(() => ({ _sum: { total: null } })),
      this.prisma.user.count({
        where: { companyMemberships: { some: { companyId: tenantId } } },
      }).catch(() => 0),
    ]);

    const approvedSales = Number((approvedSalesMonth as any)?._sum?.total ?? 0);

    return [
      { category: 'Operaciones', name: 'Registros de asistencia hoy', value: attendanceToday, unit: 'entradas', status: 'info' },
      { category: 'Operaciones', name: 'Actividades este mes', value: activitiesMonth, unit: 'actividades', status: 'info' },
      { category: 'Operaciones', name: 'Actividades en curso', value: pendingActivities, unit: 'actividades', status: pendingActivities > 20 ? 'warning' : 'ok' },
      { category: 'Operaciones', name: 'Actividades vencidas (SLA)', value: overdueActivities, unit: 'actividades', status: overdueActivities > 0 ? 'danger' : 'ok' },
      { category: 'Operaciones', name: 'Usuarios del tenant', value: totalUsers, unit: 'usuarios', status: 'info' },
      { category: 'Ventas', name: 'Cotizaciones este mes', value: cotizacionesMonth, unit: 'cotizaciones', status: 'info' },
      { category: 'Ventas', name: 'Ventas aprobadas (mes)', value: approvedSales, unit: 'MXN', status: approvedSales > 0 ? 'ok' : 'warning' },
      { category: 'Compras & Stock', name: 'Órdenes de compra abiertas', value: openPurchaseOrders, unit: 'OC', status: 'info' },
      { category: 'Compras & Stock', name: 'Artículos con bajo stock', value: lowStock, unit: 'artículos', status: lowStock > 0 ? 'danger' : 'ok' },
      { category: 'Mantenimiento', name: 'Mantenimientos activos', value: pendingMaintenance, unit: 'órdenes', status: 'info' },
      { category: 'Mantenimiento', name: 'Mantenimientos vencidos', value: overdueMaintenance, unit: 'órdenes', status: overdueMaintenance > 0 ? 'danger' : 'ok' },
    ];
  }

  /** Intelligence layer: what / why / next / risk / cost / owner signals. */
  async getBusinessIntelligence(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const [kpis, dashboard, trend] = await Promise.all([
      this.getComputedKpis(tenantId),
      this.getExecutiveDashboard(tenantId),
      this.getSalesTrend(tenantId, 6),
    ]);

    const danger = kpis.filter((k) => k.status === 'danger');
    const warning = kpis.filter((k) => k.status === 'warning');
    const overdueSla = kpis.find((k) => k.name.includes('vencidas'))?.value ?? 0;
    const lowStock = kpis.find((k) => k.name.includes('bajo stock'))?.value ?? 0;

    const recommendations: Array<{ action: string; impact: string; priority: 'P0' | 'P1' | 'P2' }> = [];
    if (overdueSla > 0) {
      recommendations.push({
        action: `Resolver ${overdueSla} actividades con SLA vencido`,
        impact: 'Reduce riesgo de churn y penalizaciones contractuales',
        priority: 'P0',
      });
    }
    if (lowStock > 0) {
      recommendations.push({
        action: `Reabastecer ${lowStock} SKUs bajo mínimo`,
        impact: 'Evita paros de campo y OT bloqueadas',
        priority: 'P0',
      });
    }
    if (dashboard.marginPercent < 15 && dashboard.revenue > 0) {
      recommendations.push({
        action: 'Revisar margen: por debajo del umbral 15%',
        impact: 'Protege runway y rentabilidad por proyecto',
        priority: 'P1',
      });
    }
    if (dashboard.openPurchaseOrders > 10) {
      recommendations.push({
        action: 'Acelerar cierre de OC abiertas',
        impact: 'Libera capital de trabajo y reduce lead time',
        priority: 'P2',
      });
    }
    if (!recommendations.length) {
      recommendations.push({
        action: 'Mantener ritmo operativo actual',
        impact: 'Sin anomalías críticas detectadas',
        priority: 'P2',
      });
    }

    const trendRows = Array.isArray(trend) ? trend : [];
    const last = trendRows.length ? Number((trendRows[trendRows.length - 1] as any)?.total ?? 0) : 0;
    const prev = trendRows.length > 1 ? Number((trendRows[trendRows.length - 2] as any)?.total ?? 0) : last;
    const forecastNextMonth = prev > 0 ? Math.round(last * (last / prev)) : last;

    return {
      generatedAt: new Date().toISOString(),
      companyId: tenantId,
      what: {
        revenue: dashboard.revenue,
        expenses: dashboard.expenses,
        margin: dashboard.margin,
        marginPercent: dashboard.marginPercent,
        openPurchaseOrders: dashboard.openPurchaseOrders,
        pendingMaintenanceOrders: dashboard.pendingMaintenanceOrders,
        lowStockAlerts: dashboard.lowStockAlerts,
        dangerCount: danger.length,
        warningCount: warning.length,
      },
      why: {
        drivers: [
          ...(overdueSla > 0 ? [`${overdueSla} OT/actividades fuera de SLA`] : []),
          ...(lowStock > 0 ? [`${lowStock} SKUs bajo stock`] : []),
          ...(dashboard.marginPercent < 15 ? ['Margen operativo bajo umbral'] : []),
          ...(danger.length === 0 && warning.length === 0 ? ['Operación dentro de umbrales'] : []),
        ],
        kpiAlerts: [...danger, ...warning],
      },
      willHappen: {
        forecastSalesNextMonth: forecastNextMonth,
        riskIfNoAction:
          overdueSla > 0
            ? 'Escalamiento de quejas y posible pérdida de contrato'
            : lowStock > 0
              ? 'Retrasos en visitas de campo por falta de refacciones'
              : 'Estabilidad operativa esperada',
      },
      recommendations,
      risk: danger.length > 0 ? 'high' : warning.length > 0 ? 'medium' : 'low',
      cost: {
        monthlyExpenses: dashboard.expenses,
        opportunityCostOverdueSla: overdueSla * 2500,
        currency: 'MXN',
      },
      owners: {
        operations: 'Director de Operaciones',
        finance: 'Director Administrativo',
        commercial: 'Director Comercial',
      },
      optimize: recommendations.slice(0, 3).map((r) => r.action),
    };
  }

  async getMarginByProjectType(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const projects = await this.prisma.salesProject.findMany({
      where: { opportunity: { companyId: tenantId } },
      select: {
        id: true,
        name: true,
        projectType: true,
        budget: true,
        costProducts: true,
        costViaticos: true,
        costOperativo: true,
        status: true,
      },
    });

    const buckets = new Map<string, { count: number; budget: number; cost: number; margin: number; closed: number }>();
    for (const p of projects) {
      const key = String(p.projectType || 'OTRO');
      const budget = Number(p.budget);
      const cost = Number(p.costProducts) + Number(p.costViaticos) + Number(p.costOperativo);
      const margin = budget - cost;
      const current = buckets.get(key) || { count: 0, budget: 0, cost: 0, margin: 0, closed: 0 };
      current.count += 1;
      current.budget += budget;
      current.cost += cost;
      current.margin += margin;
      if (p.status === 'CLOSED') current.closed += 1;
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .map(([projectType, values]) => ({
        projectType,
        ...values,
        budget: Math.round(values.budget * 100) / 100,
        cost: Math.round(values.cost * 100) / 100,
        margin: Math.round(values.margin * 100) / 100,
        marginPercent: values.budget > 0 ? +((values.margin / values.budget) * 100).toFixed(2) : 0,
        avgMarginPerProject: values.count > 0 ? Math.round((values.margin / values.count) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin);
  }

  async getEngineerPerformanceRanking(companyId?: number | null, limit = 20) {
    const tenantId = requireCompanyId(companyId);
    const rows = await this.prisma.$queryRaw<Array<{
      engineerId: number;
      engineerName: string;
      totalActivities: bigint;
      completed: bigint;
      avgEfficiency: number | null;
      avgDurationMin: number | null;
    }>>`
      SELECT
        u."id" AS "engineerId",
        u."nombre" AS "engineerName",
        COUNT(a."id")::bigint AS "totalActivities",
        COUNT(*) FILTER (WHERE a."estatus" IN (${Prisma.raw(finishedStatusSqlList())}))::bigint AS "completed",
        AVG(a."eficienciaScore")::float AS "avgEfficiency",
        AVG(EXTRACT(EPOCH FROM (a."fechaFinalizacion" - a."fechaInicio")) / 60)::float AS "avgDurationMin"
      FROM "Activity" a
      INNER JOIN "User" u ON u."id" = a."responsableId"
      WHERE a."fechaAsignacion" >= NOW() - INTERVAL '90 days'
        AND a."companyId" = ${tenantId}
      GROUP BY u."id", u."nombre"
      ORDER BY "completed" DESC, "avgEfficiency" DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => {
      const total = Number(r.totalActivities || 0n);
      const completed = Number(r.completed || 0n);
      return {
        engineerId: r.engineerId,
        engineerName: r.engineerName,
        totalActivities: total,
        completed,
        completionRate: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
        avgEfficiency: r.avgEfficiency != null ? +Number(r.avgEfficiency).toFixed(1) : null,
        avgDurationMin: r.avgDurationMin != null ? +Number(r.avgDurationMin).toFixed(0) : null,
      };
    });
  }

  async getClientRoi(companyId?: number | null, limit = 25) {
    const tenantId = requireCompanyId(companyId);
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const projects = await this.prisma.salesProject.findMany({
      where: {
        createdAt: { gte: since },
        opportunity: { companyId: tenantId },
      },
      select: {
        budget: true,
        costProducts: true,
        costViaticos: true,
        costOperativo: true,
        status: true,
        opportunity: {
          select: {
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    const buckets = new Map<number, {
      clientId: number;
      clientName: string;
      projects: number;
      revenue: number;
      cost: number;
      margin: number;
      closed: number;
    }>();

    for (const p of projects) {
      const client = p.opportunity?.client;
      if (!client) continue;
      const revenue = Number(p.budget);
      const cost = Number(p.costProducts) + Number(p.costViaticos) + Number(p.costOperativo);
      const margin = revenue - cost;
      const current = buckets.get(client.id) || {
        clientId: client.id,
        clientName: client.name,
        projects: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        closed: 0,
      };
      current.projects += 1;
      current.revenue += revenue;
      current.cost += cost;
      current.margin += margin;
      if (p.status === 'CLOSED') current.closed += 1;
      buckets.set(client.id, current);
    }

    return Array.from(buckets.values())
      .map((v) => ({
        ...v,
        revenue: Math.round(v.revenue * 100) / 100,
        cost: Math.round(v.cost * 100) / 100,
        margin: Math.round(v.margin * 100) / 100,
        roi: v.cost > 0 ? +((v.margin / v.cost) * 100).toFixed(1) : 0,
        marginPercent: v.revenue > 0 ? +((v.margin / v.revenue) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, limit);
  }

  async getBranchActivityRanking(companyId?: number | null, limit = 25) {
    const tenantId = requireCompanyId(companyId);
    const rows = await this.prisma.$queryRaw<Array<{
      clientName: string | null;
      branchName: string | null;
      total: bigint;
      completed: bigint;
      avgEfficiency: number | null;
    }>>`
      SELECT
        sc."name" AS "clientName",
        a."branchName",
        COUNT(*)::bigint AS "total",
        COUNT(*) FILTER (WHERE a."estatus" IN (${Prisma.raw(finishedStatusSqlList())}))::bigint AS "completed",
        AVG(a."eficienciaScore")::float AS "avgEfficiency"
      FROM "Activity" a
      LEFT JOIN "service_clients" sc ON sc."id" = a."clientId"
      WHERE a."branchName" IS NOT NULL
        AND a."fechaAsignacion" >= NOW() - INTERVAL '180 days'
        AND a."companyId" = ${tenantId}
      GROUP BY sc."name", a."branchName"
      ORDER BY "total" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => {
      const total = Number(r.total || 0n);
      const completed = Number(r.completed || 0n);
      return {
        clientName: r.clientName || 'Sin cliente',
        branchName: r.branchName,
        total,
        completed,
        completionRate: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
        avgEfficiency: r.avgEfficiency != null ? +Number(r.avgEfficiency).toFixed(1) : null,
      };
    });
  }

  async getMaintenanceContractsKpis(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const [active, total, mrrAgg, upcomingVisits, generatedVisits] = await Promise.all([
      (this.prisma as any).maintenanceContract.count({ where: { status: 'ACTIVE', deletedAt: null, ...scope } }).catch(() => 0),
      (this.prisma as any).maintenanceContract.count({ where: { deletedAt: null, ...scope } }).catch(() => 0),
      (this.prisma as any).maintenanceContract.aggregate({
        _sum: { monthlyFee: true },
        where: { status: 'ACTIVE', deletedAt: null, ...scope },
      }).catch(() => ({ _sum: { monthlyFee: 0 } })),
      (this.prisma as any).maintenanceContractVisit.count({
        where: {
          status: 'SCHEDULED',
          scheduledDate: { lte: new Date(Date.now() + 14 * 86400000) },
          contract: { companyId: tenantId },
        },
      }).catch(() => 0),
      (this.prisma as any).maintenanceContractVisit.count({
        where: { status: 'GENERATED', contract: { companyId: tenantId } },
      }).catch(() => 0),
    ]);

    return {
      activeContracts: active,
      totalContracts: total,
      monthlyRecurringRevenue: Number(mrrAgg?._sum?.monthlyFee || 0),
      upcomingVisits,
      generatedVisits,
    };
  }

  async getExecutiveBiDashboard(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const [marginByType, engineers, clientRoi, branches, contracts, dashboard, intelligence] = await Promise.all([
      this.getMarginByProjectType(tenantId),
      this.getEngineerPerformanceRanking(tenantId, 10),
      this.getClientRoi(tenantId, 15),
      this.getBranchActivityRanking(tenantId, 15),
      this.getMaintenanceContractsKpis(tenantId),
      this.getExecutiveDashboard(tenantId),
      this.getBusinessIntelligence(tenantId),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      companyId: tenantId,
      summary: dashboard,
      contracts,
      marginByType,
      engineers,
      clientRoi,
      branches,
      intelligence,
    };
  }
}
