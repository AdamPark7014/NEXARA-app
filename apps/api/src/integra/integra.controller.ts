import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ArrayNotEmpty,
  Allow,
  IsArray,
  IsBoolean,
  Max,
  Min,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Observable, interval, switchMap, startWith, catchError, of, map, merge } from 'rxjs';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { IntegraArtemisService } from './integra-artemis.service';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import { IntegraSiteService } from './integra-site.service';
import { IntegraPushService } from './integra-push.service';
import { IntegraSyncService } from './integra-sync.service';
import { IntegraAcsFanoutService } from './integra-acs-fanout.service';
import { IntegraSpacesService } from './integra-spaces.service';
import { IntegraSchedulesService } from './integra-schedules.service';
import { IdentityLinkService } from '../identity/identity-link.service';

export function integraCanSettings(user: { roleKey?: string; isSuperAdmin?: boolean } | null) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleKey !== 'cliente';
}

function integraCanControlDoors(user: { roleKey?: string; isSuperAdmin?: boolean } | null) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleKey !== 'cliente';
}

class AddPersonDto {
  @IsString() personName!: string;
  @IsOptional() @IsString() orgIndexCode?: string;
  @IsOptional() @IsString() personCode?: string;
  @IsOptional() @IsString() employeeNo?: string;
  /** ISAPI: genera employeeNo si no viene código. Default true en servicio. */
  @IsOptional() @IsBoolean() autoCode?: boolean;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() userType?: string;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
  @IsOptional() @IsBoolean() validEnable?: boolean;
  @IsOptional() @IsString() doorRight?: string;
  @IsOptional() @Allow() rightPlan?: unknown;
}

class UpdatePersonDto {
  @IsOptional() @IsString() personName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() userType?: string;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
  @IsOptional() @IsBoolean() validEnable?: boolean;
  @IsOptional() @IsString() doorRight?: string;
  /** RightPlan ISAPI — puertas/plantillas del terminal. */
  @IsOptional() @Allow() rightPlan?: unknown;
}

/** Vincula ACS personId → User.employeeNumber (identidad canónica). */
class LinkPersonDto {
  @Type(() => Number)
  @IsInt()
  userId!: number;
}

class AssignPrivilegeDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) personIds!: string[];
}

class SiteCreateDto {
  @IsString() name!: string;
  @IsString() host!: string;
  @IsString() appKey!: string;
  @IsString() appSecret!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** Super-admin: crear sitio para otra empresa */
  @IsOptional() @Type(() => Number) @IsInt() companyId?: number;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsObject() modulesOverride?: Record<string, boolean>;
  /** ARTEMIS (HikCentral) | HCT (Hik-Connect for Teams) — ADR-0019 */
  @IsOptional() @IsIn(['ARTEMIS', 'HCT', 'ISAPI']) provider?: 'ARTEMIS' | 'HCT' | 'ISAPI';
  @IsOptional() @Type(() => Number) @IsInt() serviceClientId?: number | null;
}

class SiteUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsString() appKey?: string;
  @IsOptional() @IsString() appSecret?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsObject() modulesOverride?: Record<string, boolean> | null;
  @IsOptional() @IsIn(['ARTEMIS', 'HCT', 'ISAPI']) provider?: 'ARTEMIS' | 'HCT' | 'ISAPI';
  @IsOptional() @Type(() => Number) @IsInt() serviceClientId?: number | null;
}

class DoorControlDto {
  /** 0 remain open · 1 close · 2 open · 3 remain closed */
  @IsIn(['0', '1', '2', '3'])
  controlType!: '0' | '1' | '2' | '3';

  @IsString()
  reason!: string;
}

class PtzMoveDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100) @Max(100) pan?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100) @Max(100) tilt?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100) @Max(100) zoom?: number;
  /** Tope de 5 s: una orden más larga deja la domo girando si se corta la red. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(80) @Max(5000) durationMs?: number;
  /** Hold-to-move: gira hasta `stop` (sin esperar durationMs). */
  @IsOptional() @IsBoolean() continuous?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(300) preset?: number;
  @IsOptional() @IsBoolean() stop?: boolean;
}

