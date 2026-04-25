import { Controller, Get, Post, Put, Body, UseGuards, UnauthorizedException, Query } from '@nestjs/common';
import { RbacGuard, RBAC } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { LunchBreaksService } from './lunch-breaks.service.js';
import { CreateLunchBreakDto, UpdateLunchBreakDto } from './dto/lunch-break.dto.js';

@Controller('lunch-breaks')
@UseGuards(RbacGuard)
export class LunchBreaksController {
  constructor(private readonly lunchBreaksService: LunchBreaksService) {}

  // Root endpoint: admins ven todo, usuarios ven sus propios registros
  @Get()
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async getLunchBreaks(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    if (user.isSuperAdmin || user.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE)) {
      return this.lunchBreaksService.getAllLunchBreaks(start, end);
    }
    return this.lunchBreaksService.getUserLunchBreaks(user.id, start, end);
  }

  // Registrar entrada a comida (solo usuarios no admin, todos excepto superadmin)
  @Post('checkin')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async checkin(@CurrentUser() user: any, @Body() data: CreateLunchBreakDto) {
    if (user.isSuperAdmin) {
      throw new UnauthorizedException('Super admins no pueden registrar hora de comida');
    }
    return this.lunchBreaksService.createCheckin(user.id, data);
  }

  // Registrar salida de comida (solo usuarios no admin)
  @Put('checkout')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async checkout(@CurrentUser() user: any, @Body() data: UpdateLunchBreakDto) {
    if (user.isSuperAdmin) {
      throw new UnauthorizedException('Super admins no pueden registrar hora de comida');
    }
    return this.lunchBreaksService.createCheckout(user.id, data);
  }

  // Obtener horas de comida del usuario (solo usuarios)
  @Get('my-breaks')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async getMyLunchBreaks(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.lunchBreaksService.getUserLunchBreaks(
      user.id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // Obtener horas de comida de usuarios normales (admins pueden ver)
  @Get('users')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  async getUsersLunchBreaks(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Admins ven usuarios normales, SuperAdmin ve todo
    return this.lunchBreaksService.getAllLunchBreaks(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // Obtener horas de comida de hoy (para notificaciones en tiempo real)
  @Get('today')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  async getTodayLunchBreaks() {
    return this.lunchBreaksService.getTodayLunchBreaks();
  }
}
