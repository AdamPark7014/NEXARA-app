import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CotizacionAbiertaService, type ActorAbierta } from './cotizacion-abierta.service.js';

class PedirApoyoDto {
  @Type(() => Number) @IsInt() @Min(1) userId!: number;
  @IsOptional() @IsString() @MaxLength(1000) nota?: string | null;
}

class GuardarPartidasDto {
  @IsString() @MaxLength(40) version!: string;
  /** Se revisan y limpian en `mezclarPartidas`. */
  @IsArray() partidas!: Array<{ id?: number | null; name?: string; unit?: string | null; qty?: number; unitPrice?: number }>;
}

/** Quién entra lo decide el servicio, por persona y actividad: quien la trabaja no tiene el módulo. */
@Controller()
@UseGuards(UrlAccessGuard)
export class CotizacionAbiertaController {
  constructor(private readonly service: CotizacionAbiertaService) {}

  @Post('cotizaciones/:id/pedir-apoyo')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  pedirApoyo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PedirApoyoDto,
    @CurrentUser() user: ActorAbierta,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.pedirApoyo(id, dto, user, companyId);
  }

  @Get('activities/:id/cotizacion-abierta')
  leer(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ActorAbierta, @CurrentCompanyId() companyId: number | null) {
    return this.service.leer(id, user, companyId);
  }

  @Put('activities/:id/cotizacion-abierta')
  guardar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarPartidasDto,
    @CurrentUser() user: ActorAbierta,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.guardar(id, dto, user, companyId);
  }

  @Post('activities/:id/cotizacion-abierta/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ActorAbierta, @CurrentCompanyId() companyId: number | null) {
    return this.service.cerrar(id, user, companyId);
  }
}
