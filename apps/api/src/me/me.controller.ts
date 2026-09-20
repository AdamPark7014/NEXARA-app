import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { KpisEquipoService } from './kpis-equipo.service.js';
import { PeerRequestsService } from './peer-requests.service.js';
import { ActivityToolsService } from '../activities/tools/activity-tools.service.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_KPIS_DIAS, COLUMNAS_KPIS_PERSONAS } from '../common/excel/reportes.js';
import { ETIQUETA_SEMAFORO } from '../common/excel/etiquetas.js';

/** «Del 01/09/2026 al 30/09/2026» a partir del rango en `AAAA-MM-DD`. */
function rangoLegible({ desde, hasta }: { desde: string; hasta: string }): string {
  const bonita = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
  };
  return desde === hasta ? `Día ${bonita(desde)}` : `Del ${bonita(desde)} al ${bonita(hasta)}`;
}

@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly teamBoard: TeamBoardService,
    private readonly myActivities: MyActivitiesService,
    private readonly kpis: KpisEquipoService,
    private readonly excel: ExcelExportService,
    private readonly activityTools: ActivityToolsService,
    private readonly peerRequests: PeerRequestsService,
  ) {}

  /** Mis actividades: cola personal (todos menos el CEO). */
  @Get('activities')
  activities(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.myActivities.list({ id: Number(user.id), email: user.email ?? null }, companyId);
  }

  /** Solicitudes de equipo (pares / mismo rango o superior). */
  @Get('activity-requests')
  listPeerRequests(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.peerRequests.listMine({ id: Number(user.id), email: user.email }, companyId);
  }

  @Post('activity-requests')
  createPeerRequest(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { toUserId?: number; title?: string; description?: string },
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.peerRequests.create(
      { id: Number(user.id), email: user.email },
      companyId,
      body ?? {},
    );
  }

  @Patch('activity-requests/:id/accept')
  acceptPeerRequest(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.peerRequests.accept({ id: Number(user.id), email: user.email }, companyId, id);
  }

  @Patch('activity-requests/:id/reject')
  rejectPeerRequest(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.peerRequests.reject(
      { id: Number(user.id), email: user.email },
      companyId,
      id,
      body?.reason,
    );
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

  /**
   * Checklist de herramientas de una OT mía: qué tengo que llevar y qué ya palomeé.
   * Mientras quede algo sin palomear, `iniciar` se niega.
   */
  @Get('activities/:id/herramientas')
  misHerramientasDeActividad(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.activityTools.listarParaAsignado(activityId, Number(user.id), companyId);
  }

  /** Palomear un renglón del checklist desde la app: «lo traigo y sirve» o «falta». */
  @Post('activities/:id/herramientas/:requirementId/check')
  palomearHerramienta(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) activityId: number,
    @Param('requirementId', ParseIntPipe) requirementId: number,
    @Body() body: { ok?: boolean; nota?: string; fotoUrl?: string },
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.activityTools.palomear({
      activityId,
      requirementId,
      userId: Number(user.id),
      ok: body?.ok,
      nota: body?.nota,
      fotoUrl: body?.fotoUrl,
      companyId,
    });
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

  /** Pipeline de flujo de actividades del alcance del viewer (Ola C). */
  @Get('kpis/flujo')
  kpisFlujo(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getWorkflow(
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

  @Get('kpis/equipo')
  kpisEquipo(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('userId') userId?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    const solo = Number(userId);
    return this.kpis.getEquipo(
      this.viewer(user),
      companyId,
      this.kpis.resolveDias(desde, hasta),
      Number.isInteger(solo) && solo > 0 ? solo : null,
    );
  }

  /**
   * Excel de los KPI del equipo: una fila por persona con retardos, uniforme, horas
   * laboradas contra productivas, inactividad y tiempo extra, y totales con fórmulas.
   * Ruta literal antes de `:userId` para que Nest no la tome por un id.
   */
  @Get('kpis/equipo/export.xlsx')
  async kpisEquipoExcel(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    const rango = this.kpis.resolveDias(desde, hasta);
    const datos = await this.kpis.getEquipo(this.viewer(user), companyId, rango, null);
    const buffer = await this.excel.exportarReporte({
      titulo: 'KPI del equipo',
      subtitulo: rangoLegible(rango),
      hoja: 'KPI por persona',
      columnas: COLUMNAS_KPIS_PERSONAS,
      filas: datos.personas,
      generadoPor: user?.nombre ?? null,
      generadoEn: new Date(datos.generadoAt),
      filtros: [
        { etiqueta: 'Desde', valor: rango.desde },
        { etiqueta: 'Hasta', valor: rango.hasta },
        { etiqueta: 'Alcance', valor: datos.scope === 'company' ? 'Toda la empresa' : 'Mi organigrama' },
        { etiqueta: 'Semáforo del equipo', valor: ETIQUETA_SEMAFORO[datos.equipo.semaforo] ?? datos.equipo.semaforo },
      ],
      notas: [...datos.supuestos, ...datos.equipo.motivos],
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="kpis-equipo-${rango.desde}-${rango.hasta}.xlsx"`);
    return res.send(buffer);
  }

  /** Excel de una persona: resumen del periodo más la hoja «Día por día». */
  @Get('kpis/equipo/:userId/export.xlsx')
  async kpisPersonaExcel(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
    @Res() res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    const rango = this.kpis.resolveDias(desde, hasta);
    const datos = await this.kpis.getPersona(this.viewer(user), companyId, userId, rango);
    const buffer = await this.excel.exportarReporte({
      titulo: `KPI · ${datos.persona.nombre}`,
      subtitulo: rangoLegible(rango),
      hoja: 'Resumen',
      columnas: COLUMNAS_KPIS_PERSONAS,
      filas: [datos],
      generadoPor: user?.nombre ?? null,
      generadoEn: new Date(datos.generadoAt),
      filtros: [
        { etiqueta: 'Persona', valor: datos.persona.nombre },
        { etiqueta: 'Desde', valor: rango.desde },
        { etiqueta: 'Hasta', valor: rango.hasta },
        { etiqueta: 'Horario', valor: datos.horario.etiqueta },
        { etiqueta: 'Semáforo', valor: ETIQUETA_SEMAFORO[datos.semaforo] ?? datos.semaforo },
      ],
      notas: [
        ...datos.supuestos,
        ...datos.motivos,
        ...datos.justificaciones.map((j) => `Falta justificada ${j.fecha}: ${j.motivo}`),
      ],
      hojasExtra: [
        {
          hoja: 'Día por día',
          titulo: `Detalle diario · ${datos.persona.nombre}`,
          subtitulo: rangoLegible(rango),
          columnas: COLUMNAS_KPIS_DIAS,
          // El servicio los devuelve de más reciente a más antiguo; en papel se lee al revés.
          filas: [...datos.dias].reverse(),
        },
      ],
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header(
      'Content-Disposition',
      `attachment; filename="kpis-${userId}-${rango.desde}-${rango.hasta}.xlsx"`,
    );
    return res.send(buffer);
  }

  /** Detalle de una persona, día por día, con la línea de tiempo (jornada, comida, productivo, inactivo). */
  @Get('kpis/equipo/:userId')
  kpisPersona(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.kpis.getPersona(this.viewer(user), companyId, userId, this.kpis.resolveDias(desde, hasta));
  }

  private viewer(user: any) {
    return {
      id: Number(user.id),
      roleKey: user.roleKey ?? null,
      email: user.email ?? null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };
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
