import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { PERMISSIONS } from '../common/permissions.js';

export type ActivityFeedItem = {
  id: string;
  kind: 'notification' | 'audit' | 'sales';
  at: string;
  title: string;
  subtitle?: string;
  actorName?: string;
  deepLink?: string;
  icon: string;
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

    const notifications = await this.prisma.notification.findMany({
      where: { userId, ...scope },
      orderBy: { createdAt: 'desc' },
      take: take,
      include: {
        triggerUser: { select: { nombre: true } },
      },
    });

    const items: ActivityFeedItem[] = notifications.map((n) => ({
      id: `notif-${n.id}`,
      kind: 'notification' as const,
      at: n.createdAt.toISOString(),
      title: n.title,
      subtitle: n.message,
      actorName: n.triggerUser?.nombre,
      deepLink: n.relatedUrl ?? undefined,
      icon: this.iconForCategory(n.category),
    }));

    const canAudit = permissions.includes(PERMISSIONS.AUDIT_VIEW);
    const canSalesAudit =
      permissions.includes(PERMISSIONS.SALES_AUDIT_VIEW) ||
      permissions.includes(PERMISSIONS.SALES_VIEW);

    if (canAudit || canSalesAudit) {
      const auditWhere: Record<string, unknown> = { ...scope };
      if (!canAudit && canSalesAudit) {
        auditWhere.source = 'sales';
      }

      const audits = await this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        take: Math.min(25, take),
        include: {
          user: { select: { nombre: true } },
        },
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
        });
      }
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const sliced = items.slice(0, take);

    return { items: sliced, total: sliced.length };
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
    return undefined;
  }
}
