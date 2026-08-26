import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { FINISHED_ACTIVITY_WHERE } from '../activities/activity-status.js';
import { kpiFallback } from '../common/kpi-fallback.js';

@Injectable()
export class ExecutiveService {
  constructor(private readonly prisma: PrismaService) {}

  /** Snapshot completo C-Level con datos de todos los módulos. */
  async getCLevelDashboard(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const tw = companyWhere(tenantId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Ejecuto todo en paralelo
    const [
      revenueMtd,
      revenuePrevMonth,
      revenueYtd,
      wonOppsMtd,
      pipelineValue,
      hotLeads,
      tendersOpen,
      tendersWon,
      // Operación
      activeProjects,
      otOpen,
      otOverdue,
      otCompletedMtd,
      // Finanzas
      invoicedMtd,
      arOutstanding,
      apOutstanding,
      overdueInvoices,
      cashOnHand,
      // Tickets/clientes
      ticketsOpen,
      ticketsClosedMtd,
      activeClients,
      // Mantenimiento
      activeContracts,
      upcomingVisits,
      // Recursos humanos
      activeUsers,
      // Compras
      pendingRequisitions,
      pendingPOs,
      // Inventario
      lowStockItems,
      // Top performers
      topSellers,
      topProjectTypes,
    ] = await Promise.all([
      this.prisma.salesOpportunity.aggregate({
        where: { ...tw, stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { ...tw, stage: 'WON' as any, closedAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { ...tw, stage: 'WON' as any, closedAt: { gte: startOfYear } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.count({
        where: { ...tw, stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { ...tw, stage: { notIn: ['WON' as any, 'LOST' as any] } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.salesLead.count({
        where: { ...tw, score: { gte: 70 }, status: { in: ['NEW' as any, 'CONTACTED' as any, 'QUALIFIED' as any] } },
      }).catch(kpiFallback('executive.service.ts:83', 0)),
      (this.prisma as any).tender.count({
        where: { ...tw, status: { in: ['PROSPECT', 'INTERESTED', 'IN_PREP', 'SUBMITTED', 'EVALUATION'] } },
      }).catch(kpiFallback('executive.service.ts:86', 0)),
      (this.prisma as any).tender.count({ where: { ...tw, status: 'AWARDED' } }).catch(kpiFallback('executive.service.ts:87', 0)),
      this.prisma.operationalProject.count({
        where: { ...tw, status: 'ACTIVE' as any, deletedAt: null },
      }).catch(kpiFallback('executive.service.ts:90', 0)),
      this.prisma.activity.count({
        where: { ...tw, estatus: { in: ['Pendiente', 'En Proceso', 'Asignado'] } },
      }).catch(kpiFallback('executive.service.ts:93', 0)),
      this.prisma.activity.count({
        where: { ...tw, estatus: { in: ['Pendiente', 'En Proceso'] }, fechaEntregaEsperada: { lt: now } },
      }).catch(kpiFallback('executive.service.ts:96', 0)),
      this.prisma.activity.count({
        where: { ...tw, ...FINISHED_ACTIVITY_WHERE, fechaFinalizacion: { gte: startOfMonth, lte: endOfMonth } },
      }).catch(kpiFallback('executive.service.ts:99', 0)),
      this.prisma.invoice.aggregate({
        where: { ...tw, issueDate: { gte: startOfMonth, lte: endOfMonth }, status: { not: 'CANCELLED' }, type: 'ACCOUNTS_RECEIVABLE' },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }).catch(() => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } } as any)),
      this.prisma.invoice.aggregate({
        where: { ...tw, type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { totalAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0 } } as any)),
      this.prisma.invoice.aggregate({
        where: { ...tw, type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { totalAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0 } } as any)),
      this.prisma.invoice.count({
        where: { ...tw, status: 'OVERDUE' as any },
      }).catch(kpiFallback('executive.service.ts:115', 0)),
      this.prisma.bankAccount.aggregate({
        where: { ...tw, isActive: true },
        _sum: { currentBalance: true },
      }).catch(() => ({ _sum: { currentBalance: 0 } } as any)),
      this.prisma.activity.count({
        where: { ...tw, ticketType: { not: null }, estatus: { in: ['Pendiente', 'En Proceso', 'Asignado'] } },
      }).catch(kpiFallback('executive.service.ts:122', 0)),
      this.prisma.activity.count({
        where: { ...tw, ticketType: { not: null }, ...FINISHED_ACTIVITY_WHERE, fechaFinalizacion: { gte: startOfMonth, lte: endOfMonth } },
      }).catch(kpiFallback('executive.service.ts:125', 0)),
      this.prisma.salesClient.count({ where: { ...tw } }).catch(kpiFallback('executive.service.ts:126', 0)),
      (this.prisma as any).maintenanceContract.count({ where: { ...tw, status: 'ACTIVE' } }).catch(kpiFallback('executive.service.ts:127', 0)),
      // MaintenanceContractVisit has no companyId — scope via contract relation
      (this.prisma as any).maintenanceContractVisit.count({
        where: {
          contract: tw,
          scheduledDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) },
          status: { in: ['SCHEDULED', 'GENERATED'] },
        },
      }).catch(kpiFallback('executive.service.ts:135', 0)),
      this.prisma.user.count({
        where: { companyMemberships: { some: { companyId: tenantId } } },
      }).catch(kpiFallback('executive.service.ts:138', 0)),
      this.prisma.purchaseRequisition.count({ where: { ...tw, status: 'SUBMITTED' } }).catch(kpiFallback('executive.service.ts:139', 0)),
      this.prisma.purchaseOrder.count({ where: { ...tw, status: { in: ['DRAFT', 'SENT'] } } }).catch(kpiFallback('executive.service.ts:140', 0)),
      // stockItem is optional / may lack companyId — scope defensively if field exists
      (this.prisma as any).stockItem?.findMany({
        where: { ...tw, currentQuantity: { lte: { _ref: 'minQuantity' } as any } },
        take: 5,
      }).catch(kpiFallback('executive.service.ts:145', [])) ?? [],
      this.prisma.salesOpportunity.groupBy({
        by: ['ownerId'],
        where: { ...tw, stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { value: true },
        _count: { _all: true },
        orderBy: { _sum: { value: 'desc' } },
        take: 5,
      }).catch(kpiFallback('executive.service.ts:153', [])),
      this.prisma.operationalProject.groupBy({
        by: ['projectType'],
        where: { ...tw, status: 'COMPLETED' as any, actualEndDate: { gte: startOfYear } },
        _count: { _all: true },
      }).catch(kpiFallback('executive.service.ts:158', [])),
    ]);

    const revenueMtdValue = Number(revenueMtd._sum?.value || 0);
    const revenuePrevMonthValue = Number(revenuePrevMonth._sum?.value || 0);
    const revenueMoMChange = revenuePrevMonthValue > 0
      ? +(((revenueMtdValue - revenuePrevMonthValue) / revenuePrevMonthValue) * 100).toFixed(1)
      : 0;

    // Hydrate top sellers con nombres
    const ownerIds = topSellers.map((s: any) => s.ownerId).filter(Boolean);
    const owners = ownerIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: ownerIds as number[] } },
          select: { id: true, nombre: true },
        })
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.nombre]));
    const topAccounts = await this.getTopClientAccounts(tenantId, 5);

