import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActivityIssuesService,
  type IncidentSeverity,
  type IncidentType,
  type RecommendationPriority,
  type RecommendationStatus,
  type RecommendationType,
} from './activity-issues.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const VER = { anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] };

/**
 * Reportes agregados. Va **antes** que los controladores con `:id` en el módulo
 * para que `activities/reportes/...` no se interprete como una actividad con id
 * "reportes" y se caiga con un 400.
 */
@Controller('activities/reportes')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityIssuesReportController {
  constructor(private readonly service: ActivityIssuesService) {}

  @Get('incidencias')
  @RBAC(VER)
  incidents(
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.incidentSummary(companyId, { desde, hasta });
  }

  /** Lo que Ingeniería detectó y Ventas todavía no ha convertido. */
  @Get('recomendaciones-abiertas')
  @RBAC(VER)
  pending(@CurrentCompanyId() companyId: number | null) {
    return this.service.pendingRecommendations(companyId);
  }
}

/**
 * Incidencias de un servicio.
 *
 * Registrarlas va con permiso de gestión: una incidencia explica por qué un
 * trabajo tardó o no se cerró, y acaba en el reporte que ve Dirección.
 */
@Controller('activities/:id/incidencias')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityIncidentsController {
  constructor(private readonly service: ActivityIssuesService) {}

  @Get()
  @RBAC(VER)
  list(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listIncidents(activityId, companyId);
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  add(
    @Param('id', ParseIntPipe) activityId: number,
    @Body()
    body: {
      tipo: IncidentType;
      severidad?: IncidentSeverity;
      descripcion: string;
      accionTomada?: string;
      horasPerdidas?: number;
    },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.addIncident(activityId, body, Number(user?.id) || null, companyId);
  }

  @Patch(':incidentId/resolver')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  resolve(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @Body() body: { accionTomada?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.resolveIncident(
      activityId,
      incidentId,
      body ?? {},
      Number(user?.id) || null,
      companyId,
    );
  }

  @Patch(':incidentId/reabrir')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  reopen(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.reopenIncident(activityId, incidentId, companyId);
  }
}

/** Recomendaciones técnicas del servicio: la puerta de Ingeniería a Ventas. */
@Controller('activities/:id/recomendaciones')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityRecommendationsController {
  constructor(private readonly service: ActivityIssuesService) {}

  @Get()
  @RBAC(VER)
  list(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listRecommendations(activityId, companyId);
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  add(
    @Param('id', ParseIntPipe) activityId: number,
    @Body()
    body: {
      tipo: RecommendationType;
      prioridad?: RecommendationPriority;
      descripcion: string;
      costoEstimado?: number;
    },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.addRecommendation(activityId, body, Number(user?.id) || null, companyId);
  }

  @Patch(':recommendationId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  update(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('recommendationId', ParseIntPipe) recommendationId: number,
    @Body()
    body: {
      estado?: RecommendationStatus;
      prioridad?: RecommendationPriority;
      cotizacionId?: number | null;
      costoEstimado?: number | null;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateRecommendation(activityId, recommendationId, body ?? {}, companyId);
  }
}
