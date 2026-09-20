import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { VehicleGpsService } from './vehicle-gps.service.js';

/**
 * GPS de la flotilla. Toda la puerta la cuida el servicio con
 * `puedeVerGpsDireccion`: ningún permiso de consola abre esto, y por eso no
 * hay `@RBAC` con permisos aquí — un `vehicles.review` o un `gps.manage` no
 * deben alcanzar. El guard solo exige sesión.
 */
@Controller('vehicle-gps')
@UseGuards(RbacGuard)
export class VehicleGpsController {
  constructor(private readonly gps: VehicleGpsService) {}

  @Get('estado')
  estado(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.gps.estado(user, companyId);
  }

  @Get('posiciones')
  posiciones(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.gps.posiciones(user, companyId);
  }

  @Post('sincronizar')
  sincronizar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.gps.sincronizar(user, companyId);
  }

  @Get(':id/recorrido')
  recorrido(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('fecha') fecha: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const dia = fecha || new Date().toISOString().slice(0, 10);
    return this.gps.recorrido(user, +id, dia, companyId);
  }
}
