import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { IntegraArtemisService } from './integra-artemis.service';
import { IntegraSiteService } from './integra-site.service';
import { IntegraSyncService } from './integra-sync.service';

function integraCanSettings(user: { roleKey?: string; isSuperAdmin?: boolean } | null) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleKey !== 'cliente';
}

class AddPersonDto {
  @IsString() personName!: string;
  @IsString() orgIndexCode!: string;
  @IsOptional() @IsString() personCode?: string;
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
  @IsOptional() @IsIn(['ARTEMIS', 'HCT']) provider?: 'ARTEMIS' | 'HCT';
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
  @IsOptional() @IsIn(['ARTEMIS', 'HCT']) provider?: 'ARTEMIS' | 'HCT';
}

class DoorControlDto {
  /** 0 remain open · 1 close · 2 open · 3 remain closed */
  @IsIn(['0', '1', '2', '3'])
  controlType!: '0' | '1' | '2' | '3';
}

class VehicleDto {
  @IsString() plateNo!: string;
  @IsOptional() @IsString() personId?: string;
  @IsOptional() @IsString() vehicleId?: string;
}

class PlaybackDto {
  @IsString() beginTime!: string;
  @IsString() endTime!: string;
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
    });
  }

  @Get('regions')
  regions(
    @CurrentCompanyId() companyId: number | null,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.listRegions(companyId, siteId ? parseInt(siteId, 10) : null);
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
  ) {
    return this.integra.stream(companyId, id, siteId ? parseInt(siteId, 10) : null);
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
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.openDoor(
      companyId,
      id,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
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
    return this.integra.controlDoor(
      companyId,
      id,
      dto.controlType,
      { id: user?.id, email: user?.email },
      siteId ? parseInt(siteId, 10) : null,
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

  @Post('people')
  @HttpCode(HttpStatus.CREATED)
  addPerson(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: AddPersonDto,
    @CurrentUser() user: any,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.addPerson(
      companyId,
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
    return this.integra.deletePerson(
      companyId,
      id,
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
  @Post('alarms/search')
  @HttpCode(HttpStatus.OK)
  alarms(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: Record<string, unknown>,
    @Query('siteId') siteId?: string,
  ) {
    return this.integra.alarmRecords(companyId, body, siteId ? parseInt(siteId, 10) : null);
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