class AlarmAckDto {
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() severity?: string;
}

class FloorplanCreateDto {
  @IsString() name!: string;
  @IsString() imageData!: string;
}

class MapPinDto {
  @IsIn(['CAMERA', 'DOOR']) entityType!: 'CAMERA' | 'DOOR';
  @IsString() entityId!: string;
  @IsOptional() @IsString() label?: string;
  @Type(() => Number) xPct!: number;
  @Type(() => Number) yPct!: number;
}

class VehicleDto {
  @IsString() plateNo!: string;
  @IsOptional() @IsString() personId?: string;
  @IsOptional() @IsString() vehicleId?: string;
}

class PlaybackDto {
  @IsString() beginTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) segmentIndex?: number;
}

class SpacePolicyDto {
  @IsString() templateKey!: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class SpaceBookingDto {
  @IsString() doorIndexCode!: string;
  @IsString() title!: string;
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsOptional() @IsString() hostName?: string;
  @IsOptional() @IsString() hostPersonId?: string;
  @IsOptional() @IsString() notes?: string;
}

class WeekPlanPutDto {
  @IsOptional() @IsBoolean() enable?: boolean;
  @IsOptional() @IsArray() segments?: Array<{
    week: string;
    id?: number;
    beginTime: string;
    endTime: string;
  }>;
  @IsOptional() @IsObject() WeekPlanCfg?: Record<string, unknown>;
}

class PlanTemplatePutDto {
  @IsOptional() @IsBoolean() enable?: boolean;
  @IsString() templateName!: string;
  @Type(() => Number) @IsInt() weekPlanNo!: number;
  @IsOptional() @IsString() holidayGroupNo?: string;
}

class EnsureSchedulePresetDto {
  @IsIn(['office_hours', 'after_hours', 'weekend'])
  preset!: 'office_hours' | 'after_hours' | 'weekend';
  @IsOptional() @IsString() deviceIp?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(32) templateId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(32) weekPlanId?: number;
  @IsOptional() @IsString() officeBegin?: string;
  @IsOptional() @IsString() officeEnd?: string;
}

class PersonAccessPatchDto {
  @IsOptional() @IsIn(['indefinite', 'window', 'disabled'])
  validMode?: 'indefinite' | 'window' | 'disabled';
  @IsOptional() @IsString() beginTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() planTemplateNo?: string | number;
  @IsOptional()
  @IsArray()
  doorPlans?: Array<{
    deviceIp: string;
    doorNo?: number;
    planTemplateNo?: string | number;
    disable?: boolean;
  }>;
  @IsOptional()
  @IsIn([
    'always',
    'never',
    'office_hours',
    'after_hours',
    'weekend',
    'visitor_today',
    'contractor',
  ])
  preset?:
    | 'always'
    | 'never'
    | 'office_hours'
    | 'after_hours'
    | 'weekend'
    | 'visitor_today'
    | 'contractor';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) contractorDays?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) deviceIps?: string[];
  @IsOptional() @IsBoolean() ensurePresetsOnDevices?: boolean;
}

@ApiTags('Integra · Artemis')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('integra')
export class IntegraController {
  constructor(
    private readonly integra: IntegraArtemisService,
    private readonly sites: IntegraSiteService,
    private readonly sync: IntegraSyncService,
    private readonly serviceClients: ServiceClientsService,
    private readonly push: IntegraPushService,
    private readonly acsFanout: IntegraAcsFanoutService,
    private readonly identity: IdentityLinkService,
    private readonly spaces: IntegraSpacesService,
    private readonly schedules: IntegraSchedulesService,
  ) {}

