import { Controller, Get, Post, Patch, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('gps')
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  create(@CurrentUser() user: any, @Body() createGpsDto: CreateGpsDto) { 
    if (createGpsDto.usuarioId && createGpsDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes registrar tu propia ubicación');
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
      throw new ForbiddenException('No tienes permisos para ver esta ubicación');
    }

    if (!location.usuario?.locationConsent) {
      throw new ForbiddenException('El usuario no comparte su ubicación');
    }

    if (!user.isSuperAdmin && user.departmentId && location.usuario?.departmentId !== user.departmentId) {
      throw new ForbiddenException('No puedes ver usuarios de otro departamento');
    }

    return location;
  }
}
