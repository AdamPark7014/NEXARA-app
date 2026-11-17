import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExpedienteService } from './expediente.service.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { RbacGuard, RBAC } from '../../common/rbac.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';

@Controller('hr/expediente')
@UseGuards(UrlAccessGuard, RbacGuard)
export class ExpedienteController {
  constructor(private readonly svc: ExpedienteService) {}

  @Get('alertas')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE] })
  alertas(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.alertas(user, Number(companyId));
  }

  @Get(':userId')
  @RBAC({})
  obtener(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.obtener(user, userId, Number(companyId));
  }

  @Post('cambios')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.HR_VIEW] })
  solicitarCambio(
    @Body() body: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.solicitarCambio(user, Number(companyId), body);
  }

  @Post('solicitudes/:id/decidir')
  @RBAC({})
  decidir(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { aprobar?: boolean; motivo?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (typeof body?.aprobar !== 'boolean') throw new BadRequestException('Indica si apruebas o rechazas la solicitud.');
    return this.svc.decidirYAplicar(user, id, Number(companyId), body.aprobar, body?.motivo);
  }

  @Patch(':userId/perfil')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.HR_VIEW] })
  actualizarPerfil(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { area?: string | null; contratoVenceAt?: string | null },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.actualizarAreaContrato(user, Number(companyId), userId, body ?? {});
  }

  @Patch(':userId/sensibles')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.HR_VIEW] })
  actualizarSensibles(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.actualizarSensibles(user, Number(companyId), userId, body ?? {});
  }

  @Post('documentos')
  @RBAC({})
  subirDocumento(
    @Body() body: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.subirDocumento(user, Number(companyId), body);
  }
}
