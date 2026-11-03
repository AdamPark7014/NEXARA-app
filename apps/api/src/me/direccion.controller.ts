import { Body, Controller, Get, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { DireccionService } from './direccion.service.js';

/** Hoy de dirección, Mi área y Obra. Quién abre cada una lo decide `DireccionService`. */
@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class DireccionController {
  constructor(private readonly service: DireccionService) {}

  private viewer(user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) throw new UnauthorizedException('Token de usuario inválido');
    return { id: Number(user.id), roleKey: user.roleKey ?? null, email: user.email ?? null, isSuperAdmin: Boolean(user.isSuperAdmin) };
  }

  @Get('direccion/hoy')
  hoy(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.hoy(this.viewer(user), companyId);
  }

  @Get('area')
  area(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Query('encargado') encargado?: string) {
    const id = Number(encargado);
    return this.service.area(this.viewer(user), companyId, Number.isInteger(id) && id > 0 ? id : null);
  }

  @Get('obra')
  obra(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.obra(this.viewer(user), companyId);
  }

  @Post('obra/ligar')
  ligar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { actividadIds?: unknown; projectId?: unknown },
  ) {
    return this.service.ligarObra(this.viewer(user), companyId, body);
  }
}
