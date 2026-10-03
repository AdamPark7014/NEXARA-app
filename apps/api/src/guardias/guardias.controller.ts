import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { GuardiasService, type GuardiaActor } from './guardias.service.js';

/**
 * Guardias de fin de semana. Ver: cualquiera con asistencia (cada quien lo de su alcance);
 * programar y quitar: quien gestiona asistencia o actividades, y el servicio vuelve a exigir
 * que la persona sea de su equipo.
 */
@Controller('guardias')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class GuardiasController {
  constructor(private readonly service: GuardiasService) {}

  /** `?desde&hasta` (AAAA-MM-DD); sin rango, las próximas cuatro semanas. */
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @Get()
  listar(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.listar(this.actor(req), { desde, hasta }, companyId);
  }

  /** `?fecha=AAAA-MM-DD&userIds=1,2`: quiénes tienen guardia ese día (aviso al asignar actividad). */
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @Get('cobertura')
  cobertura(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('fecha') fecha?: string,
    @Query('userIds') userIds?: string,
  ) {
    return this.service.cobertura(this.actor(req), { fecha, userIds }, companyId);
  }

  /** `{ userId, fecha: AAAA-MM-DD (sábado o domingo), nota? }` */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Post()
  programar(
    @Req() req: any,
    @Body() body: { userId?: number; fecha?: string; nota?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.programar(this.actor(req), body, companyId);
  }

  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Delete(':id')
  quitar(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.quitar(this.actor(req), id, companyId);
  }

  private actor(req: any): GuardiaActor {
    const u = req?.user ?? {};
    return {
      id: Number(u.id),
      email: u.email ?? null,
      roleKey: u.roleKey ?? null,
      isSuperAdmin: Boolean(u.isSuperAdmin),
    };
  }
}
