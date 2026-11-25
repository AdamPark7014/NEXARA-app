import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { workDateKey } from '../../common/time/workday.js';
import { HorarioService } from './horario.service.js';

@Controller('attendance/horarios')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class HorarioController {
  constructor(private readonly horario: HorarioService) {}

  private actor(req: any) {
    const u = req?.user ?? {};
    return {
      id: Number(u.id ?? u.userId ?? 0),
      email: u.email ?? null,
      roleKey: u.roleKey ?? u.role?.key ?? null,
      isSuperAdmin: !!u.isSuperAdmin,
      permissions: u.permissions ?? null,
      nombre: u.nombre ?? u.name ?? null,
    };
  }

  /** GET /api/attendance/horarios?from&to&userIds=1,2 */
  @Get()
  listar(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userIds') userIds?: string,
  ) {
    const ids = (userIds ?? '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const hoy = workDateKey(new Date());
    return this.horario.listar(
      this.actor(req),
      { from: (from ?? hoy).slice(0, 10), to: (to ?? from ?? hoy).slice(0, 10), userIds: ids.length ? ids : undefined },
      companyId,
    );
  }

  /** GET /api/attendance/horarios/mio?from&to — cualquiera, solo lo suyo. */
  @Get('mio')
  mio(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const hoy = workDateKey(new Date());
    const desde = (from ?? hoy).slice(0, 10);
    return this.horario.mio(this.actor(req), { from: desde, to: (to ?? desde).slice(0, 10) }, companyId);
  }

  /** POST /api/attendance/horarios/quitar { userId, fecha } — vuelve al horario de siempre. */
  @Post('quitar')
  quitar(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.quitar(this.actor(req), body ?? {}, companyId);
  }

  /** GET /api/attendance/horarios/de?userId&fecha — resuelve horarioDe */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_VIEW] })
  @Get('de')
  async de(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId?: string,
    @Query('fecha') fecha?: string,
  ) {
    const uid = Number(userId ?? this.actor(req).id);
    const f = (fecha ?? workDateKey(new Date())).slice(0, 10);
    const horario = await this.horario.horarioVisible(this.actor(req), uid, f, companyId);
    return { userId: uid, fecha: f, horario };
  }

  /** POST /api/attendance/horarios/programar */
  @Post('programar')
  programar(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.programar(this.actor(req), body ?? {}, companyId);
  }

  /** POST /api/attendance/horarios/extender { userId, fecha, hasta, motivo? } */
  @Post('extender')
  extender(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.extenderORecortar(this.actor(req), { ...(body ?? {}), tipo: 'extender' }, companyId);
  }

  /** POST /api/attendance/horarios/recortar { userId, fecha, hasta, motivo? } */
  @Post('recortar')
  recortar(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.extenderORecortar(this.actor(req), { ...(body ?? {}), tipo: 'recortar' }, companyId);
  }

  /** GET /api/attendance/horarios/plantillas */
  @Get('plantillas')
  plantillas(@CurrentCompanyId() companyId: number | null) {
    return this.horario.plantillas(companyId);
  }

  /** GET /api/attendance/horarios/parametros?fecha */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_VIEW] })
  @Get('parametros')
  parametros(@CurrentCompanyId() companyId: number | null, @Query('fecha') fecha?: string) {
    return this.horario.parametros(companyId, fecha);
  }

  /** POST /api/attendance/horarios/parametros — nueva vigencia */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_MANAGE] })
  @Post('parametros')
  guardarParametros(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.guardarParametros(this.actor(req), body ?? {}, companyId);
  }

  /** POST /api/attendance/horarios/resumen — resumenJornada + productividad (para UI/KPIs) */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_VIEW] })
  @Post('resumen')
  resumen(@Req() req: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    return this.horario.resumenYProductividad(this.actor(req), body ?? {}, companyId);
  }
}
