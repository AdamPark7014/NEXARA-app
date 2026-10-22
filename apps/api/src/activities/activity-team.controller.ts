import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActivityTeamService, type AssigneeRole } from './activity-team.service.js';
import { ActivityNonComplianceService } from './activity-non-compliance.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

/**
 * Equipo, reasignaciones y material de una actividad.
 *
 * Consultar el equipo o el material va con permiso de lectura de actividades;
 * modificarlo exige gestión, porque cambia a quién se le imputan horas y
 * viáticos.
 */
@Controller('activities/:id/team')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityTeamController {
  constructor(private readonly service: ActivityTeamService) {}

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  list(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
    @Query('incluirRetirados') incluirRetirados?: string,
  ) {
    return this.service.listTeam(activityId, companyId, incluirRetirados === 'true');
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  async add(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { userId: number; rol?: AssigneeRole; horasPlan?: number; indicaciones?: string },
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
  ) {
    await this.service.assertPuedeAsignar(
      {
        id: Number(user?.id),
        email: user?.email ?? null,
        roleKey: user?.roleKey ?? null,
        isSuperAdmin: Boolean(user?.isSuperAdmin),
      },
      activityId,
      Number(body?.userId),
      companyId,
    );
    return this.service.addMember(activityId, body, companyId, Number(user?.id) || null);
  }

  @Delete(':userId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  remove(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.removeMember(activityId, userId, companyId);
  }

  @Patch(':userId/horas')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  setHours(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { horasReales: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.setActualHours(activityId, userId, Number(body?.horasReales), companyId);
  }
}

@Controller('activities/:id')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityReassignController {
  constructor(
    private readonly service: ActivityTeamService,
    private readonly incumplimientos: ActivityNonComplianceService,
  ) {}

  /**
   * Registrar que no se cumplió, con causa y observaciones (mín. 10). Mismo guard amplio que
   * cancelar: quién puede (superiores de quien la ejecuta) lo decide el servicio.
   */
  @Post('no-cumplida')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  noCumplida(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { causa?: string; observaciones?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.incumplimientos.registrar(
      activityId,
      body ?? {},
      { id: Number(user?.id), email: user?.email ?? null },
      companyId,
    );
  }

  /** Reabrir una actividad no cumplida con fecha nueva y motivo. El incumplimiento queda registrado. */
  @Post('reprogramar')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  reprogramar(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { fecha?: string; motivo?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.incumplimientos.reprogramar(
      activityId,
      body ?? {},
      { id: Number(user?.id), email: user?.email ?? null },
      companyId,
    );
  }

  @Get('incumplimientos')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  incumplimientosDe(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.incumplimientos.historial(activityId, companyId);
  }

  /**
   * «Pasar a otro compañero» con motivo. Guard amplio a propósito: un encargado sin
   * ACTIVITIES_MANAGE también es superior; la regla la aplica el servicio.
   */
  @Post('reasignar')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  reassign(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { aUsuarioId: number; deUsuarioId?: number; motivo?: string; retirarAnterior?: boolean },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.reassign(
      activityId,
      body,
      { id: Number(user?.id), email: user?.email ?? null },
      companyId,
    );
  }

  /** Acciones de superior disponibles para quien consulta: cancelar y a quién puede reemplazar. */
  @Get('acciones')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  acciones(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.superiorActions(activityId, { id: Number(user?.id), email: user?.email ?? null }, companyId);
  }

  @Get('reasignaciones')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  history(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listReassignments(activityId, companyId);
  }

  @Get('materiales')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  materials(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listMaterials(activityId, companyId);
  }

  @Get('timeline')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  timeline(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.buildTimeline(activityId, companyId);
  }
}
