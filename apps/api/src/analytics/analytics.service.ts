import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { RecordPublicLandingEventDto } from './dto/record-public-landing-event.dto.js';

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

    return this.prisma.kpiSnapshot.create({
      data: {
        kpiName: `landing:${key}`,
        kpiCategory: 'PUBLIC_TRAFFIC',
        value: new Prisma.Decimal(1),
        unit: dto.eventType,
        periodStart: now,
        periodEnd: now,
        metadata: {
          eventName: dto.eventName || null,
          landingPath: dto.landingPath || null,
          referrer: dto.referrer || null,
          ...(dto.metadata || {}),
        },
      },
    });
  }

  async getPublicLandingSummary(days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<Array<{ landing: string; event: string | null; total: bigint }>>`
      SELECT
        "kpiName" AS landing,
        "unit" AS event,
        COUNT(*)::bigint AS total
      FROM "kpi_snapshots"
      WHERE "kpiCategory" = 'PUBLIC_TRAFFIC'
        AND "createdAt" >= ${since}
      GROUP BY "kpiName", "unit"
      ORDER BY total DESC
    `;

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
      pendingMaintenanceOrders,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.cotizacion.aggregate({ _sum: { total: true }, where: { status: 'APPROVED' } }).catch(() => ({ _sum: { total: null } })),
      this.prisma.expense.aggregate({ _sum: { montoSolicitado: true }, where: { estatusPago: 'Aprobado' } }).catch(() => ({ _sum: { montoSolicitado: null } })),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }).catch(() => 0),
      this.prisma.stockLevel.count({ where: { quantity: { lte: this.prisma.stockLevel.fields?.reorderPoint as any || 0 } } }).catch(() => 0),
    ]);

    return {
      revenue: totalSales._sum?.total ?? 0,
      expenses: totalExpenses._sum?.montoSolicitado ?? 0,
      openPurchaseOrders: openPOs,
      pendingMaintenanceOrders,
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

  // ── Computed Real-time KPIs ────────────────────────────────────────
  async getComputedKpis() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

    const [
      attendanceToday,
      activitiesMonth,
      pendingActivities,
      pendingLeaves,
      pendingReviews,
      openPurchaseOrders,
      lowStock,
      pendingDocApprovals,
      pendingMaintenance,
      overdueMaintenance,
      cotizacionesMonth,
      approvedSalesMonth,
      totalUsers,
    ] = await Promise.all([
      this.prisma.attendance.count({ where: { type: 'entrada', timestamp: { gte: startOfDay } } }).catch(() => 0),
      this.prisma.activity.count({ where: { fechaAsignacion: { gte: startOfMonth } } }).catch(() => 0),
      this.prisma.activity.count({ where: { estatus: { in: ['Pendiente', 'En Proceso'] } } }).catch(() => 0),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }).catch(() => 0),
      this.prisma.performanceReview.count({ where: { status: 'DRAFT' } }).catch(() => 0),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } } }).catch(() => 0),
      this.prisma.stockLevel.count({ where: { quantity: { lte: 5 } } }).catch(() => 0),
      this.prisma.managedDocument.count({ where: { status: 'PENDING_APPROVAL' } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }).catch(() => 0),
      this.prisma.maintenanceOrder.count({ where: { status: 'PLANNED', plannedDate: { lt: now } } }).catch(() => 0),
      this.prisma.cotizacion.count({ where: { createdAt: { gte: startOfMonth } } }).catch(() => 0),
      this.prisma.cotizacion.aggregate({ _sum: { total: true }, where: { status: 'APPROVED', createdAt: { gte: startOfMonth } } }).catch(() => ({ _sum: { total: null } })),
      this.prisma.user.count().catch(() => 0),
    ]);

    const approvedSales = Number((approvedSalesMonth as any)?._sum?.total ?? 0);

    return [
      // Operaciones
      { category: 'Operaciones', name: 'Registros de asistencia hoy', value: attendanceToday, unit: 'entradas', status: 'info' },
      { category: 'Operaciones', name: 'Actividades este mes', value: activitiesMonth, unit: 'actividades', status: 'info' },
      { category: 'Operaciones', name: 'Actividades en curso', value: pendingActivities, unit: 'actividades', status: pendingActivities > 20 ? 'warning' : 'ok' },
      { category: 'Operaciones', name: 'Usuarios registrados', value: totalUsers, unit: 'usuarios', status: 'info' },
      // Ventas
      { category: 'Ventas', name: 'Cotizaciones este mes', value: cotizacionesMonth, unit: 'cotizaciones', status: 'info' },
      { category: 'Ventas', name: 'Ventas aprobadas (mes)', value: approvedSales, unit: 'MXN', status: approvedSales > 0 ? 'ok' : 'warning' },
      // RH
      { category: 'Recursos Humanos', name: 'Permisos pendientes de aprobar', value: pendingLeaves, unit: 'solicitudes', status: pendingLeaves > 0 ? 'warning' : 'ok' },
      { category: 'Recursos Humanos', name: 'Revisiones de desempeño pendientes', value: pendingReviews, unit: 'revisiones', status: pendingReviews > 0 ? 'warning' : 'ok' },
      // Compras / Inventario
      { category: 'Compras & Stock', name: 'Órdenes de compra abiertas', value: openPurchaseOrders, unit: 'OC', status: 'info' },
      { category: 'Compras & Stock', name: 'Artículos con bajo stock', value: lowStock, unit: 'artículos', status: lowStock > 0 ? 'danger' : 'ok' },
      // Documentos
      { category: 'Documentos', name: 'Documentos por aprobar', value: pendingDocApprovals, unit: 'documentos', status: pendingDocApprovals > 0 ? 'warning' : 'ok' },
      // Mantenimiento de contratos
      { category: 'Mantenimiento', name: 'Mantenimientos activos', value: pendingMaintenance, unit: 'órdenes', status: 'info' },
      { category: 'Mantenimiento', name: 'Mantenimientos vencidos', value: overdueMaintenance, unit: 'órdenes', status: overdueMaintenance > 0 ? 'danger' : 'ok' },
    ];
  }

  // ────────────────────────────────────────────────────────────────────
  // FASE 10 — BI EJECUTIVO (margen por tipo, ranking ingenieros, ROI cliente)
  // ────────────────────────────────────────────────────────────────────

  /** Margen promedio y volumen por tipo de proyecto de servicio. */
  async getMarginByProjectType() {
    const projects = await this.prisma.salesProject.findMany({
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

  /** Ranking de ingenieros por OT cerradas, eficiencia y tiempo promedio. */
  async getEngineerPerformanceRanking(limit = 20) {
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
        COUNT(*) FILTER (WHERE a."estatus" = 'Finalizado')::bigint AS "completed",
        AVG(a."eficienciaScore")::float AS "avgEfficiency",
        AVG(EXTRACT(EPOCH FROM (a."fechaFinalizacion" - a."fechaInicio")) / 60)::float AS "avgDurationMin"
      FROM "Activity" a
      INNER JOIN "User" u ON u."id" = a."responsableId"
      WHERE a."fechaAsignacion" >= NOW() - INTERVAL '90 days'
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

  /** ROI por cliente — ingreso facturado vs. costo operativo en últimos 12 meses. */
  async getClientRoi(limit = 25) {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const projects = await this.prisma.salesProject.findMany({
      where: { createdAt: { gte: since } },
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

  /** ROI por sucursal cliente (ServiceClientBranch) — actividades cerradas vs. abiertas. */
  async getBranchActivityRanking(limit = 25) {
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
        COUNT(*) FILTER (WHERE a."estatus" = 'Finalizado')::bigint AS "completed",
        AVG(a."eficienciaScore")::float AS "avgEfficiency"
      FROM "Activity" a
      LEFT JOIN "service_clients" sc ON sc."id" = a."clientId"
      WHERE a."branchName" IS NOT NULL
        AND a."fechaAsignacion" >= NOW() - INTERVAL '180 days'
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

  /** Visión consolidada: contratos recurrentes, MRR, visitas próximas. */
  async getMaintenanceContractsKpis() {
    const [active, total, mrrAgg, upcomingVisits, generatedVisits] = await Promise.all([
      (this.prisma as any).maintenanceContract.count({ where: { status: 'ACTIVE', deletedAt: null } }).catch(() => 0),
      (this.prisma as any).maintenanceContract.count({ where: { deletedAt: null } }).catch(() => 0),
      (this.prisma as any).maintenanceContract.aggregate({
        _sum: { monthlyFee: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }).catch(() => ({ _sum: { monthlyFee: 0 } })),
      (this.prisma as any).maintenanceContractVisit.count({
        where: { status: 'SCHEDULED', scheduledDate: { lte: new Date(Date.now() + 14 * 86400000) } },
      }).catch(() => 0),
      (this.prisma as any).maintenanceContractVisit.count({
        where: { status: 'GENERATED' },
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

  /** Dashboard BI ejecutivo unificado — todo lo de fase 10 en un solo payload. */
  async getExecutiveBiDashboard() {
    const [marginByType, engineers, clientRoi, branches, contracts, dashboard] = await Promise.all([
      this.getMarginByProjectType(),
      this.getEngineerPerformanceRanking(10),
      this.getClientRoi(15),
      this.getBranchActivityRanking(15),
      this.getMaintenanceContractsKpis(),
      this.getExecutiveDashboard(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      summary: dashboard,
      contracts,
      marginByType,
      engineers,
      clientRoi,
      branches,
    };
  }
}
