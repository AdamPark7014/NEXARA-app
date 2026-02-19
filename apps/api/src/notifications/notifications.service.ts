import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationType } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserNotifications(userId: number, limit: number = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(notificationId: number) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async deleteNotification(notificationId: number) {
    return this.prisma.notification.delete({ where: { id: notificationId } });
  }

  async createNotification(data: {
    userId: number;
    type: NotificationType;
    title: string;
    message: string;
    relatedEntityId?: number;
    entityType?: string;
    relatedUrl?: string;
  }) {
    return this.prisma.notification.create({ data });
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
              title: `Cotización por expirar - ${quote.quoteNumber}`,
              message: `La cotización ${quote.quoteNumber} para ${quote.clientCompany || quote.clientName || 'cliente'} expirará en ${daysUntilExpiry} día(s).`,
              relatedEntityId: quote.id,
              entityType: 'Cotizacion',
              relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
            });
          }

          // Also notify the opportunity owner if available
          for (const sq of quote.salesQuotes) {
            if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
              await this.createNotification({
                userId: sq.opportunity.ownerId,
                type: 'QUOTE_EXPIRING',
                title: `Cotización por expirar - ${quote.quoteNumber}`,
                message: `La cotización ${quote.quoteNumber} expirará en ${daysUntilExpiry} día(s).`,
                relatedEntityId: quote.id,
                entityType: 'Cotizacion',
                relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
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
            title: `Cotización expirada - ${quote.quoteNumber}`,
            message: `La cotización ${quote.quoteNumber} ha expirado y ya no es válida.`,
            relatedEntityId: quote.id,
            entityType: 'Cotizacion',
            relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
          });
        }

        // Notify opportunity owner
        for (const sq of quote.salesQuotes) {
          if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
            await this.createNotification({
              userId: sq.opportunity.ownerId,
              type: 'QUOTE_EXPIRED',
              title: `Cotización expirada - ${quote.quoteNumber}`,
              message: `La cotización ${quote.quoteNumber} ha expirado.`,
              relatedEntityId: quote.id,
              entityType: 'Cotizacion',
              relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
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

      if (quote.createdById) {
        await this.createNotification({
          userId: quote.createdById,
          type: 'QUOTE_SIGNED',
          title: `Cotización firmada - ${quote.quoteNumber}`,
          message: `${clientName} (${signerEmail}) ha firmado la cotización ${quote.quoteNumber}.`,
          relatedEntityId: quote.id,
          entityType: 'Cotizacion',
          relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
        });
      }

      for (const sq of quote.salesQuotes) {
        if (sq.opportunity?.ownerId && sq.opportunity.ownerId !== quote.createdById) {
          await this.createNotification({
            userId: sq.opportunity.ownerId,
            type: 'QUOTE_SIGNED',
            title: `Cotización firmada - ${quote.quoteNumber}`,
            message: `${clientName} ha firmado la cotización ${quote.quoteNumber}.`,
            relatedEntityId: quote.id,
            entityType: 'Cotizacion',
            relatedUrl: `/panel/ventas/cotizaciones/${quote.id}`,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error notifying quote signed:', error);
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
          title: `Nueva orden creada - ${orderId}`,
          message: `Se ha creado la orden ${orderId} para el proyecto "${order.project.name}".`,
          relatedEntityId: projectId,
          entityType: 'SalesProject',
          relatedUrl: `/panel/ventas/proyectos/${projectId}`,
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
        title: 'Viático aprobado',
        message: `Tu viático de $${amount.toLocaleString('es-MX')} ha sido aprobado.`,
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/panel/viaticos/${viaticId}`,
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
        title: 'Viático rechazado',
        message: reason || 'Tu viático ha sido rechazado. Contacta a tu supervisor para más información.',
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/panel/viaticos/${viaticId}`,
      });
    } catch (error) {
      this.logger.error('Error notifying viatico rejected:', error);
    }
  }
}
