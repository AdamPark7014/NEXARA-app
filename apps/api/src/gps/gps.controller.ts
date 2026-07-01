import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('gps')
@UseGuards(UrlAccessGuard)
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  create(@CurrentUser() user: any, @Body() createGpsDto: CreateGpsDto) {
    if (createGpsDto.usuarioId && createGpsDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes registrar tu propia ubicacion');
    }
    return this.gpsService.create({
      ...createGpsDto,
      usuarioId: user.id,
    });
  }

  @Get('me')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  findMe(@CurrentUser() user: any) {
    return this.gpsService.findMe(user.id);
  }

  @Get('trajectory')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.GPS_VIEW,
      PERMISSIONS.GPS_MANAGE,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  getTrajectory(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('userId') userId?: string,
  ) {
    const targetId = userId ? Number(userId) : user.id;
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return this.gpsService.getMyTrajectory(user.id, date);
    }
    return this.gpsService.getTrajectoryForUser(user, targetId, date);
  }

  @Get('team')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_MANAGE] })
  findTeam(@CurrentUser() user: any) {
    return this.gpsService.findTeamLocations(user);
  }

  @Patch('consent')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  updateConsent(@CurrentUser() user: any, @Body() body: { enabled?: boolean }) {
    return this.gpsService.updateConsent(user.id, Boolean(body.enabled));
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const location = await this.gpsService.findOneWithUser(+id);
    if (!location) return null;

    if (location.usuarioId === user.id) return location;

    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.GPS_MANAGE)) {
      throw new ForbiddenException('No tienes permisos para ver esta ubicacion');
    }

    if (!location.usuario?.locationConsent) {
      throw new ForbiddenException('El usuario no comparte su ubicacion');
    }

    if (!user.isSuperAdmin && user.departmentId && location.usuario?.departmentId !== user.departmentId) {
      throw new ForbiddenException('No puedes ver usuarios de otro departamento');
    }

    return location;
  }
}