    return {
      generatedAt: now.toISOString(),
      headlineKpis: {
        revenueMtd: revenueMtdValue,
        revenuePrevMonth: revenuePrevMonthValue,
        revenueMoMChange,
        revenueYtd: Number(revenueYtd._sum?.value || 0),
        wonOppsMtd,
        pipelineValue: Number(pipelineValue._sum?.value || 0),
        pipelineCount: pipelineValue._count?._all || 0,
        cashOnHand: Number(cashOnHand._sum?.currentBalance || 0),
        arOutstanding: Number((arOutstanding._sum as any)?.totalAmount || 0),
        apOutstanding: Number((apOutstanding._sum as any)?.totalAmount || 0),
        workingCapital: Number((arOutstanding._sum as any)?.totalAmount || 0) - Number((apOutstanding._sum as any)?.totalAmount || 0),
      },
      sales: {
        hotLeads,
        tendersOpen,
        tendersWon,
      },
      operations: {
        activeProjects,
        otOpen,
        otOverdue,
        otCompletedMtd,
        ticketsOpen,
        ticketsClosedMtd,
      },
      finance: {
        invoicedMtd: Number((invoicedMtd._sum as any)?.totalAmount || 0),
        invoicesCountMtd: (invoicedMtd as any)._count?._all || 0,
        overdueInvoices,
      },
      maintenance: {
        activeContracts,
        upcomingVisits,
      },
      procurement: {
        pendingRequisitions,
        pendingPOs,
        lowStockItems: lowStockItems.length || 0,
      },
      clientsCount: activeClients,
      teamSize: activeUsers,
      topSellers: topSellers.map((s: any) => ({
        ownerId: s.ownerId,
        ownerName: ownerMap.get(s.ownerId) || `User ${s.ownerId}`,
        revenue: Number(s._sum?.value || 0),
        wonCount: s._count?._all || 0,
      })),
      topAccounts,
      projectTypeBreakdown: topProjectTypes.map((g: any) => ({
        type: g.projectType,
        count: g._count?._all || 0,
      })),
      alerts: this.buildAlerts({
        revenueMoMChange,
        otOverdue,
        overdueInvoices,
        lowStockCount: lowStockItems.length || 0,
        hotLeads,
        upcomingVisits,
      }),
    };
  }

  private buildAlerts(s: { revenueMoMChange: number; otOverdue: number; overdueInvoices: number; lowStockCount: number; hotLeads: number; upcomingVisits: number }) {
    const alerts: Array<{ level: 'critical' | 'warning' | 'info'; icon: string; title: string; message: string }> = [];
    if (s.revenueMoMChange < -10) {
      alerts.push({ level: 'critical', icon: '📉', title: 'Revenue en caída', message: `${s.revenueMoMChange}% vs mes anterior` });
    } else if (s.revenueMoMChange > 15) {
      alerts.push({ level: 'info', icon: '🚀', title: 'Revenue en alza', message: `+${s.revenueMoMChange}% vs mes anterior` });
    }
    if (s.otOverdue > 0) {
      alerts.push({ level: 'warning', icon: '⏰', title: 'OT vencidas', message: `${s.otOverdue} órdenes de trabajo vencidas requieren atención` });
    }
    if (s.overdueInvoices > 0) {
      alerts.push({ level: 'warning', icon: '💵', title: 'Facturas vencidas', message: `${s.overdueInvoices} facturas pendientes de cobro` });
    }
    if (s.lowStockCount > 0) {
      alerts.push({ level: 'warning', icon: '📦', title: 'Stock bajo', message: `${s.lowStockCount} insumos en nivel crítico` });
    }
    if (s.hotLeads >= 5) {
      alerts.push({ level: 'info', icon: '🔥', title: 'Leads calientes', message: `${s.hotLeads} leads de alta puntuación esperan atención` });
    }
    if (s.upcomingVisits > 0) {
      alerts.push({ level: 'info', icon: '🛠️', title: 'Visitas próximas', message: `${s.upcomingVisits} visitas de mantenimiento en los próximos 30 días` });
    }
    return alerts;
  }

  private async getTopClientAccounts(companyId: number, limit = 5) {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const projects = await this.prisma.salesProject.findMany({
      where: {
        createdAt: { gte: since },
        opportunity: { companyId },
      },
      select: {
        budget: true,
        costProducts: true,
        costViaticos: true,
        costOperativo: true,
        opportunity: {
          select: {
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    const buckets = new Map<
      number,
      { clientId: number; clientName: string; projects: number; revenue: number; margin: number }
    >();

    for (const p of projects) {
      const client = p.opportunity?.client;
      if (!client) continue;
      const revenue = Number(p.budget);
      const cost =
        Number(p.costProducts) + Number(p.costViaticos) + Number(p.costOperativo);
      const margin = revenue - cost;
      const current = buckets.get(client.id) || {
        clientId: client.id,
        clientName: client.name,
        projects: 0,
        revenue: 0,
        margin: 0,
      };
      current.projects += 1;
      current.revenue += revenue;
      current.margin += margin;
      buckets.set(client.id, current);
    }

    return Array.from(buckets.values())
      .map((v) => ({
        ...v,
        revenue: Math.round(v.revenue * 100) / 100,
        margin: Math.round(v.margin * 100) / 100,
        marginPercent: v.revenue > 0 ? +((v.margin / v.revenue) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, limit);
  }
}
