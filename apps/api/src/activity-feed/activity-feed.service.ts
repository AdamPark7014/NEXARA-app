import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { PERMISSIONS } from '../common/permissions.js';
import { closedStatusVariants } from '../activities/activity-status.js';

export type ActivityFeedItem = {
  id: string;
  kind: 'notification' | 'audit' | 'sales' | 'ops' | 'crm' | 'procurement';
  at: string;
  title: string;
  subtitle?: string;
  actorName?: string;
  deepLink?: string;
  icon: string;
  priority?: 'high' | 'normal' | 'low';
};

@Injectable()
export class ActivityFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    userId: number,
    companyId: number | null | undefined,
    permissions: string[] = [],
    limit = 40,
  ): Promise<{ items: ActivityFeedItem[]; total: number }> {
    const tenantId = requireCompanyId(companyId);
    const take = Math.min(limit, 80);
    const scope = companyWhere(tenantId);
    const softNotifScope = companyWhere(tenantId, 'soft');

    const items: ActivityFeedItem[] = [];

    const notifications = await this.prisma.notification.findMany({
      where: { userId, ...softNotifScope },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        triggerUser: { select: { nombre: true } },
      },
    });

    for (const n of notifications) {
      items.push({
        id: `notif-${n.id}`,
        kind: this.kindForCategory(n.category),
        at: n.createdAt.toISOString(),
        title: n.title,
        subtitle: n.message,
        actorName: n.triggerUser?.nombre,
        deepLink: n.relatedUrl ?? undefined,
        icon: this.iconForCategory(n.category),
        priority: (n.priority as ActivityFeedItem['priority']) || 'normal',
      });
    }

    const canAudit = permissions.includes(PERMISSIONS.AUDIT_VIEW);
    const canSalesAudit =
      permissions.includes(PERMISSIONS.SALES_AUDIT_VIEW) ||
      permissions.includes(PERMISSIONS.SALES_VIEW);
    const canOps =
      permissions.includes(PERMISSIONS.ACTIVITIES_VIEW) ||
      permissions.includes(PERMISSIONS.SUPPORT_VIEW) ||
      permissions.includes(PERMISSIONS.CONSOLE_ACCESS);
    const canCrm =
      permissions.includes(PERMISSIONS.CRM_ACTIVITIES_VIEW) ||
      permissions.includes(PERMISSIONS.SALES_VIEW) ||
      permissions.includes(PERMISSIONS.PANEL_VENTAS);
    const canProcurement =
      permissions.includes(PERMISSIONS.PROCUREMENT_VIEW) ||
      permissions.includes(PERMISSIONS.PROCUREMENT_APPROVE) ||
      permissions.includes(PERMISSIONS.PROCUREMENT_MANAGE);

    const signalQueries: Promise<void>[] = [];

    if (canAudit || canSalesAudit) {
      signalQueries.push(
        (async () => {
          const auditWhere: Record<string, unknown> = { ...scope };
          if (!canAudit && canSalesAudit) {
            auditWhere.source = 'sales';
          }
          const audits = await this.prisma.auditLog.findMany({
            where: auditWhere,
            orderBy: { createdAt: 'desc' },
            take: Math.min(15, take),
            include: { user: { select: { nombre: true } } },
          });
          for (const row of audits) {
            items.push({
              id: `audit-${row.id}`,
              kind: row.source === 'sales' ? 'sales' : 'audit',
              at: row.createdAt.toISOString(),
              title: `${row.action} · ${row.entityType}`,
              subtitle: row.entityId ? `#${row.entityId}` : undefined,
              actorName: row.user?.nombre,
              deepLink: this.deepLinkForAudit(row.entityType, row.entityId),
              icon: row.source === 'sales' ? '💼' : '📜',
              priority: 'low',
            });
          }
        })(),
      );
    }

    if (canOps) {
      signalQueries.push(
        (async () => {
          const now = new Date();
          const overdue = await this.prisma.activity.findMany({
            where: {
              ...scope,
              deletedAt: null,
              clientId: { not: null },
              fechaEntregaEsperada: { lt: now },
              estatus: { notIn: closedStatusVariants() },
            },
            orderBy: { fechaEntregaEsperada: 'asc' },
            take: 8,
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              fechaEntregaEsperada: true,
              client: { select: { name: true } },
            },
          });
          for (const a of overdue) {
            items.push({
              id: `ops-sla-${a.id}`,
              kind: 'ops',
              at: (a.fechaEntregaEsperada ?? now).toISOString(),
              title: `SLA vencido · ${a.anNumber}`,
              subtitle: `${a.client?.name ?? 'Cliente'} — ${a.titulo}`,
              deepLink: `/ops/activities/${a.id}`,
              icon: '⏱️',
              priority: 'high',
            });
          }

          const openTickets = await this.prisma.clientTicketRequest.findMany({
            where: {
              ...scope,
              status: { in: ['NEW', 'APPROVED'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: {
              id: true,
              description: true,
              urgency: true,
              createdAt: true,
              client: { select: { name: true } },
            },
          });
          for (const t of openTickets) {
            items.push({
              id: `ops-ticket-${t.id}`,
              kind: 'ops',
              at: t.createdAt.toISOString(),
              title: `Ticket portal · ${t.client?.name ?? 'Cliente'}`,
              subtitle: (t.description || '').slice(0, 120),
              deepLink: `/ops/support/${t.id}`,
              icon: '🎫',
              priority: t.urgency === 'HIGH' ? 'high' : 'normal',
            });
          }
        })(),
      );
    }

    if (canCrm) {
      signalQueries.push(
        (async () => {
          const now = new Date();
          const overdueCrm = await this.prisma.crmActivity.findMany({
            where: {
              ...scope,
              status: 'PENDING',
              dueDate: { lt: now },
            },
            orderBy: { dueDate: 'asc' },
            take: 6,
            select: {
              id: true,
              subject: true,
              dueDate: true,
              lead: { select: { name: true } },
              opportunity: { select: { title: true, id: true } },
            },
          });
          for (const a of overdueCrm) {
            items.push({
              id: `crm-act-${a.id}`,
              kind: 'crm',
              at: a.dueDate.toISOString(),
              title: `Seguimiento vencido · ${a.subject}`,
              subtitle: a.lead?.name ?? a.opportunity?.title ?? undefined,
              deepLink: a.opportunity?.id
                ? `/crm/opportunities/${a.opportunity.id}`
                : '/crm/agenda',
              icon: '📞',
              priority: 'high',
            });
          }

          const threeDays = new Date(now.getTime() + 3 * 86400000);
          const expiring = await this.prisma.cotizacion.findMany({
            where: {
              ...scope,
              deletedAt: null,
              status: 'SENT',
              validUntil: { gte: now, lte: threeDays },
            },
            orderBy: { validUntil: 'asc' },
            take: 6,
            select: {
              id: true,
              quoteNumber: true,
              clientName: true,
              clientCompany: true,
              validUntil: true,
            },
          });
          for (const q of expiring) {
            items.push({
              id: `crm-quote-${q.id}`,
              kind: 'sales',
              at: (q.validUntil ?? now).toISOString(),
              title: `Cotización por expirar · ${q.quoteNumber}`,
              subtitle: q.clientCompany || q.clientName || undefined,
              deepLink: `/crm/quotes/${q.id}`,
              icon: '📄',
              priority: 'high',
            });
          }
        })(),
      );
    }

    if (canProcurement) {
      signalQueries.push(
        (async () => {
          const pendingPos = await this.prisma.purchaseOrder.findMany({
            where: {
              ...scope,
              deletedAt: null,
              status: 'DRAFT',
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              poNumber: true,
              createdAt: true,
              supplier: { select: { name: true } },
            },
          });
          for (const po of pendingPos) {
            items.push({
              id: `po-${po.id}`,
              kind: 'procurement',
              at: po.createdAt.toISOString(),
              title: `OC pendiente · ${po.poNumber}`,
              subtitle: po.supplier?.name ?? 'Sin proveedor',
              deepLink: `/erp/procurement?tab=orders&id=${po.id}`,
              icon: '🧾',
              priority: 'normal',
            });
          }
        })(),
      );
    }

    await Promise.all(signalQueries);

    const priorityRank = (p?: string) => (p === 'high' ? 0 : p === 'low' ? 2 : 1);
    items.sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });

    const sliced = items.slice(0, take);
    return { items: sliced, total: sliced.length };
  }

  private kindForCategory(category: string): ActivityFeedItem['kind'] {
    const c = category.toLowerCase();
    if (c.includes('sla') || c === 'activity' || c === 'activities' || c === 'noc') return 'ops';
    if (c.includes('quote') || c === 'crm' || c === 'sales') return 'sales';
    if (c === 'erp' || c.includes('purchase') || c.includes('stock')) return 'procurement';
    return 'notification';
  }

  private iconForCategory(category: string): string {
    const map: Record<string, string> = {
      attendance: '🕐',
      activity: '🧰',
      activities: '✨',
      tool: '🔧',
      finance: '💸',
      noc: '🚨',
      crm: '✨',
      approval: '🛡️',
      evidence: '📸',
      sales: '💼',
      quotes: '📄',
      'sla-alert': '⏱️',
      'sla-breach': '🚨',
      erp: '🧾',
    };
    return map[category] ?? '🔔';
  }

  private deepLinkForAudit(entityType: string, entityId?: number | null): string | undefined {
    if (!entityId) return undefined;
    const t = String(entityType).toLowerCase();
    if (t.includes('activity') || t.includes('actividad')) return `/ops/activities/${entityId}`;
    if (t.includes('client')) return `/crm/clients/${entityId}`;
    if (t.includes('quote') || t.includes('cotizacion')) return `/crm/quotes/${entityId}`;
    if (t.includes('opportunity')) return `/crm/opportunities/${entityId}`;
    if (t.includes('invoice') || t.includes('factura')) return `/erp/invoicing/${entityId}`;
    if (t.includes('purchase') || t.includes('orden')) return `/erp/procurement?tab=orders&id=${entityId}`;
    return undefined;
  }
}
