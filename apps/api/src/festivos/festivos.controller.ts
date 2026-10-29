import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { FestivosService, type FestivoActor } from './festivos.service.js';

/**
 * Días festivos. Ver: cualquiera con asistencia (cada quien sabe qué días no se labora);
 * marcar y quitar: solo dirección, y el servicio lo vuelve a exigir.
 */
@Controller('festivos')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class FestivosController {
  constructor(private readonly service: FestivosService) {}

  /** `?desde&hasta` (AAAA-MM-DD); sin rango, de hoy a doce meses. */
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
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

  /** Para las apps: el festivo de hoy y los próximos, resueltos para quien consulta. */
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @Get('mio')
  mio(@Req() req: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.mio(this.actor(req), companyId);
  }

  /** `{ nombre?, modo, horaEntrada?, horaSalida?, personas?, pagoDoble?, avisar?, nota? }` */
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Put(':fecha')
  guardar(
    @Req() req: any,
    @Param('fecha') fecha: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.guardar(this.actor(req), fecha, body, companyId);
  }

  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Delete(':fecha')
  quitar(@Req() req: any, @Param('fecha') fecha: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.quitar(this.actor(req), fecha, companyId);
  }

  private actor(req: any): FestivoActor {
    const u = req?.user ?? {};
    return { id: Number(u.id), email: u.email ?? null, isSuperAdmin: Boolean(u.isSuperAdmin) };
  }
}
