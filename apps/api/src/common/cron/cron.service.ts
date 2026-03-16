import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

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

  // ── Workflow aprobaciones pendientes — cada día 10AM ─────────────
  @Cron('0 10 * * *', { name: 'workflow-nudge' })
  async handleWorkflowNudges() {
    this.logger.log('Verificando aprobaciones pendientes...');
    const pending = await this.prisma.workflowApproval.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - 2 * 86400000) },
      },
      include: {
        instance: { include: { workflow: true } },
        step: { include: { approverUser: true } },
      },
    });

    for (const approval of pending) {
      const email = (approval.step?.approverUser as any)?.email;
      if (email) {
        await this.email.sendWorkflowPending(
          email,
          approval.instance?.workflow?.entityType || 'Documento',
          approval.instance?.entityId?.toString() || '',
        );
      }
    }
    this.logger.log(`Workflow nudges: ${pending.length}`);
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

  // ── KPI Snapshot — cada hora ────────────────────────────────────
  @Cron(CronExpression.EVERY_HOUR, { name: 'kpi-snapshot' })
  async handleKpiSnapshot() {
    const [
      activeActivities,
      pendingPOs,
      openNCRs,
      overdueInvoices,
      productionInProgress,
    ] = await Promise.all([
      this.prisma.activity.count({ where: { estatus: 'EN_PROGRESO' } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED'] } } }),
      this.prisma.nonConformanceReport.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.invoice.count({ where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() }, isCancelled: false } }),
      this.prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
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
          openNCRs,
          overdueInvoices,
          productionInProgress,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
