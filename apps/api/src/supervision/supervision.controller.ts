import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { SupervisionService } from './supervision.service.js';

@Controller('supervision')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SupervisionController {
  constructor(private readonly service: SupervisionService) {}

  private sesion(req: any) {
    const u = req?.user ?? {};
    return { id: Number(u.id), email: u.email, roleKey: u.roleKey, isSuperAdmin: Boolean(u.isSuperAdmin), isClient: Boolean(u.isClient), isBranchUser: Boolean(u.isBranchUser), nombre: u.nombre };
  }

  @RBAC({})
  @Post('plan')
  enviar(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Body() body: { fecha?: string; texto?: string }) {
    return this.service.enviarPlan(this.sesion(req), companyId, body ?? {});
  }

  @RBAC({})
  @Get('planes')
  listar(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Query('fecha') fecha?: string) {
    return this.service.listarPlanes(this.sesion(req), companyId, fecha);
  }

  @RBAC({})
  @Post('plan/:id/programado')
  programado(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.programarPlan(this.sesion(req), companyId, id);
  }

  @RBAC({})
  @Post('plan/:id/devolver')
  devolver(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number, @Body() body: { nota?: string }) {
    return this.service.devolverPlan(this.sesion(req), companyId, id, body?.nota);
  }

  @RBAC({})
  @Get('cierre')
  cierre(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Query('fecha') fecha?: string) {
    return this.service.resumenCierre(this.sesion(req), companyId, fecha);
  }

  @RBAC({})
  @Post('cierre')
  entregar(@Req() req: any, @CurrentCompanyId() companyId: number | null, @Body() body: { fecha?: string; comentario?: string }) {
    return this.service.entregarCierre(this.sesion(req), companyId, body ?? {});
  }
}