import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { MEDIOS_ACEPTACION, type MedioAceptacion } from '../cotizaciones/hilo-negocio.js';
import { CotizacionGanadaService } from './cotizacion-ganada.service.js';

class GanarCotizacionDto {
  @IsOptional() @IsIn(MEDIOS_ACEPTACION as unknown as string[]) via?: MedioAceptacion;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) responsableId?: number;
  @IsOptional() @IsDateString() startDate?: string;
}

/** Vive aquí y no en cotizaciones porque crea un proyecto: `projects` conoce a `cotizaciones`, no al revés. */
@Controller('cotizaciones')
@UseGuards(RbacGuard)
export class CotizacionGanadaController {
  constructor(private readonly ganada: CotizacionGanadaService) {}

  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/ganar')
  ganar(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GanarCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ganada.ganar(id, dto, { id: Number(user?.id) }, companyId);
  }
}
