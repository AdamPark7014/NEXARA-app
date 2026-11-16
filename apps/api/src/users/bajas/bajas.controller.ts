import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { BajasService } from './bajas.service.js';

@Controller('users/bajas')
@UseGuards(AuthGuard('jwt'), UrlAccessGuard)
export class BajasController {
  constructor(private readonly bajas: BajasService) {}

  @Post()
  solicitar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.bajas.solicitar(user, body, Number(companyId));
  }

  @Get()
  listar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('estado') estado?: string,
  ) {
    return this.bajas.listar(user, Number(companyId), estado);
  }

  @Post(':id/aprobar')
  aprobar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.bajas.aprobar(user, id, Number(companyId));
  }

  @Post(':id/rechazar')
  rechazar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { motivo?: string },
  ) {
    return this.bajas.rechazar(user, id, String(body?.motivo ?? ''), Number(companyId));
  }

  @Post(':id/revertir')
  revertir(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.bajas.revertir(user, id, Number(companyId));
  }
}
