import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { MedidasDisciplinariasService } from './medidas-disciplinarias.service.js';

@Controller('hr/medidas-disciplinarias')
@UseGuards(AuthGuard('jwt'), UrlAccessGuard, RbacGuard)
export class MedidasDisciplinariasController {
  constructor(private readonly service: MedidasDisciplinariasService) {}

  @RBAC({})
  @Get()
  listar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId?: string,
  ) {
    return this.service.listar(user, companyId, userId ? Number(userId) : undefined);
  }

  @RBAC({})
  @Get('desempeno/:userId')
  desempeno(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.tableroDesempeno(user, companyId, userId);
  }

  @RBAC({})
  @Post()
  crear(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.service.crear(user, companyId, body ?? {});
  }

  @RBAC({})
  @Patch(':id/estado')
  estado(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: string,
  ) {
    return this.service.actualizarEstado(user, companyId, id, String(estado ?? ''));
  }
}
