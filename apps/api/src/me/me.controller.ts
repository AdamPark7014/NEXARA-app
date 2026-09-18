import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { MeService } from './me.service.js';
import {
  MyActivitiesService,
  type DispatchMyActivityDto,
  type ReorderMyActivitiesDto,
  type ReprogramarDespachoDto,
  type RevisarEvidenciaDto,
} from './my-activities.service.js';
import { TeamBoardService } from './team-board.service.js';

@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly teamBoard: TeamBoardService,
    private readonly myActivities: MyActivitiesService,
  ) {}

  /** Mis actividades: cola personal (todos menos el CEO). */
  @Get('activities')
  activities(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.list({ id: Number(user.id), email: user.email ?? null }, companyId);
  }

  /** Encargados de área: reordenan su cola con justificación obligatoria. */
  @Patch('activities/order')
  reorderActivities(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: ReorderMyActivitiesDto,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.reorder(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      body,
    );
  }

  /** Encargados de área: auto-asignarse una actividad (responsable = uno mismo). */
  @Post('activities')
  createMyActivity(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CreateActivityDto,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.selfCreate(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      body,
    );
  }

  /**
   * Iniciar la actividad que le asignaron: marca su inicio real. Quien la recibe no
   * la acepta ni la rechaza, únicamente la inicia (regla del dueño, 18-09).
   */
  @Post('activities/:id/iniciar')
  iniciarActividad(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.iniciar(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      activityId,
    );
  }

  /** Alias de `iniciar` para las apps ya instaladas (su botón «Comenzar actividad»). */
  @Post('activities/:id/aceptar')
  aceptarActividad(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.aceptar(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      activityId,
    );
  }

  /**
   * Ya no se rechazan actividades: responde 403 con el motivo para las apps instaladas
   * que aún muestran «No puedo tomarla». Reasignar o cancelar es de los superiores.
   */
  @Post('activities/:id/rechazar')
  rechazarActividad(@CurrentUser() user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.rechazar();
  }

  /** Quien reparte un despacho lo pasa a su equipo (sin ACTIVITIES_MANAGE). */
  @Post('activities/:id/despacho')
  dispatchMyActivity(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: DispatchMyActivityDto,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.dispatch(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      activityId,
      body,
    );
  }

  /** Quien reparte un despacho cambia su día y hora (queda en el registro). */
  @Patch('activities/:id/reprogramar')
  reprogramarDespacho(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
    @Body() body: ReprogramarDespachoDto,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.reprogram(
      { id: Number(user.id), email: user.email ?? null },
      companyId,
      activityId,
      body,
    );
  }

  /** Evidencias del equipo por persona (Christian todo; cada encargado su parte de la cadena). */
  @Get('activities/:id/evidencias')
  teamEvidence(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.teamEvidence(
      {
        id: Number(user.id),
        email: user.email ?? null,
        roleKey: user.roleKey ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
      },
      companyId,
      activityId,
    );
  }

  /** Aprobar o devolver (pasos o todo) la evidencia de alguien de la cadena, con observaciones y calificación. */
  @Post('activities/:id/evidencias/:userId/revision')
  reviewTeamEvidence(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
    @Param('userId', ParseIntPipe) evidenceUserId: number,
    @Body() body: RevisarEvidenciaDto,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.reviewTeamEvidence(
      {
        id: Number(user.id),
        email: user.email ?? null,
        roleKey: user.roleKey ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
      },
      companyId,
      activityId,
      evidenceUserId,
      body,
    );
  }

  /**
   * Navegación canónica por rol (url-matrix).
   * Clientes (web/Android) consumen paneles + moduleKeys en lugar de matrices locales.
   */
  @Get('navigation')
  navigation(@CurrentUser() user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.me.navigation(Number(user.id));
  }

  /**
   * Pizarra corporativa: equipo en scope company (CEO) o subtree (managerId).
   * `desde`/`hasta` en `AAAA-MM-DD`; por omisión, hoy.
   */
  @Get('board')
  board(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getBoard(
      {
        id: Number(user.id),
        roleKey: user.roleKey ?? null,
        email: user.email ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      },
      companyId,
      this.teamBoard.resolveRange(desde, hasta),
    );
  }

  /**
   * Lo que repartió quien consulta, en el rango.
   * Va antes de `board/:userId`: si no, Nest intentaría leer «asignadas-por-mi» como id.
   */
  @Get('board/asignadas-por-mi')
  boardAsignadasPorMi(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getAssignedByMe(
      {
        id: Number(user.id),
        roleKey: user.roleKey ?? null,
        email: user.email ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      },
      companyId,
      this.teamBoard.resolveRange(desde, hasta),
    );
  }

  /** Detalle de una persona en la pizarra (mismo scope que board). */
  @Get('board/:userId/history')
  boardUserHistory(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getUserHistory(
      {
        id: Number(user.id),
        roleKey: user.roleKey ?? null,
        email: user.email ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      },
      companyId,
      userId,
    );
  }

  @Get('board/:userId')
  boardUser(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getBoardUser(
      {
        id: Number(user.id),
        roleKey: user.roleKey ?? null,
        email: user.email ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      },
      companyId,
      userId,
      this.teamBoard.resolveRange(desde, hasta),
    );
  }
}
