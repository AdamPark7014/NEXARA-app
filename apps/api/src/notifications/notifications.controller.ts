import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Obtener notificaciones del usuario actual
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    return this.notificationsService.getUserNotifications(user.id, limitNum, offsetNum, companyId);
  }

  /**
   * Obtener notificaciones por categoría
   */
  @Get('category/:category')
  async getByCategory(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('category') category: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.notificationsService.getByCategory(user.id, category, limitNum, companyId);
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  @Get('stats')
  async getStats(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.notificationsService.getStats(user.id, companyId);
  }

  /**
   * Contar notificaciones no leídas
   */
  @Get('count/unread')
  async getUnreadCount(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    const unreadCount = await this.notificationsService.getUnreadCount(user.id, companyId);
    return { unreadCount };
  }

  /**
   * Marcar notificación como leída
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseIntPipe) notificationId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.notificationsService.markAsRead(notificationId, user.id, companyId);
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  @Patch('read/all')
  async markAllAsRead(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.notificationsService.markAllAsRead(user.id, companyId);
  }

  /**
   * Eliminar notificación
   */
  @Delete(':id')
  async deleteNotification(
    @Param('id', ParseIntPipe) notificationId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.notificationsService.deleteNotification(notificationId, user.id, companyId);
  }
}
