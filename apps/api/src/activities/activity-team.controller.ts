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
  add(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { userId: number; rol?: AssigneeRole; horasPlan?: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.addMember(activityId, body, companyId);
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
  constructor(private readonly service: ActivityTeamService) {}

  @Post('reasignar')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  reassign(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: { aUsuarioId: number; motivo?: string; retirarAnterior?: boolean },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.reassign(activityId, body, Number(user?.id), companyId);
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
