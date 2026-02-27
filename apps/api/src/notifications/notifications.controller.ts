import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { NotificationFiltersDto } from './dto/notifications.dto.js';

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
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: string,
    @Query('isRead') isRead?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    const isReadBool = isRead ? isRead === 'true' : undefined;

    const filters: NotificationFiltersDto = {
      limit: limitNum,
      offset: offsetNum,
      category,
      isRead: isReadBool,
    };

    return this.notificationsService.getUserNotifications(user.id, limitNum, offsetNum);
  }

  /**
   * Obtener notificaciones por categoría
   */
  @Get('category/:category')
  async getByCategory(
    @CurrentUser() user: any,
    @Param('category') category: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.notificationsService.getByCategory(user.id, category, limitNum);
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.notificationsService.getStats(user.id);
  }

  /**
   * Contar notificaciones no leídas
   */
  @Get('count/unread')
  async getUnreadCount(@CurrentUser() user: any) {
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    return { unreadCount };
  }

  /**
   * Marcar notificación como leída
   */
  @Patch(':id/read')
  async markAsRead(@Param('id', ParseIntPipe) notificationId: number) {
    return this.notificationsService.markAsRead(notificationId);
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  @Patch('read/all')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  /**
   * Eliminar notificación
   */
  @Delete(':id')
  async deleteNotification(@Param('id', ParseIntPipe) notificationId: number) {
    return this.notificationsService.deleteNotification(notificationId);
  }
}

