import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { CargosPerdidaService } from './cargos-perdida.service.js';

@Controller('hr/cargos-perdida')
@UseGuards(AuthGuard('jwt'), UrlAccessGuard, RbacGuard)
export class CargosPerdidaController {
  constructor(private readonly service: CargosPerdidaService) {}

  @RBAC({})
  @Get()
  listar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Query('userId') userId?: string) {
    return this.service.listar(user, companyId, userId ? Number(userId) : undefined);
  }

  @RBAC({})
  @Post()
  crear(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.service.crear(user, companyId, body ?? {});
  }

  @RBAC({})
  @Patch(':id/conformidad')
  conformidad(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body('pdfUrl') pdfUrl: string,
  ) {
    return this.service.adjuntarConformidad(user, companyId, id, String(pdfUrl ?? ''));
  }

  @RBAC({})
  @Post(':id/enviar')
  enviar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.enviarADireccion(user, companyId, id);
  }

  @RBAC({})
  @Post(':id/decidir')
  decidir(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { accion?: 'aprobar' | 'rechazar'; motivo?: string },
  ) {
    return this.service.decidir(user, companyId, id, body ?? {});
  }

  @RBAC({})
  @Post('aplicar-semana')
  aplicar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body('semana') semana: string) {
    return this.service.aplicarSemana(user, companyId, String(semana ?? ''));
  }
}