  @Get('health')
  health(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.health(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Get('dashboard')
  dashboard(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.dashboard(companyId, siteId ? parseInt(siteId, 10) : null, {
      canSettings: integraCanSettings(user),
      canControlDoors: integraCanControlDoors(user),
    });
  }

  @Get('audit')
  @ApiOperation({ summary: 'Bitácora mutaciones Integra (AuditService)' })
  auditLog(
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
  ) {
    return this.integra.listAudit(companyId, {
      limit: limit ? parseInt(limit, 10) : 40,
    });
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'Portfolio multi-cliente (super-admin ve todos)' })
  portfolio(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
  ) {
    return this.integra.getPortfolio(
      companyId,
      Boolean(user?.isSuperAdmin),
      integraCanSettings(user),
    );
  }

  @Get('capabilities')
  capabilities(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.capabilities(companyId, siteId ? parseInt(siteId, 10) : null, {
      canSettings: integraCanSettings(user),
      canControlDoors: integraCanControlDoors(user),
    });
  }

  @Get('regions')
  regions(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listRegions(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Árbol workbench: regiones + puertas + cámaras' })
  tree(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.getTree(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  // ── Sites ──────────────────────────────────────────────────────────
  @Get('sites')
  listSites(@CurrentCompanyId() companyId: number | null) {
    if (!companyId) return [];
    return this.sites.list(companyId);
  }

  @Post('sites')
  @HttpCode(HttpStatus.CREATED)
  createSite(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Body() dto: SiteCreateDto,
  ) {
    const target =
      user?.isSuperAdmin && dto.companyId != null ? dto.companyId : companyId;
    if (!target) throw new BadRequestException('companyId requerido');
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para administrar sitios');
    }
    const { companyId: _ignore, ...rest } = dto;
    return this.sites.create(target, rest);
  }

  @Patch('sites/:id')
  updateSite(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SiteUpdateDto,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para administrar sitios');
    }
    return this.sites.update(companyId, parseInt(id, 10), dto);
  }

  @Delete('sites/:id')
  deleteSite(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para administrar sitios');
    }
    return this.sites.remove(companyId, parseInt(id, 10));
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reconciliar espejo desde terminales (recuperación). Los cambios de ficha/cara/ERP ya van en vivo.',
  })
  async runSync(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const sid = siteId
      ? parseInt(siteId, 10)
      : (await this.sites.list(companyId)).find((s) => s.isDefault)?.id ||
        (await this.sites.list(companyId))[0]?.id;
    if (!sid) throw new BadRequestException('Sin sitio para sincronizar');
    return this.sync.syncSite(companyId, sid);
  }

  @Get('acs-fanout/status')
  @ApiOperation({ summary: 'Estado reciente de pushes ACS por IP (fallos / reintentos)' })
  acsFanoutStatus(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) return { items: [] };
    return {
      items: this.acsFanout.listRecent(
        companyId,
        siteId ? parseInt(siteId, 10) : null,
      ),
    };
  }

  @Get('sync/last')
  lastSync(@CurrentCompanyId() companyId: number | null, @Query('siteId') siteId?: string) {
    if (!companyId) return null;
    return this.sync.lastRun(companyId, siteId ? parseInt(siteId, 10) : undefined);
  }

