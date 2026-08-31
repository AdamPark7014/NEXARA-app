/**
 * AlertsService — orquesta alertas cross-módulo en NEXARA.
 *
 * Cubre 3 dolores reales del negocio tech-services:
 *   1. Margen real del proyecto vs presupuesto (cae bajo umbral)
 *   2. SLA de contratos de mantenimiento (visitas vencidas / a punto de vencer)
 *   3. Stock crítico en almacén (cantidad <= minStock)
 *
 * Cada chequeo:
 *  - corre vía @Cron
 *  - identifica destinatarios por rol (Director Ops, Director Comercial,
 *    Director Admin, Project Manager, Warehouse Manager, Maintenance Coord)
 *  - usa NotificationsService.createBulkNotifications para inbox + push
 *  - es idempotente: no duplica la misma alerta dentro de la ventana
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService, type INotificationPayload } from '../notifications/notifications.service.js';
import { ORG_ROLE_KEYS, type OrgRoleKey } from '../common/org-roles.js';

const MARGIN_ALERT_THRESHOLD_PERCENT = 10;
const STOCK_ALERT_DEDUP_HOURS = 24;
const MARGIN_ALERT_DEDUP_HOURS = 24;
const SLA_ALERT_DEDUP_HOURS = 6;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────

  private async getUserIdsByOrgRoles(keys: OrgRoleKey[]): Promise<number[]> {
    if (!keys.length) return [];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { role: { orgRoleKey: { in: keys } } },
          // Backup: superadmins (CEO siempre se entera)
          { email: { in: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] } },
        ],
      },
      select: { id: true },
    });
    return Array.from(new Set(users.map((u) => u.id)));
  }

  private async getAlreadyAlertedUserIds(opts: {
    userIds: number[];
    category: string;
    entityType: string;
    entityId: number;
    hoursWindow: number;
  }): Promise<Set<number>> {
    if (!opts.userIds.length) return new Set();
    const since = new Date(Date.now() - opts.hoursWindow * 3600 * 1000);
    const existing = await this.prisma.notification.findMany({
      where: {
        userId: { in: opts.userIds },
        category: opts.category,
        entityType: opts.entityType,
        relatedEntityId: opts.entityId,
        createdAt: { gte: since },
      },
      select: { userId: true },
    });
    return new Set(existing.map((n) => n.userId));
  }

  private async fanout(
    userIds: number[],
    base: Omit<INotificationPayload, 'userId'>,
    dedupOpts?: { entityType: string; entityId: number; category: string; hoursWindow: number },
  ) {
    if (!userIds.length) return [];
    let eligibleIds = userIds;
    if (dedupOpts) {
      const alreadySent = await this.getAlreadyAlertedUserIds({
        userIds,
        category: dedupOpts.category,
        entityType: dedupOpts.entityType,
        entityId: dedupOpts.entityId,
        hoursWindow: dedupOpts.hoursWindow,
      });
      eligibleIds = userIds.filter((id) => !alreadySent.has(id));
    }
    if (!eligibleIds.length) return [];
    return this.notifications.createBulkNotifications(
      eligibleIds.map((userId) => ({ ...base, userId })),
    );
  }

  // ─── 1) margen real bajo umbral ────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async checkMarginAlerts() {
    try {
      const projects = await this.prisma.salesProject.findMany({
        where: { status: { in: ['IN_PROGRESS', 'CLOSED'] } },
        select: {
          id: true,
          name: true,
          budget: true,
          margin: true,
          costProducts: true,
          costViaticos: true,
          costOperativo: true,
          opportunity: { select: { ownerId: true } },
        },
      });

      const recipientIds = await this.getUserIdsByOrgRoles([
        ORG_ROLE_KEYS.CEO,
        ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
        ORG_ROLE_KEYS.DIRECTOR_OPS,
        ORG_ROLE_KEYS.SALES_MANAGER,
      ]);

      let alerted = 0;
      for (const p of projects) {
        const budget = Number(p.budget || 0);
        if (budget <= 0) continue;
        const totalCost =
          Number(p.costProducts || 0) +
          Number(p.costViaticos || 0) +
          Number(p.costOperativo || 0);
        const realMargin = budget - totalCost;
        const realMarginPct = (realMargin / budget) * 100;

        if (realMarginPct < MARGIN_ALERT_THRESHOLD_PERCENT) {
          const ownerId = p.opportunity?.ownerId;
          const targets = Array.from(new Set([
            ...recipientIds,
            ...(ownerId ? [ownerId] : []),
          ]));

          await this.fanout(
            targets,
            {
              type: 'MARGIN_ALERT',
              category: 'margin-alert',
              title: `⚠️ Margen crítico — ${p.name}`,
              message: `Margen real de ${realMarginPct.toFixed(1)}% (umbral ${MARGIN_ALERT_THRESHOLD_PERCENT}%). Revisa costos reales vs presupuesto.`,
              entityType: 'SalesProject',
              relatedEntityId: p.id,
              relatedUrl: `/crm/projects/${p.id}`,
              priority: realMarginPct < 0 ? 'high' : 'normal',
            },
            {
              category: 'margin-alert',
              entityType: 'SalesProject',
              entityId: p.id,
              hoursWindow: MARGIN_ALERT_DEDUP_HOURS,
            },
          );
          alerted += 1;
        }
      }

      if (alerted > 0) {
        this.logger.log(`[margin] ${alerted} proyectos con margen < ${MARGIN_ALERT_THRESHOLD_PERCENT}%`);
      }
    } catch (err) {
      this.logger.error('checkMarginAlerts failed', err as any);
    }
  }

  // ─── 2) SLA contratos de mantenimiento ─────────────────────────────────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkMaintenanceSlaAlerts() {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 48 * 3600 * 1000);

      const visits = await (this.prisma as any).maintenanceContractVisit.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledDate: { lte: horizon },
          contract: { status: 'ACTIVE' },
        },
        include: {
          contract: { select: { id: true, contractNumber: true, title: true, ownerId: true } },
          assignedTo: { select: { id: true } },
        },
      });

      if (!visits?.length) return;

      const recipientIds = await this.getUserIdsByOrgRoles([
        ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
        ORG_ROLE_KEYS.DIRECTOR_OPS,
        ORG_ROLE_KEYS.PROJECT_MANAGER,
      ]);

      let alerted = 0;
      for (const v of visits) {
        const scheduled = new Date(v.scheduledDate);
        const overdue = scheduled.getTime() < now.getTime();
        const targets = Array.from(new Set([
          ...recipientIds,
          ...(v.contract?.ownerId ? [v.contract.ownerId] : []),
          ...(v.assignedTo?.id ? [v.assignedTo.id] : []),
        ]));
        if (!targets.length) continue;

        const landingUrl = v.activityId
          ? `/ops/activities/${v.activityId}`
          : `/ops/maintenance/contracts`;

        const title = overdue
          ? `⛔ SLA vencido — visita mantenimiento ${v.contract?.contractNumber || ''}`
          : `⏰ SLA próximo — visita mantenimiento ${v.contract?.contractNumber || ''}`;
        const message = overdue
          ? `La visita programada para ${scheduled.toLocaleDateString('es-MX')} está vencida. Reasigna o reprograma.`
          : `Visita programada para ${scheduled.toLocaleDateString('es-MX')}. Confirma cuadrilla y materiales.`;

        await this.fanout(
          targets,
          {
            type: 'SLA_ALERT',
            category: 'sla-alert',
            title,
            message,
            entityType: 'MaintenanceContractVisit',
            relatedEntityId: v.id,
            relatedUrl: landingUrl,
            priority: overdue ? 'high' : 'normal',
          },
          {
            category: 'sla-alert',
            entityType: 'MaintenanceContractVisit',
            entityId: v.id,
            hoursWindow: SLA_ALERT_DEDUP_HOURS,
          },
        );
        alerted += 1;
      }

      if (alerted > 0) {
        this.logger.log(`[sla] ${alerted} visitas mantenimiento alertadas`);
      }
    } catch (err) {
      this.logger.error('checkMaintenanceSlaAlerts failed', err as any);
    }
  }

  // ─── 3) Stock crítico en almacén ───────────────────────────────────────

  @Cron(CronExpression.EVERY_2_HOURS)
  async checkStockAlerts() {
    try {
      const levels = await this.prisma.stockLevel.findMany({
        where: { minStock: { gt: 0 } },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      if (!levels?.length) return;

      const recipientIds = await this.getUserIdsByOrgRoles([
        ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
        ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
        ORG_ROLE_KEYS.DIRECTOR_ADMIN,
      ]);
      if (!recipientIds.length) return;

      let alerted = 0;
      for (const level of levels) {
        const qty = Number(level.quantity || 0);
        const min = Number(level.minStock || 0);
        if (min <= 0) continue;
        if (qty > min) continue;

        const sku = level.product?.sku || `#${level.productId}`;
        const productName = level.product?.name || sku;
        const wh = level.warehouse?.name || `Almacén ${level.warehouseId}`;

        await this.fanout(
          recipientIds,
          {
            type: 'STOCK_ALERT',
            category: 'stock-alert',
            title: `📦 Stock crítico — ${sku}`,
            message: `${productName} en ${wh}: ${qty} / mínimo ${min}. Genera requisición de compra.`,
            entityType: 'StockLevel',
            relatedEntityId: level.id,
            relatedUrl: `/erp/warehouse?productId=${level.productId}`,
            priority: qty <= 0 ? 'high' : 'normal',
          },
          {
            category: 'stock-alert',
            entityType: 'StockLevel',
            entityId: level.id,
            hoursWindow: STOCK_ALERT_DEDUP_HOURS,
          },
        );
        alerted += 1;
      }

      if (alerted > 0) {
        this.logger.log(`[stock] ${alerted} productos en mínimo crítico`);
      }
    } catch (err) {
      this.logger.error('checkStockAlerts failed', err as any);
    }
  }

  // ─── trigger manual (útil desde admin) ─────────────────────────────────

  async runAllNow() {
    await this.checkMarginAlerts();
    await this.checkMaintenanceSlaAlerts();
    await this.checkStockAlerts();
    return { ok: true, ranAt: new Date().toISOString() };
  }
}
