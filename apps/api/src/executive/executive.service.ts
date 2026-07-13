import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ExecutiveService {
  constructor(private readonly prisma: PrismaService) {}

  /** Snapshot completo C-Level con datos de todos los módulos. */
  async getCLevelDashboard() {
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
        where: { stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { stage: 'WON' as any, closedAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { stage: 'WON' as any, closedAt: { gte: startOfYear } },
        _sum: { value: true },
      }),
      this.prisma.salesOpportunity.count({
        where: { stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { stage: { notIn: ['WON' as any, 'LOST' as any] } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.salesLead.count({
        where: { score: { gte: 70 }, status: { in: ['NEW' as any, 'CONTACTED' as any, 'QUALIFIED' as any] } },
      }).catch(() => 0),
      (this.prisma as any).tender.count({
        where: { status: { in: ['PROSPECT', 'INTERESTED', 'IN_PREP', 'SUBMITTED', 'EVALUATION'] } },
      }).catch(() => 0),
      (this.prisma as any).tender.count({ where: { status: 'AWARDED' } }).catch(() => 0),
      this.prisma.operationalProject.count({
        where: { status: 'ACTIVE' as any, deletedAt: null },
      }).catch(() => 0),
      this.prisma.activity.count({
        where: { estatus: { in: ['Pendiente', 'En Proceso', 'Asignado'] } },
      }).catch(() => 0),
      this.prisma.activity.count({
        where: { estatus: { in: ['Pendiente', 'En Proceso'] }, fechaEntregaEsperada: { lt: now } },
      }).catch(() => 0),
      this.prisma.activity.count({
        where: { estatus: 'Finalizado', fechaFinalizacion: { gte: startOfMonth, lte: endOfMonth } },
      }).catch(() => 0),
      this.prisma.invoice.aggregate({
        where: { issueDate: { gte: startOfMonth, lte: endOfMonth }, status: { not: 'CANCELLED' }, type: 'ACCOUNTS_RECEIVABLE' },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }).catch(() => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } } as any)),
      this.prisma.invoice.aggregate({
        where: { type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { totalAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0 } } as any)),
      this.prisma.invoice.aggregate({
        where: { type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { totalAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0 } } as any)),
      this.prisma.invoice.count({
        where: { status: 'OVERDUE' as any },
      }).catch(() => 0),
      this.prisma.bankAccount.aggregate({
        where: { isActive: true },
        _sum: { currentBalance: true },
      }).catch(() => ({ _sum: { currentBalance: 0 } } as any)),
      this.prisma.activity.count({
        where: { ticketType: { not: null }, estatus: { in: ['Pendiente', 'En Proceso', 'Asignado'] } },
      }).catch(() => 0),
      this.prisma.activity.count({
        where: { ticketType: { not: null }, estatus: 'Finalizado', fechaFinalizacion: { gte: startOfMonth, lte: endOfMonth } },
      }).catch(() => 0),
      this.prisma.salesClient.count().catch(() => 0),
      (this.prisma as any).maintenanceContract.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      (this.prisma as any).maintenanceContractVisit.count({
        where: { scheduledDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) }, status: { in: ['SCHEDULED', 'GENERATED'] } },
      }).catch(() => 0),
      this.prisma.user.count().catch(() => 0),
      this.prisma.purchaseRequisition.count({ where: { status: 'SUBMITTED' } }).catch(() => 0),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }).catch(() => 0),
      (this.prisma as any).stockItem?.findMany({
        where: { currentQuantity: { lte: { _ref: 'minQuantity' } as any } },
        take: 5,
      }).catch(() => []) ?? [],
      this.prisma.salesOpportunity.groupBy({
        by: ['ownerId'],
        where: { stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { value: true },
        _count: { _all: true },
        orderBy: { _sum: { value: 'desc' } },
        take: 5,
      }).catch(() => []),
      this.prisma.operationalProject.groupBy({
        by: ['projectType'],
        where: { status: 'COMPLETED' as any, actualEndDate: { gte: startOfYear } },
        _count: { _all: true },
      }).catch(() => []),
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
}
