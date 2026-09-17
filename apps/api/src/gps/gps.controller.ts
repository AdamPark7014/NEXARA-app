import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { puedeVerGpsDireccion } from '../attendance/asistencia-confiable.js';

@Controller('gps')
@UseGuards(UrlAccessGuard)
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE] })
  create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() createGpsDto: CreateGpsDto,
  ) {
    if (createGpsDto.usuarioId && createGpsDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes registrar tu propia ubicacion');
    }
    return this.gpsService.create(
      {
        ...createGpsDto,
        usuarioId: user.id,
      },
      companyId,
    );
  }

  @Get('me')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE] })
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
    @CurrentCompanyId() companyId: number | null,
    @Query('date') date?: string,
    @Query('userId') userId?: string,
  ) {
    const pedido = userId ? Number(userId) : user.id;
    const targetId = Number.isFinite(pedido) && pedido > 0 ? pedido : user.id;
    // Incluido el recorrido propio: el permiso lo decide el servicio (solo dirección).
    return this.gpsService.getTrajectoryForUser(user, targetId, date, companyId);
  }

  @Get('team')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_MANAGE] })
  findTeam(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.gpsService.findTeamLocations(user, companyId);
  }

  @Patch('consent')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE] })
  updateConsent(@CurrentUser() user: any, @Body() body: { enabled?: boolean }) {
    return this.gpsService.updateConsent(user.id, Boolean(body.enabled));
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.GPS_VIEW] })
  async findOne(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id') id: string,
  ) {
    // Acotado a la empresa de quien pregunta: antes el id de otra empresa
    // devolvía su punto con el usuario dentro.
    const location = await this.gpsService.findOneWithUser(+id, companyId);
    if (!location) return null;

    if (location.usuarioId === user.id) return location;

    // Ubicación ajena: solo dirección (contrato del viernes 18-09, sección A).
    if (!puedeVerGpsDireccion(user)) {
      throw new ForbiddenException('El GPS en vivo del equipo es solo para dirección');
    }

    if (!location.usuario?.locationConsent) {
      throw new ForbiddenException('El usuario no comparte su ubicacion');
    }

    return location;
  }
}
