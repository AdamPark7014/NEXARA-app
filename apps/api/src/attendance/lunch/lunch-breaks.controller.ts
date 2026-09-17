import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { RbacGuard, RBAC } from '../../common/rbac.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { LunchBreaksService, type LunchViewer } from './lunch-breaks.service.js';
import { CreateLunchBreakDto, RevisarComidaDto, UpdateLunchBreakDto } from './dto/lunch-break.dto.js';
import { isCeoEquivalentEmail } from '../../common/platform-accounts.js';

/** Christian supervisa: no registra hora de comida. */
const esCeo = (user: any) => isCeoEquivalentEmail(user?.email);

@Controller('lunch-breaks')
@UseGuards(RbacGuard)
export class LunchBreaksController {
  constructor(private readonly lunchBreaksService: LunchBreaksService) {}

  // Root endpoint: admins ven todo, usuarios ven sus propios registros
  @Get()
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async getLunchBreaks(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Las cadenas viajan sin convertir: el servicio las interpreta como días
    // de México. `new Date('2026-09-06')` aquí era medianoche UTC, y el rango
    // salía corrido seis horas.
    const start = startDate || undefined;
    const end = endDate || undefined;
    if (user.isSuperAdmin || user.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE)) {
      return this.lunchBreaksService.getAllLunchBreaks(start, end, companyId);
    }
    return this.lunchBreaksService.getUserLunchBreaks(user.id, start, end, companyId);
  }

  // Registrar entrada a comida (solo usuarios no admin, todos excepto superadmin)
  @Post('checkin')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async checkin(
    @CurrentUser() user: any,
    @Body() data: CreateLunchBreakDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (user.isSuperAdmin) {
      throw new UnauthorizedException('Super admins no pueden registrar hora de comida');
    }
    if (esCeo(user)) {
      throw new ForbiddenException('Dirección supervisa las comidas: no registra la suya');
    }
    return this.lunchBreaksService.createCheckin(user.id, data, companyId);
  }

  // Registrar salida de comida (solo usuarios no admin)
  @Put('checkout')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async checkout(
    @CurrentUser() user: any,
    @Body() data: UpdateLunchBreakDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (user.isSuperAdmin) {
      throw new UnauthorizedException('Super admins no pueden registrar hora de comida');
    }
    if (esCeo(user)) {
      throw new ForbiddenException('Dirección supervisa las comidas: no registra la suya');
    }
    return this.lunchBreaksService.createCheckout(user.id, data, companyId);
  }

  /** Mi comida de hoy: qué sigue, si ya es a destiempo y mi registro. */
  @Get('mi-dia')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  miDia(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.lunchBreaksService.miDia(this.viewer(user), companyId);
  }

  /** Comidas de mi gente (Christian: todos; jefes: su organigrama) y quién puede aprobarlas. */
  @Get('equipo')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  equipo(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('fecha') fecha?: string,
  ) {
    return this.lunchBreaksService.equipo(this.viewer(user), fecha || undefined, companyId);
  }

  /** Aprobar o rechazar la justificación de una comida a destiempo. */
  @Patch(':id/revision')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  revisar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevisarComidaDto,
  ) {
    return this.lunchBreaksService.revisar(this.viewer(user), id, dto, companyId);
  }

  private viewer(user: any): LunchViewer {
    return {
      id: Number(user.id),
      email: user.email ?? null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      roleKey: user.roleKey ?? null,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    };
  }

  // Obtener horas de comida del usuario (solo usuarios)
  @Get('my-breaks')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_VIEW] })
  async getMyLunchBreaks(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.lunchBreaksService.getUserLunchBreaks(
      user.id,
      startDate || undefined,
      endDate || undefined,
      companyId,
    );
  }

  // Obtener horas de comida de usuarios normales (admins pueden ver)
  @Get('users')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  async getUsersLunchBreaks(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Admins ven usuarios normales, SuperAdmin ve todo
    return this.lunchBreaksService.getAllLunchBreaks(
      startDate || undefined,
      endDate || undefined,
      companyId,
    );
  }

  // Obtener horas de comida de hoy (para notificaciones en tiempo real)
  @Get('today')
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  async getTodayLunchBreaks(@CurrentCompanyId() companyId: number | null) {
    return this.lunchBreaksService.getTodayLunchBreaks(companyId);
  }
}
