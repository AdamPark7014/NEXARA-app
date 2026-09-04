import { Injectable, Logger, Inject, Optional, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationType } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PERMISSIONS } from '../common/permissions.js';
import { PushDispatchService } from '../devices/push-dispatch.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { getRequestCompanyId } from '../common/tenant/tenant-context.js';

export interface INotificationPayload {
  userId: number;
  /** Incluye valores de enum nuevos antes de `prisma generate` en CI / Windows con EPERM. */
  type: NotificationType | string;
  category: string;
  title: string;
  message: string;
  triggerUserId?: number;
  relatedEntityId?: number;
  entityType?: string;
  relatedUrl?: string;
  priority?: 'high' | 'normal' | 'low';
  companyId?: number | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly protectedSalesEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushDispatch: PushDispatchService,
    @Optional() @Inject('NOTIFICATIONS_GATEWAY') private readonly gateway?: any,
  ) {}

  /**
   * Inbox: hard-scope ocultaba filas legacy con companyId null (casi todas
   * las creadas vía hierarchy/cron sin stamp). Soft = tenant activo + null.
   */
  private inboxScope(companyId?: number | null) {
    return companyWhere(companyId ?? null, 'soft');
  }

  async getUserNotifications(
    userId: number,
    limit: number = 50,
    offset: number = 0,
    companyId?: number | null,
  ) {
    return this.prisma.notification.findMany({
      where: { userId, ...this.inboxScope(companyId) },
      include: {
        triggerUser: {
          select: {
            id: true,
            nombre: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });
  }

  private isSalesAdminUser(user?: any) {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    return Boolean(user?.isSuperAdmin) || permissions.includes(PERMISSIONS.CONSOLE_ADMIN);
  }

  private async getSellerUserIds(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const sellers = await this.prisma.user.findMany({
      where: {
        role: { accesoPanelVentas: true },
        NOT: { role: { accesoConsoleAdmin: true } },
        email: { notIn: this.protectedSalesEmails },
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true },
    });
    return sellers.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0);
  }

  async getSalesPanelNotifications(
    user: any,
    limit: number = 50,
    offset: number = 0,
    companyId?: number | null,
  ) {
    const userId = Number(user?.id || 0);
    if (!userId) return [];

    const sellerIds = await this.getSellerUserIds(companyId);
    if (!sellerIds.length) return [];

    const isSalesAdmin = this.isSalesAdminUser(user);
    if (!isSalesAdmin && !sellerIds.includes(userId)) {
      return [];
    }

    return this.prisma.notification.findMany({
      where: {
        ...(isSalesAdmin ? { userId: { in: sellerIds } } : { userId }),
        NOT: { category: 'security' },
        ...this.inboxScope(companyId),
      },
      include: {
        triggerUser: {
          select: {
            id: true,
            nombre: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });
  }

  private async assertSalesNotificationAccess(
    user: any,
    notificationId: number,
    companyId?: number | null,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, ...this.inboxScope(companyId) },
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (
      notification.companyId != null &&
      companyId != null &&
      Number(notification.companyId) !== Number(companyId)
    ) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const userId = Number(user?.id || 0);
    const sellerIds = await this.getSellerUserIds(companyId);
    const isSalesAdmin = this.isSalesAdminUser(user);

    if (isSalesAdmin) {
      if (!sellerIds.includes(notification.userId)) {
        throw new ForbiddenException('No puedes gestionar esta notificación de ventas');
      }
      return notification;
    }

    if (notification.userId !== userId || !sellerIds.includes(userId)) {
      throw new ForbiddenException('No puedes gestionar esta notificación de ventas');
    }

    return notification;
  }

  async markSalesNotificationAsRead(user: any, notificationId: number, companyId?: number | null) {
    await this.assertSalesNotificationAccess(user, notificationId, companyId);

    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
      include: { triggerUser: true },
    });

    this.gateway?.notifyUser(notification.userId, {
      event: 'notification:read',
      notificationId,
    });

    return notification;
  }

  async markAllSalesNotificationsAsRead(user: any, companyId?: number | null) {
    const userId = Number(user?.id || 0);
    if (!userId) return { updatedCount: 0 };

    const sellerIds = await this.getSellerUserIds(companyId);
    if (!sellerIds.length) return { updatedCount: 0 };

    const isSalesAdmin = this.isSalesAdminUser(user);
    if (!isSalesAdmin && !sellerIds.includes(userId)) {
      return { updatedCount: 0 };
    }

    const targetUserIds = isSalesAdmin ? sellerIds : [userId];

    const result = await this.prisma.notification.updateMany({
      where: {
        userId: { in: targetUserIds },
        isRead: false,
        ...this.inboxScope(companyId),
      },
      data: { isRead: true, readAt: new Date() },
    });

    targetUserIds.forEach((targetUserId) => {
      this.gateway?.notifyUser(targetUserId, {
        event: 'notifications:read-all',
      });
    });

    return { updatedCount: result.count };
  }

  async deleteSalesNotification(user: any, notificationId: number, companyId?: number | null) {
    await this.assertSalesNotificationAccess(user, notificationId, companyId);
    return this.prisma.notification.delete({ where: { id: notificationId } });
  }

  async getUnreadCount(userId: number, companyId?: number | null) {
    return this.prisma.notification.count({
      where: { userId, isRead: false, ...companyWhere(companyId ?? null) },
    });
  }

  async markAsRead(notificationId: number, userId: number, companyId?: number | null) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Notificación');

    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
      include: { triggerUser: true },
    });

    this.gateway?.notifyUser(notification.userId, {
      event: 'notification:read',
      notificationId,
    });

    return notification;
  }

  async markAllAsRead(userId: number, companyId?: number | null) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false, ...companyWhere(companyId ?? null) },
      data: { isRead: true, readAt: new Date() },
    });

    this.gateway?.notifyUser(userId, {
      event: 'notifications:read-all',
    });
  }

  async deleteNotification(notificationId: number, userId: number, companyId?: number | null) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Notificación');
    return this.prisma.notification.delete({ where: { id: notificationId } });
  }

  /**
   * Crear notificación individual con opciones completas
   */
  async createNotification(payload: INotificationPayload) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          category: payload.category || 'general',
          title: payload.title,
          message: payload.message,
          triggerUserId: payload.triggerUserId,
          relatedEntityId: payload.relatedEntityId,
          entityType: payload.entityType,
          relatedUrl: payload.relatedUrl,
          priority: payload.priority || 'normal',
          companyId: payload.companyId ?? undefined,
        },
        include: {
          triggerUser: {
            select: {
              id: true,
              nombre: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Emitir en tiempo real
      if (this.gateway) {
        this.gateway.notifyUser(payload.userId, {
          event: 'notification:new',
          notification,
        });
      }

      void this.pushDispatch
        .sendToUser(payload.userId, {
          title: payload.title,
          body: payload.message,
          relatedUrl: payload.relatedUrl,
          priority: payload.priority || 'normal',
          notificationId: notification.id,
          tag: `nexara-${notification.id}`,
        })
        .catch((err) => this.logger.warn(`Push dispatch: ${err instanceof Error ? err.message : err}`));

      return notification;
    } catch (error) {
      this.logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Crear notificación para múltiples usuarios (uso jerárquico)
   */
  async createBulkNotifications(payloads: INotificationPayload[]) {
    const notifications = await Promise.all(
      payloads.map(payload => this.createNotification(payload)),
    );
    return notifications;
  }

  /**
   * Obtener notificaciones por categoría
   */
  async getByCategory(
    userId: number,
    category: string,
    limit: number = 20,
    companyId?: number | null,
  ) {
    return this.prisma.notification.findMany({
      where: { userId, category, ...companyWhere(companyId ?? null) },
      include: {
        triggerUser: {
          select: {
            id: true,
            nombre: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  async getStats(userId: number, companyId?: number | null) {
    const scope = companyWhere(companyId ?? null);
    const total = await this.prisma.notification.count({
      where: { userId, ...scope },
    });

    const unread = await this.prisma.notification.count({
      where: { userId, isRead: false, ...scope },
    });

    const byCategory = await this.prisma.notification.groupBy({
      by: ['category'],
      where: { userId, ...scope },
      _count: { id: true },
    });

    return {
      total,
      unread,
      read: total - unread,
      readRate: total > 0 ? (((total - unread) / total) * 100).toFixed(1) : '0',
      byCategory: byCategory.map(cat => ({
        category: cat.category,
        count: cat._count.id,
      })),
    };
  }

  // ==================== AUTOMATED TASKS ====================

  /**
   * Check for expiring quotes every hour
   * Notifies salespeople when quotes are expiring soon (within 3 days)
   */
  @Cron('0 * * * *') // Every hour
  async checkQuoteExpiration() {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Find quotes expiring within 3 days that haven't been signed
      const expiringQuotes = await this.prisma.cotizacion.findMany({
        where: {
          validUntil: {
            gte: now,
            lte: threeDaysFromNow,
          },
          status: 'SENT', // Not yet signed
        },
        include: {
          createdBy: true,
          salesQuotes: {
            include: { opportunity: { include: { owner: true } } },
          },
        },
      });

      for (const quote of expiringQuotes) {
        const daysUntilExpiry = Math.ceil(
          (quote.validUntil!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
          // Notify the creator
          if (quote.createdById) {
            await this.createNotification({
              userId: quote.createdById,
              type: 'QUOTE_EXPIRING',
              category: 'quotes',
              title: `Cotización por expirar - ${quote.quoteNumber}`,
              message: `La cotización ${quote.quoteNumber} para ${quote.clientCompany || quote.clientName || 'cliente'} expirará en ${daysUntilExpiry} día(s).`,
              relatedEntityId: quote.id,
              entityType: 'Cotizacion',
              relatedUrl: `/crm/quotes/${quote.id}`,
            });
          }

          // Also notify the opportunity owner if available
          for (const sq of quote.salesQuotes) {
            if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
              await this.createNotification({
                userId: sq.opportunity.ownerId,
                type: 'QUOTE_EXPIRING',
                category: 'quotes',
                title: `Cotización por expirar - ${quote.quoteNumber}`,
                message: `La cotización ${quote.quoteNumber} expirará en ${daysUntilExpiry} día(s).`,
                relatedEntityId: quote.id,
                entityType: 'Cotizacion',
                relatedUrl: `/crm/quotes/${quote.id}`,
              });
            }
          }
        }
      }

      this.logger.debug(`Checked ${expiringQuotes.length} expiring quotes`);
    } catch (error) {
      this.logger.error('Error checking quote expiration:', error);
    }
  }

  /**
   * Check for expired quotes every 30 minutes
   */
  @Cron('0 */30 * * * *') // Every 30 minutes
  async checkExpiredQuotes() {
    try {
      const now = new Date();

      // Find quotes that have expired and not been signed
      const expiredQuotes = await this.prisma.cotizacion.findMany({
        where: {
          validUntil: {
            lt: now,
          },
          status: { not: 'APPROVED' },
        },
        include: {
          createdBy: true,
          salesQuotes: {
            include: { opportunity: { include: { owner: true } } },
          },
        },
      });

      for (const quote of expiredQuotes) {
        // Check if we already notified (don't send duplicate)
        const alreadyNotified = await this.prisma.notification.findFirst({
          where: {
            relatedEntityId: quote.id,
            type: 'QUOTE_EXPIRED',
            entityType: 'Cotizacion',
          },
        });

        if (alreadyNotified) continue;

        // Notify creator
        if (quote.createdById) {
          await this.createNotification({
            userId: quote.createdById,
            type: 'QUOTE_EXPIRED',
            category: 'quotes',
            title: `Cotización expirada - ${quote.quoteNumber}`,
            message: `La cotización ${quote.quoteNumber} ha expirado y ya no es válida.`,
            relatedEntityId: quote.id,
            entityType: 'Cotizacion',
            relatedUrl: `/crm/quotes/${quote.id}`,
          });
        }

        // Notify opportunity owner
        for (const sq of quote.salesQuotes) {
          if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
            await this.createNotification({
              userId: sq.opportunity.ownerId,
              type: 'QUOTE_EXPIRED',
              category: 'quotes',
              title: `Cotización expirada - ${quote.quoteNumber}`,
              message: `La cotización ${quote.quoteNumber} ha expirado.`,
              relatedEntityId: quote.id,
              entityType: 'Cotizacion',
              relatedUrl: `/crm/quotes/${quote.id}`,
            });
          }
        }
      }

      this.logger.debug(`Checked ${expiredQuotes.length} expired quotes`);
    } catch (error) {
      this.logger.error('Error checking expired quotes:', error);
    }
  }

  /**
   * Notification helper for quote signing
   */
  async notifyQuoteSigned(quoteId: number, clientName: string, signerEmail: string) {
    try {
      const quote = await this.prisma.cotizacion.findUnique({
        where: { id: quoteId },
        include: {
          createdBy: true,
          salesQuotes: {
            include: { opportunity: { include: { owner: true } } },
          },
        },
      });

      if (!quote) return;

      const linkedOpportunityId = quote.salesQuotes[0]?.opportunityId;
      const quoteUrl = linkedOpportunityId
        ? `/crm/opportunities/${linkedOpportunityId}/quotes`
        : `/crm/quotes/${quote.id}`;

      if (quote.createdById) {
        await this.createNotification({
          userId: quote.createdById,
          type: 'QUOTE_SIGNED',
          category: 'quotes',
          title: `Cotización firmada - ${quote.quoteNumber}`,
          message: `${clientName} (${signerEmail}) ha firmado la cotización ${quote.quoteNumber}.`,
          relatedEntityId: quote.id,
          entityType: 'Cotizacion',
          relatedUrl: quoteUrl,
        });
      }

      for (const sq of quote.salesQuotes) {
        if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
          await this.createNotification({
            userId: sq.opportunity.ownerId,
            type: 'QUOTE_SIGNED',
            category: 'quotes',
            title: `Cotización firmada - ${quote.quoteNumber}`,
            message: `${clientName} ha firmado la cotización ${quote.quoteNumber}.`,
            relatedEntityId: quote.id,
            entityType: 'Cotizacion',
            relatedUrl: `/crm/opportunities/${sq.opportunityId}/quotes`,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error notifying quote signed:', error);
    }
  }

  async notifyCtOrderDraftReady(quoteId: number, quoteNumber: string) {
    try {
      const quote = await this.prisma.cotizacion.findUnique({
        where: { id: quoteId },
        select: { createdById: true },
      });
      if (!quote?.createdById) return;
      await this.createNotification({
        userId: quote.createdById,
        type: 'CT_ORDER_DRAFT',
        category: 'quotes',
        title: `Pedido CT — ${quoteNumber}`,
        message:
          'El cliente aprobó la cotización. Revisa el borrador de pedido a CT Online y confirma envío.',
        relatedEntityId: quoteId,
        entityType: 'Cotizacion',
        relatedUrl: `/crm/quotes/${quoteId}`,
      });
    } catch (error) {
      this.logger.error('Error notifying CT draft:', error);
    }
  }

  /**
   * Notification helper for order creation
   */
  async notifyOrderCreated(projectId: number, orderId: string) {
    try {
      const order = await this.prisma.salesProjectOrder.findFirst({
        where: { projectId },
        include: {
          project: {
            include: {
              opportunity: { include: { owner: true } },
            },
          },
          createdBy: true,
        },
      });

      if (!order || !order.project.opportunity) return;

      const ownerId = order.project.opportunity.ownerId;

      if (ownerId) {
        await this.createNotification({
          userId: ownerId,
          type: 'ORDER_CREATED',
          category: 'orders',
          title: `Nueva orden creada - ${orderId}`,
          message: `Se ha creado la orden ${orderId} para el proyecto "${order.project.name}".`,
          relatedEntityId: projectId,
          entityType: 'SalesProject',
          relatedUrl: `/crm/projects/${projectId}`,
        });
      }
    } catch (error) {
      this.logger.error('Error notifying order created:', error);
    }
  }

  /**
   * Notification helper for viatico approval
   */
  async notifyViaticApproved(viaticId: number, userName: string, amount: number) {
    try {
      const viatico = await this.prisma.viatico.findUnique({
        where: { id: viaticId },
        include: { User: true },
      });

      if (!viatico) return;

      // Notify the user whose viatico was approved
      await this.createNotification({
        userId: viatico.usuarioId,
        type: 'VIATICO_APPROVED',
        category: 'viatics',
        title: 'Viático aprobado',
        message: `Tu viático de $${amount.toLocaleString('es-MX')} ha sido aprobado.`,
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/erp/finance/viatics?highlight=${viaticId}`,
      });
    } catch (error) {
      this.logger.error('Error notifying viatico approved:', error);
    }
  }

  /**
   * Notification helper for viatico rejection
   */
  async notifyViaticRejected(viaticId: number, reason?: string) {
    try {
      const viatico = await this.prisma.viatico.findUnique({
        where: { id: viaticId },
        include: { User: true },
      });

      if (!viatico) return;

      await this.createNotification({
        userId: viatico.usuarioId,
        type: 'VIATICO_REJECTED',
        category: 'viatics',
        title: 'Viático rechazado',
        message: reason || 'Tu viático ha sido rechazado. Contacta a tu supervisor para más información.',
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/erp/finance/viatics?highlight=${viaticId}`,
      });
    } catch (error) {
      this.logger.error('Error notifying viatico rejected:', error);
    }
  }
}
