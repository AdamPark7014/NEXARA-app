import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PeriodCloseService } from './period-close.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

export class CerrarPeriodoDto {
  /**
   * Obligatoria solo cuando quedan puntos bloqueantes. El servicio exige un
   * mínimo de texto: "ok" no es una justificación.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificacion?: string;
}

/**
 * Cierre de periodo del escritorio de la contadora.
 *
 * Ver es de contabilidad; cerrar exige `accounting.close_period`, el mismo
 * permiso que ya protege `PATCH /accounting/accounts/fiscal-periods/:id/close`.
 * La empresa activa siempre viene del contexto de la petición, nunca del
 * cuerpo: el servicio la exige con `requireCompanyId`.
 */
@Controller('accounting/workspace/cierres')
@UseGuards(UrlAccessGuard)
export class PeriodCloseController {
  constructor(private readonly service: PeriodCloseService) {}

  @Get(':periodId/checklist')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACCOUNTING_VIEW,
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  checklist(
    @Param('periodId', ParseIntPipe) periodId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getChecklist(periodId, companyId);
  }

  @Post(':periodId/cerrar')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_CLOSE_PERIOD] })
  cerrar(
    @Param('periodId', ParseIntPipe) periodId: number,
    @Body() dto: CerrarPeriodoDto,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Req() req: Request,
  ) {
    return this.service.closePeriod(periodId, user.id, dto ?? {}, companyId, {
      ipAddress: this.clientIp(req),
      userAgent: req?.headers?.['user-agent']
        ? String(req.headers['user-agent']).slice(0, 500)
        : undefined,
    });
  }

  /** Detrás del proxy `req.ip` es el del proxy; la real va en x-forwarded-for. */
  private clientIp(req: Request): string | undefined {
    const forwarded = req?.headers?.['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req?.ip || '';
    const ip = String(raw).split(',')[0]?.trim();
    return ip || undefined;
  }
}