  // ── Cameras / video ────────────────────────────────────────────────
  @Get('cameras')
  cameras(
    @CurrentCompanyId() companyId: number | null,
    @Query('live') live?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listCameras(
      companyId,
      live === '1',
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('cameras/:id/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.preview(companyId, id, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('cameras/:id/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RTSP→HLS vía go2rtc' })
  stream(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId?: string,
    @Query('audio') audio?: string,
  ) {
    return this.integra.stream(companyId, id, siteId ? parseInt(siteId, 10) : null, {
      audio: audio === '1' || audio === 'true',
    });
  }

  @Post('cameras/:id/audio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enciende/apaga el micrófono del canal en el propio equipo' })
  cameraAudio(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() body: { enabled?: boolean },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    // Escribe en el equipo del cliente: mismo listón que abrir una puerta.
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para cambiar la configuración del equipo');
    }
    return this.integra.setCameraAudio(
      companyId,
      id,
      body?.enabled !== false,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  // ── PTZ ────────────────────────────────────────────────────────────
  @Post('cameras/:id/ptz')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mover la domo (pan/tilt/zoom en -100..100)' })
  ptz(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: PtzMoveDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para mover cámaras');
    }
    const site = siteId ? parseInt(siteId, 10) : null;
    if (dto.stop) return this.integra.ptzStop(companyId, id, site);
    if (dto.preset != null) {
      return this.integra.ptzGoTo(companyId, id, dto.preset, { id: user?.id, email: user?.email }, site);
    }
    return this.integra.ptzMove(
      companyId,
      id,
      {
        pan: dto.pan,
        tilt: dto.tilt,
        zoom: dto.zoom,
        durationMs: dto.durationMs,
        continuous: dto.continuous === true,
      },
      site,
    );
  }

  @Get('cameras/:id/ptz/presets')
  @ApiOperation({ summary: 'Posiciones memorizadas de la domo' })
  ptzPresetList(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.ptzPresets(companyId, id, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('cameras/:id/playback')
  @HttpCode(HttpStatus.OK)
  playback(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: PlaybackDto,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.playback(
      companyId,
      id,
      dto.beginTime,
      dto.endTime,
      siteId ? parseInt(siteId, 10) : null,
      dto.segmentIndex,
    );
  }

  @Post('cameras/:id/capture')
  @HttpCode(HttpStatus.OK)
  capture(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.capture(companyId, id, siteId ? parseInt(siteId, 10) : null);
  }

  // ── Doors / access ─────────────────────────────────────────────────
  @Get('doors')
  doors(
    @CurrentCompanyId() companyId: number | null,
    @Query('live') live?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listDoors(
      companyId,
      live === '1',
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('doors/:id/open')
  @HttpCode(HttpStatus.OK)
  openDoor(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para controlar puertas');
    }
    return this.integra.openDoor(
      companyId,
      id,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
      body?.reason,
    );
  }

  @Post('doors/:id/control')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'doControl Artemis: 0 remain open · 1 close · 2 open · 3 remain closed' })
  controlDoor(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: DoorControlDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para controlar puertas');
    }
    return this.integra.controlDoor(
      companyId,
      id,
      dto.controlType,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
      dto.reason,
    );
  }

  @Get('devices')
  devices(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listDevices(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Get('events')
  events(
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
    @Query('pageNo') pageNo?: string,
    @Query('doorId') doorId?: string,
    @Query('personId') personId?: string,
    @Query('personName') personName?: string,
    @Query('eventType') eventType?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listEvents(companyId, {
      limit: limit ? parseInt(limit, 10) : 80,
      pageNo: pageNo ? parseInt(pageNo, 10) : 1,
      doorId,
      personId,
      personName,
      eventType: eventType ? parseInt(eventType, 10) : undefined,
      startTime,
      endTime,
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Post('events/picture')
  @HttpCode(HttpStatus.OK)
  eventPicture(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { picUri: string },
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.eventPicture(
      companyId,
      body.picUri,
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  // ── People / privilege ─────────────────────────────────────────────
  @Get('orgs')
  orgs(@CurrentCompanyId() companyId: number | null, @Query('siteId') siteId?: string) {
    return this.integra.listOrgs(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Get('identity/me')
  @ApiOperation({
    summary: 'Identidad ERP↔ACS del usuario en sesión (portal empleado)',
  })
  myIdentity(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
  ) {
    return this.identity.getMyIdentity(user?.id, companyId);
  }

  @Get('identity/candidates')
  @ApiOperation({ summary: 'Usuarios ERP candidatos para vincular a una persona ACS' })
  identityCandidates(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Query('q') q?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para vincular identidades');
    }
    return this.identity.listCandidates(companyId, q);
  }

  @Get('people')
  people(
    @CurrentCompanyId() companyId: number | null,
    @Query('live') live?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listPeople(
      companyId,
      live === '1',
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Get('people/:id')
  personDetail(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.getPerson(companyId, id, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('people/:id/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vincular persona ACS → usuario ERP (employeeNumber = personId)',
  })
  linkPerson(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: LinkPersonDto,
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para vincular identidades');
    }
    return this.identity.linkPersonToUser(companyId, id, dto.userId);
  }

  @Delete('people/:id/link')
  @ApiOperation({ summary: 'Desvincular persona ACS del usuario ERP' })
  unlinkPerson(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para desvincular identidades');
    }
    return this.identity.unlinkPerson(companyId, id);
  }

  @Get('people/:id/face')
  @ApiOperation({ summary: 'Proxy de foto de rostro (ISAPI faceURL)' })
  async personFace(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Query('siteId') siteId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.integra.getPersonFace(
      companyId,
      id,
      siteId ? parseInt(siteId, 10) : null,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.send(buffer);
  }

  @Post('people')
  @HttpCode(HttpStatus.CREATED)
  addPerson(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: AddPersonDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.addPerson(
      companyId,
      dto,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Patch('people/:id')
  updatePerson(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.updatePerson(
      companyId,
      id,
      dto,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Delete('people/:id')
  deletePerson(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.deletePerson(
      companyId,
      id,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('people/:id/face')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Empuja JPEG de rostro a los terminales (FaceDataRecord)' })
  async uploadPersonFace(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() body: { imageBase64?: string },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    const b64 = String(body?.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    if (!b64) throw new BadRequestException('imageBase64 requerido');
    const jpeg = Buffer.from(b64, 'base64');
    return this.integra.uploadPersonFace(
      companyId,
      id,
      jpeg,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Delete('people/:id/face')
  @ApiOperation({ summary: 'Quita el rostro biométrico de los terminales' })
  deletePersonFace(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.deletePersonFace(
      companyId,
      id,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('people/:id/fingerprint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Captura huella en un ACS (CaptureFingerPrint) y la aplica a todos (FingerPrintDownload); guarda plantilla en NEXARA',
  })
  enrollPersonFingerprint(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body()
    body: {
      deviceIp?: string;
      fingerPrintID?: number;
      fingerData?: string;
      fingerType?: string;
    },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.enrollPersonFingerprint(
      companyId,
      id,
      body || {},
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('people/:id/fingerprint/fetch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Intenta bajar plantilla del ACS (FingerPrintUpload) a NEXARA' })
  fetchPersonFingerprint(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() body: { deviceIp?: string; fingerPrintID?: number },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.fetchPersonFingerprint(
      companyId,
      id,
      body || {},
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Delete('people/:id/fingerprint')
  @ApiOperation({ summary: 'Elimina huellas en ACS (FingerPrint/Delete) y copia local' })
  deletePersonFingerprint(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() body: { fingerPrintIDs?: number[] },
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para gestionar personas');
    }
    return this.integra.deletePersonFingerprint(
      companyId,
      id,
      body || {},
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Get('privilege-groups')
  privilegeGroups(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listPrivilegeGroups(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('privilege-groups/:id/persons')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: AssignPrivilegeDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.assignPersonsToGroup(
      companyId,
      id,
      dto.personIds,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('privilege/apply')
  @HttpCode(HttpStatus.OK)
  applyAuth(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.applyAuth(
      companyId,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  // ── Vehicles ───────────────────────────────────────────────────────
  @Get('vehicles')
  vehicles(
    @CurrentCompanyId() companyId: number | null,
    @Query('live') live?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listVehicles(
      companyId,
      live === '1',
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('vehicles')
  @HttpCode(HttpStatus.CREATED)
  addVehicle(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: VehicleDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.addVehicle(
      companyId,
      dto,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: VehicleDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.updateVehicle(
      companyId,
      { ...dto, vehicleId: id },
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Delete('vehicles/:id')
  deleteVehicle(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.deleteVehicle(
      companyId,
      id,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  // ── P3 alarms / visitors ───────────────────────────────────────────
  @Get('alarms/queue')
  @ApiOperation({ summary: 'Cola SOC: alarmas recientes + ack local' })
  alarmQueue(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Query('hours') hours?: string,
  ) {
    return this.integra.alarmQueue(companyId, siteId ? parseInt(siteId, 10) : null, {
      hours: hours ? parseInt(hours, 10) : 24,
    });
  }

  @Post('alarms/:id/ack')
  @HttpCode(HttpStatus.OK)
  ackAlarm(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: AlarmAckDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.ackAlarm(companyId, decodeURIComponent(id), {
      note: dto.note,
      title: dto.title,
      severity: dto.severity,
      status: 'ACK',
      actor: { id: user?.id, email: user?.email },
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Post('alarms/:id/clear')
  @HttpCode(HttpStatus.OK)
  clearAlarm(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: AlarmAckDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.ackAlarm(companyId, decodeURIComponent(id), {
      note: dto.note,
      title: dto.title,
      severity: dto.severity,
      status: 'CLEARED',
      actor: { id: user?.id, email: user?.email },
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Post('alarms/search')
  @HttpCode(HttpStatus.OK)
  alarms(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.alarmRecords(companyId, body, siteId ? parseInt(siteId, 10) : null);
  }

  
  @Post('alarms/:id/ticket')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ticket OPS desde alarma (serviceClientId del sitio)' })
  async createAlarmTicket(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Body() body?: { title?: string; description?: string; severity?: string },
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    const sites = await this.sites.list(companyId);
    const sid = siteId ? Number(siteId) : null;
    const site = sid
      ? sites.find((s: any) => s.id === sid)
      : sites.find((s: any) => s.isDefault) || sites[0];
    if (!site) throw new BadRequestException('Sin sitio Integra activo');
    const clientId = (site as any).serviceClientId as number | null | undefined;
    if (!clientId) {
      throw new BadRequestException(
        'El sitio no tiene cliente operativo vinculado. Configúralo en Integra → Sitios.',
      );
    }
    const description = [
      body?.title || `Alarma Integra: ${decodeURIComponent(id)}`,
      body?.description,
      body?.severity ? `Severidad: ${body.severity}` : null,
      `alarmId=${decodeURIComponent(id)}`,
      `siteId=${site.id}`,
      (site as any).label || site.name ? `Sitio: ${(site as any).label || site.name}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    // Firma real se ajusta abajo si createTicketRequest difiere
    const ticket = await this.serviceClients.createTicketRequest(
      clientId,
      { description, urgency: 'HIGH', requestType: 'ISSUE' },
      companyId,
    );
    return { ok: true, ticket, clientId, siteId: site.id };
  }

  @Sse('events/stream')
  @ApiOperation({ summary: 'SSE live events (poll bridge server-side)' })
  eventsStream(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ): Observable<MessageEvent> {
    const sid = siteId ? parseInt(siteId, 10) : null;
    return interval(4000).pipe(
      startWith(0),
      switchMap(async () => {
        const data = await this.integra.pollLiveEvents(companyId, sid, 40);
        return { data } as MessageEvent;
      }),
      catchError(() => of({ data: { items: [], error: true } } as MessageEvent)),
    );
  }

  // ── Empuje de eventos ──────────────────────────────────────────────
  @Post('sites/:siteId/push/wire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apunta los equipos del sitio a NEXARA (y opcionalmente enciende detección)' })
  async wirePush(
    @CurrentCompanyId() companyId: number | null,
    @Param('siteId', ParseIntPipe) siteId: number,
    @Body() body: { detection?: boolean; rotateToken?: boolean },
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para configurar equipos');
    }
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.push.wireDevices(companyId, siteId, {
      detection: body?.detection === true,
      rotateToken: body?.rotateToken !== false,
    });
  }

  @Post('sites/:siteId/push/unwire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Los equipos dejan de avisar (y de detectar)' })
  async unwirePush(
    @CurrentCompanyId() companyId: number | null,
    @Param('siteId', ParseIntPipe) siteId: number,
    @Body() body: { detection?: boolean },
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para configurar equipos');
    }
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.push.unwireDevices(companyId, siteId, { detection: body?.detection === true });
  }

  @Get('push/events')
  @ApiOperation({ summary: 'Eventos que los equipos empujaron, con su foto' })
  async pushEvents(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Query('personId') personId?: string,
    @Query('personName') personName?: string,
    @Query('deviceIp') deviceIp?: string,
    @Query('limit') limit?: string,
    @Query('afterId') afterId?: string,
    @Query('beforeId') beforeId?: string,
    @Query('sinceMs') sinceMs?: string,
    @Query('live') live?: string,
    @Query('scope') scope?: string,
    @Query('outcome') outcome?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    const take = Math.min(Math.max(parseInt(limit || '60', 10) || 60, 1), 300);
    // Default: útil (sin VMD/heartBeat). `scope=all` solo para diagnóstico.
    const scopeNorm =
      scope === 'acs' || scope === 'noise' || scope === 'all' ? scope : null;
    const outcomeNorm =
      outcome === 'granted' || outcome === 'denied' ? outcome : null;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('from inválido');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('to inválido');
    }
    return this.push.listEvents(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      personId: personId || null,
      personName: personName || null,
      deviceIp: deviceIp || null,
      take,
      afterId: afterId ? parseInt(afterId, 10) : null,
      beforeId: beforeId ? parseInt(beforeId, 10) : null,
      sinceMs: sinceMs ? parseInt(sinceMs, 10) : null,
      liveOnly: live === '1' || live === 'true',
      scope: scopeNorm,
      outcome: outcomeNorm,
      from: fromDate,
      to: toDate,
    });
  }

  @Get('push/events/stats')
  @ApiOperation({ summary: 'KPIs del día: entradas, denegados, únicos, en sitio' })
  async pushEventStats(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.push.eventStats(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Sse('push/stream')
  @ApiOperation({ summary: 'SSE: eventos empujados al instante (con heartbeat)' })
  pushStream(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ): Observable<MessageEvent> {
    if (!companyId) {
      return of({ data: { type: 'error', message: 'Empresa requerida' } } as MessageEvent);
    }
    const sid = siteId ? parseInt(siteId, 10) : NaN;
    if (!Number.isFinite(sid) || sid <= 0) {
      return of({ data: { type: 'error', message: 'siteId requerido' } } as MessageEvent);
    }
    // Garantiza Subject antes del primer evento.
    const live$ = this.push.stream(sid).pipe(
      map((item) => ({ data: { type: 'event', item } }) as MessageEvent),
    );
    const ping$ = interval(12_000).pipe(
      startWith(0),
      map(() => ({ data: { type: 'ping', t: Date.now() } }) as MessageEvent),
    );
    return merge(live$, ping$).pipe(
      catchError(() => of({ data: { type: 'error', message: 'stream' } } as MessageEvent)),
    );
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Asistencia deducida de los accesos concedidos' })
  async attendance(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('personId') personId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    // Por defecto, la semana en curso: es la ventana con la que se mira esto.
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 7 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Rango de fechas no válido');
    }
    return this.push.attendance(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      from: start,
      to: end,
      personId: personId || null,
    });
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'Quién está en sitio hoy (accesos, no conteo óptico)' })
  async occupancy(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.push.occupancy(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Get('plate-events')
  @ApiOperation({ summary: 'Detecciones de vehículo / placas (OCR solo si hay ANPR)' })
  async plateEvents(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.push.plateEvents(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      limit: limit ? parseInt(limit, 10) : 40,
    });
  }

  // ── Espacios / puertas (política de vigencia + uso) ───────────────
  @Get('spaces/templates')
  @ApiOperation({ summary: 'Catálogo de plantillas de vigencia por espacio' })
  spaceTemplates() {
    return this.spaces.templates();
  }

  @Get('spaces')
  @ApiOperation({
    summary: 'Todas las puertas/zonas: plantilla, indefinido vs temporal, última entrada',
  })
  async spacesOverview(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.spaces.overview(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Get('spaces/:doorId')
  @ApiOperation({ summary: 'Detalle de un espacio: personas, ventanas de uso, accesos vivos' })
  async spaceDetail(
    @CurrentCompanyId() companyId: number | null,
    @Param('doorId') doorId: string,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.spaces.detail(
      companyId,
      decodeURIComponent(doorId),
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Put('spaces/:doorId/policy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plantilla de vigencia por defecto del espacio' })
  async spacePolicy(
    @CurrentCompanyId() companyId: number | null,
    @Param('doorId') doorId: string,
    @Body() dto: SpacePolicyDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para cambiar política de espacios');
    }
    return this.spaces.upsertPolicy(companyId, decodeURIComponent(doorId), {
      templateKey: dto.templateKey,
      label: dto.label,
      config: dto.config,
      siteId: siteId ? parseInt(siteId, 10) : null,
    });
  }

  @Get('spaces-bookings')
  @ApiOperation({ summary: 'Ventanas de uso planificadas (todas las puertas)' })
  async spaceBookings(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
    @Query('doorId') doorId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.spaces.listBookings(companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      doorIndexCode: doorId ? decodeURIComponent(doorId) : null,
    });
  }

  @Post('spaces-bookings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ventana de uso de un espacio' })
  async createSpaceBooking(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: SpaceBookingDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para planificar uso de espacios');
    }
    return this.spaces.createBooking(companyId, {
      ...dto,
      siteId: siteId ? parseInt(siteId, 10) : null,
      createdById: user?.id ?? null,
    });
  }

  @Delete('spaces-bookings/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar ventana de uso' })
  async cancelSpaceBooking(
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    if (!integraCanControlDoors(user)) {
      throw new BadRequestException('Sin permiso para cancelar uso de espacios');
    }
    return this.spaces.cancelBooking(companyId, id);
  }

  @Get('floorplans')
  floorplans(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listFloorplans(companyId, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('floorplans')
  @HttpCode(HttpStatus.CREATED)
  createFloorplan(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: FloorplanCreateDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para planos');
    }
    return this.integra.createFloorplan(
      companyId,
      dto,
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('floorplans/:id/pins')
  @HttpCode(HttpStatus.OK)
  upsertPin(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @Body() dto: MapPinDto,
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para pines');
    }
    return this.integra.upsertMapPin(companyId, parseInt(id, 10), dto);
  }

  @Delete('map-pins/:id')
  deletePin(
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso');
    }
    return this.integra.deleteMapPin(companyId, parseInt(id, 10));
  }

  @Post('visitors/register')
  @HttpCode(HttpStatus.CREATED)
  visitorRegister(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.visitorRegister(
      companyId,
      body,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
    );
  }

  @Post('visitors/search')
  @HttpCode(HttpStatus.OK)
  visitorSearch(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.visitorRecords(companyId, body, siteId ? parseInt(siteId, 10) : null);
  }

  @Post('visitors/qr')
  @HttpCode(HttpStatus.OK)
  visitorQr(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.visitorQr(companyId, body, siteId ? parseInt(siteId, 10) : null);
  }

  // ── P4 ANPR ────────────────────────────────────────────────────────
  @Post('anpr/cross-records')
  @HttpCode(HttpStatus.OK)
  anpr(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.anprRecords(companyId, body, siteId ? parseInt(siteId, 10) : null);
  }
}
