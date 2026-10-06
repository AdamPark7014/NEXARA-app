import type { Response } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import { esSuperAdmin } from '../common/tenant/module-policy.js';
import { ControlNominaService } from './control-nomina.service.js';
import { nombreArchivoControl } from './control-nomina-excel.js';
import {
  AceptarSugeridosControlDto,
  ActualizarFilaControlDto,
  AjustarDiaControlDto,
  CrearDescuentoControlDto,
  ReabrirSemanaControlDto,
  SemanaControlDto,
} from './dto/control-nomina.dto.js';

/**
 * Control de nómina semanal (`/api/employee-payments/control-semanal`).
 *
 * Ver: quien lleva contabilidad (CONTABILIDAD_VIEW/MANAGE) y RH (HR_MANAGE). Los montos solo los
 * ve quien tiene permiso contable y además la política del módulo `employee-payments` le deja
 * usar «Pagos a personal» (en NEXARA, solo el CEO); el resto recibe horas y lugares con los
 * montos en null. Editar, cerrar y reabrir: CONTABILIDAD_MANAGE + la misma política.
 *
 * La política va dentro de cada endpoint y no en un guard porque la empresa activa la resuelve
 * el `TenantInterceptor`, que corre después de los guards (igual que en Pagos a empleados).
 */
@Controller('employee-payments/control-semanal')
export class ControlNominaController {
  constructor(
    private readonly service: ControlNominaService,
    private readonly policy: ModulePolicyService,
  ) {}

  private viewer(user: any) {
    return {
      id: Number(user?.id),
      roleKey: user?.roleKey ?? null,
      email: user?.email ?? null,
      isSuperAdmin: Boolean(user?.isSuperAdmin),
    };
  }

  private actor(user: any) {
    return { id: Number(user?.id) || 0, nombre: user?.nombre ?? null };
  }

  /** Qué puede hacer quien consulta: ver montos y editar. */
  private async acceso(user: any, companyId: number | null) {
    const permisos: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
    const superAdmin = esSuperAdmin(user);
    const modulo = await this.policy.puedeUsar('employee-payments', user, companyId);
    const contable =
      superAdmin ||
      permisos.includes(PERMISSIONS.CONTABILIDAD_VIEW) ||
      permisos.includes(PERMISSIONS.CONTABILIDAD_MANAGE);
    return {
      verMontos: modulo && contable,
      puedeEditar: modulo && (superAdmin || permisos.includes(PERMISSIONS.CONTABILIDAD_MANAGE)),
    };
  }

  private gate(user: any, companyId: number | null) {
    return this.policy.exigir('employee-payments', user, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.CONTABILIDAD_MANAGE, PERMISSIONS.HR_MANAGE],
  })
  @Get()
  async consultar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('semana') semana?: string,
  ) {
    if (!semana) throw new BadRequestException('semana es obligatoria (AAAA-MM-DD, el lunes)');
    return this.service.consultar(this.viewer(user), companyId, semana, await this.acceso(user, companyId));
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.CONTABILIDAD_MANAGE, PERMISSIONS.HR_MANAGE],
  })
  @Get('export.xlsx')
  async exportar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('semana') semana?: string,
  ) {
    if (!semana) throw new BadRequestException('semana es obligatoria (AAAA-MM-DD, el lunes)');
    const { buffer, lunes } = await this.service.excel(this.viewer(user), companyId, semana, {
      ...(await this.acceso(user, companyId)),
      generadoPor: user?.nombre ?? null,
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="${nombreArchivoControl(lunes)}"`);
    return res.send(buffer);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch('dia')
  async ajustarDia(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: AjustarDiaControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.ajustarDia(this.viewer(user), this.actor(user), companyId, body);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch('fila')
  async actualizarFila(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: ActualizarFilaControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.actualizarFila(this.viewer(user), this.actor(user), companyId, body);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post('descuentos/sugeridos/aceptar')
  async aceptarSugeridos(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: AceptarSugeridosControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.aceptarSugeridos(this.viewer(user), this.actor(user), companyId, body);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post('descuentos')
  async crearDescuento(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CrearDescuentoControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.crearDescuento(this.viewer(user), this.actor(user), companyId, body);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete('descuentos/:id')
  async borrarDescuento(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.gate(user, companyId);
    return this.service.borrarDescuento(this.viewer(user), this.actor(user), companyId, id);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post('cerrar')
  async cerrar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: SemanaControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.cerrar(this.viewer(user), this.actor(user), companyId, body);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post('reabrir')
  async reabrir(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: ReabrirSemanaControlDto,
  ) {
    await this.gate(user, companyId);
    return this.service.reabrir(this.actor(user), companyId, body);
  }
}
