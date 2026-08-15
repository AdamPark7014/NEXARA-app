import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import { MaintenanceContractsService } from '../../maintenance-contracts/maintenance-contracts.service.js';
import { VehiclesService } from '../../vehicles/vehicles.service.js';
import { WebhooksService } from '../../webhooks/webhooks.service.js';
import { OPEN_ACTIVITY_WHERE } from '../../activities/activity-status.js';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly maintenanceContracts: MaintenanceContractsService,
    private readonly vehiclesService: VehiclesService,
    @Optional() private readonly webhooks?: WebhooksService,
  ) {}

  // ── Contratos de mantenimiento — generar OT cada hora ───────────
  @Cron('15 * * * *', { name: 'maintenance-contracts-auto-ot' })
  async handleMaintenanceContractsAutoOt() {
    this.logger.log('Procesando contratos de mantenimiento (auto-OT)...');
    try {
      const result = await this.maintenanceContracts.runAutoGenerationCycle();
      if (result.generated > 0) {
        this.logger.log(`Auto-OT generadas: ${result.generated} de ${result.processed} visitas`);
      }
    } catch (error) {
      this.logger.error('Auto-OT contratos falló', error as Error);
    }
  }

  // ── Facturas vencidas — cada día 8AM ─────────────────────────────
  @Cron('0 8 * * *', { name: 'overdue-invoices' })
  async handleOverdueInvoices() {
    this.logger.log('Verificando facturas vencidas...');
    const overdue = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
        isCancelled: false,
      },
      include: { client: true, createdBy: true },
    });

    for (const inv of overdue) {
      const days = Math.floor((Date.now() - inv.dueDate.getTime()) / 86400000);
      if (inv.createdBy?.email) {
        await this.email.sendInvoiceOverdue(
          inv.createdBy.email,
          inv.invoiceNumber,
          inv.client?.name || inv.receptorName || 'Sin cliente',
          Number(inv.totalAmount),
          days,
        );
      }
    }
    this.logger.log(`Facturas vencidas procesadas: ${overdue.length}`);
  }

  // ── Órdenes de compra próximas a vencer — cada día 9AM ──────────
  @Cron('0 9 * * *', { name: 'po-reminders' })
  async handlePOReminders() {
    this.logger.log('Verificando órdenes de compra próximas...');
    const threeDaysFromNow = new Date(Date.now() + 3 * 86400000);
    const upcoming = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] },
        expectedDate: { lte: threeDaysFromNow, gte: new Date() },
      },
      include: { supplier: true, createdBy: true },
    });

    for (const po of upcoming) {
      if (po.createdBy?.email && po.expectedDate) {
        await this.email.sendPurchaseOrderReminder(
          po.createdBy.email,
          po.poNumber,
          po.supplier?.name || 'Sin proveedor',
          po.expectedDate,
        );
      }
    }
    this.logger.log(`PO reminders enviados: ${upcoming.length}`);
  }

  // ── Mantenimiento preventivo — cada día 7AM ─────────────────────
  @Cron('0 7 * * *', { name: 'maintenance-reminders' })
  async handleMaintenanceReminders() {
    this.logger.log('Verificando mantenimientos pendientes...');
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000);
    const upcoming = await this.prisma.maintenanceOrder.findMany({
      where: {
        status: 'PLANNED',
        plannedDate: { lte: sevenDaysFromNow, gte: new Date() },
      },
      include: { asset: true, assignedTo: true },
    });

    for (const order of upcoming) {
      if ((order.assignedTo as any)?.email && order.plannedDate) {
        await this.email.sendMaintenanceDue(
          (order.assignedTo as any).email,
          (order.asset as any)?.name || 'Equipo',
          order.type || 'Preventivo',
          order.plannedDate,
        );
      }
    }
    this.logger.log(`Maintenance reminders: ${upcoming.length}`);
  }

  // ── Limpieza de logs de auditoría > 90 días — domingo 3AM ──────
  @Cron('0 3 * * 0', { name: 'audit-cleanup' })
  async handleAuditCleanup() {
    this.logger.log('Limpiando logs de auditoría antiguos...');
    const cutoff = new Date(Date.now() - 90 * 86400000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`Audit logs eliminados: ${result.count}`);
  }

  // ── Alertas de margen de proyectos — cada día 10AM ─────────────
  @Cron('0 10 * * *', { name: 'project-margin-alerts' })
  async handleProjectMarginAlerts() {
    this.logger.log('Verificando proyectos con riesgo de margen...');
    const activeProjects = await this.prisma.salesProject.findMany({
      where: { status: { in: ['IN_PROGRESS', 'PLANNED'] } },
      include: { opportunity: { select: { ownerId: true, title: true } } },
    });

    let alertsSent = 0;
    for (const project of activeProjects) {
      const opProject = await this.prisma.operationalProject.findFirst({
        where: { salesProjectId: project.id },
        select: { id: true },
      });
      if (!opProject) continue;

      const acts = await this.prisma.activity.findMany({
        where: { projectId: opProject.id, deletedAt: null },
        select: { id: true },
      });
      const activityIds = acts.map((a) => a.id);

      const [viaticAgg, expAgg, viaticProjAgg] = await Promise.all([
        activityIds.length
          ? this.prisma.viatico.aggregate({ where: { actividadId: { in: activityIds } }, _sum: { montoSolicitado: true } })
          : Promise.resolve({ _sum: { montoSolicitado: null } }),
        activityIds.length
          ? this.prisma.expense.aggregate({ where: { actividadId: { in: activityIds }, deletedAt: null }, _sum: { montoSolicitado: true } })
          : Promise.resolve({ _sum: { montoSolicitado: null } }),
        this.prisma.viatico.aggregate({ where: { projectId: project.id }, _sum: { montoSolicitado: true } }),
      ]);

      const actualViaticos =
        Number(viaticAgg._sum.montoSolicitado || 0) + Number(viaticProjAgg._sum.montoSolicitado || 0);
      const actualOperativo = Number(expAgg._sum.montoSolicitado || 0);
      const budget = Number(project.budget) || 0;
      const totalActual = Number(project.costProducts) + actualViaticos + actualOperativo;
      const marginActual = budget - totalActual;
      const marginPercent = budget > 0 ? (marginActual / budget) * 100 : 0;

      let severity: 'overspend' | 'low_margin' | null = null;
      if (marginPercent < 0) severity = 'overspend';
      else if (marginPercent < 10) severity = 'low_margin';

      if (severity) {
        await this.notificationHierarchy.notifyProjectMarginAlert({
          projectId: project.id,
          projectName: project.name || project.opportunity?.title || `Proyecto ${project.id}`,
          ownerId: project.opportunity?.ownerId,
          marginPercent,
          severity,
          actualMargin: marginActual,
          budget,
        });
        alertsSent += 1;
      }
    }
    this.logger.log(`Alertas de margen emitidas: ${alertsSent}`);
  }

  // ── Vehículos por vencer — 8AM y 4PM ───────────────────────────
  @Cron('0 8,16 * * *', { name: 'vehicle-usage-expiring' })
  async handleVehicleUsageExpiring() {
    this.logger.log('Verificando asignaciones de vehículo por vencer...');
    try {
      const result = await this.vehiclesService.notifyExpiringAssignments(24);
      if (result.notified > 0) {
        this.logger.log(`Avisos de vencimiento de vehículo: ${result.notified}`);
      }
    } catch (error) {
      this.logger.error('Cron vehículos por vencer falló', error as Error);
    }
  }

  // ── KPI Snapshot — cada hora ────────────────────────────────────
  @Cron(CronExpression.EVERY_HOUR, { name: 'kpi-snapshot' })
  async handleKpiSnapshot() {
    const [
      activeActivities,
      pendingPOs,
      overdueInvoices,
    ] = await Promise.all([
      this.prisma.activity.count({ where: { estatus: 'EN_PROGRESO' } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED'] } } }),
      this.prisma.invoice.count({ where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() }, isCancelled: false } }),
    ]);

    const today = new Date();
    await this.prisma.kpiSnapshot.create({
      data: {
        kpiName: 'hourly_summary',
        kpiCategory: 'operations',
        value: 0,
        periodStart: today,
        periodEnd: today,
        metadata: {
          activeActivities,
          pendingPOs,
          overdueInvoices,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  // ── Webhooks retry — cada 5 min ────────────────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'webhook-retries' })
  async handleWebhookRetries() {
    if (!this.webhooks) return;
    try {
      const result = await this.webhooks.processRetries(40);
      if (result.processed > 0) {
        this.logger.log(`Webhook retries procesados: ${result.processed}`);
      }
    } catch (error) {
      this.logger.error('Webhook retries falló', error as Error);
    }
  }

  // ── IAM: usuarios inactivos 30d — diario 9AM ───────────────────
  @Cron('0 9 * * *', { name: 'inactive-users-warn' })
  async handleInactiveUsers() {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const stale = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { lastLoginAt: { lt: cutoff } },
          { lastLoginAt: null, fechaCreacion: { lt: cutoff } },
        ],
        email: { notIn: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] },
      },
      select: { id: true, email: true, nombre: true, lastLoginAt: true },
      take: 100,
    });
    if (!stale.length) return;
    this.logger.log(`Usuarios inactivos 30d: ${stale.length}`);
    if (this.webhooks) {
      const memberships = await this.prisma.userCompany.findMany({
        where: { userId: { in: stale.map((u) => u.id) } },
        select: { userId: true, companyId: true },
      });
      const byCompany = new Map<number, typeof stale>();
      for (const m of memberships) {
        const user = stale.find((u) => u.id === m.userId);
        if (!user) continue;
        const list = byCompany.get(m.companyId) || [];
        list.push(user);
        byCompany.set(m.companyId, list);
      }
      if (!byCompany.size) {
        const primary = await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true },
          select: { id: true },
        });
        if (primary) byCompany.set(primary.id, stale);
      }
      for (const [companyId, users] of byCompany) {
        await this.webhooks.emit(
          'user.inactive',
          {
            count: users.length,
            users: users.map((u) => ({ id: u.id, email: u.email, lastLoginAt: u.lastLoginAt })),
            companyId,
          },
          companyId,
        );
      }
    }
  }

  // ── Inventario: dead stock + low stock — diario 7AM ────────────
  @Cron('0 7 * * *', { name: 'inventory-health-alerts' })
  async handleInventoryHealth() {
    const levels = await this.prisma.stockLevel.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, companyId: true } },
      },
    });
    const low = levels.filter(
      (l) => Number(l.reorderPoint) > 0 && Number(l.quantity) <= Number(l.reorderPoint),
    );
    if (low.length && this.webhooks) {
      const byCompany = new Map<number, typeof low>();
      for (const l of low) {
        const cid = l.warehouse?.companyId;
        if (cid == null) continue;
        const list = byCompany.get(cid) || [];
        list.push(l);
        byCompany.set(cid, list);
      }
      for (const [companyId, items] of byCompany) {
        await this.webhooks.emit(
          'stock.low',
          {
            count: items.length,
            companyId,
            items: items.slice(0, 30).map((l) => ({
              productId: l.productId,
              sku: l.product?.sku,
              name: l.product?.name,
              quantity: Number(l.quantity),
              reorderPoint: Number(l.reorderPoint),
            })),
          },
          companyId,
        );
      }
    }

    const d90 = new Date(Date.now() - 90 * 86_400_000);
    const recentMoves = await this.prisma.stockMovement.findMany({
      where: { createdAt: { gte: d90 }, type: { in: ['DISPATCH', 'SCRAP', 'PRODUCTION_OUT'] } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const moved = new Set(recentMoves.map((m) => m.productId));
    const dead = levels.filter((l) => Number(l.quantity) > 0 && !moved.has(l.productId));
    if (dead.length && this.webhooks) {
      const byCompany = new Map<number, typeof dead>();
      for (const l of dead) {
        const cid = l.warehouse?.companyId;
        if (cid == null) continue;
        const list = byCompany.get(cid) || [];
        list.push(l);
        byCompany.set(cid, list);
      }
      for (const [companyId, items] of byCompany) {
        await this.webhooks.emit(
          'stock.dead',
          {
            count: items.length,
            companyId,
            value: items.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0),
            items: items.slice(0, 30).map((l) => ({
              productId: l.productId,
              sku: l.product?.sku,
              name: l.product?.name,
              quantity: Number(l.quantity),
            })),
          },
          companyId,
        );
      }
    }
  }

  // ── SLA breach escalate — cada hora ────────────────────────────
  @Cron(CronExpression.EVERY_HOUR, { name: 'sla-breach-escalate' })
  async handleSlaBreachEscalate() {
    const now = Date.now();
    const open = await this.prisma.activity.findMany({
      where: { ticketType: { not: null }, ...OPEN_ACTIVITY_WHERE },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        prioridad: true,
        fechaAsignacion: true,
        responsableId: true,
        companyId: true,
      },
      take: 200,
    });
    const limits: Record<string, number> = { Alta: 8, Media: 24, Baja: 72 };
    const breaches = open.filter((t) => {
      if (!t.fechaAsignacion) return false;
      const hrs = (now - t.fechaAsignacion.getTime()) / 3600000;
      return hrs > (limits[t.prioridad || 'Media'] ?? 24);
    });
    if (!breaches.length) return;
    this.logger.warn(`SLA breaches abiertos: ${breaches.length}`);
    if (this.webhooks) {
      const byCompany = new Map<number, typeof breaches>();
      for (const t of breaches) {
        const list = byCompany.get(t.companyId) || [];
        list.push(t);
        byCompany.set(t.companyId, list);
      }
      for (const [companyId, tickets] of byCompany) {
        await this.webhooks.emit(
          'ticket.sla_breach',
          {
            count: tickets.length,
            companyId,
            tickets: tickets.slice(0, 20).map((t) => ({
              id: t.id,
              anNumber: t.anNumber,
              titulo: t.titulo,
              prioridad: t.prioridad,
              assigneeId: t.responsableId,
            })),
          },
          companyId,
        );
      }
    }
  }
}
