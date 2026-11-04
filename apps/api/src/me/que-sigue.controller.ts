import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { LARGO_PENDIENTE } from './que-sigue.js';
import { QueSigueService } from './que-sigue.service.js';

class EmpezarSugerenciaDto {
  @IsString()
  @MaxLength(80)
  clave!: string;
}

class NuevoPendienteDto {
  @IsString()
  @MaxLength(LARGO_PENDIENTE + 50)
  texto!: string;
}

/** «¿Qué sigue?» y Mis pendientes: siempre de quien pregunta. */
@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class QueSigueController {
  constructor(private readonly service: QueSigueService) {}

  private viewer(user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) throw new UnauthorizedException('Token de usuario inválido');
    return {
      id: Number(user.id),
      roleKey: user.roleKey ?? null,
      email: user.email ?? null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      permissions: user.permissions ?? [],
    };
  }

  @Get('que-sigue')
  queSigue(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.queSigue(this.viewer(user), companyId);
  }

  @Post('que-sigue/empezar')
  empezar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: EmpezarSugerenciaDto) {
    return this.service.empezar(this.viewer(user), companyId, body.clave);
  }

  @Get('pendientes')
  pendientes(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.listarPendientes(this.viewer(user), companyId);
  }

  @Post('pendientes')
  agregar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: NuevoPendienteDto) {
    return this.service.agregarPendiente(this.viewer(user), companyId, body.texto);
  }

  @Post('pendientes/:id/hecho')
  palomear(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.palomearPendiente(this.viewer(user), companyId, id);
  }

  @Post('pendientes/:id/empezar')
  empezarPendiente(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.empezarPendiente(this.viewer(user), companyId, id);
  }

  @Delete('pendientes/:id')
  borrar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.borrarPendiente(this.viewer(user), companyId, id);
  }
}
