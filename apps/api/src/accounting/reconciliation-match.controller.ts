/**
 * NEXARA · Conciliación bancaria — endpoints de sugerencias.
 *
 *   GET  /accounting/workspace/conciliacion/sugerencias
 *   POST /accounting/workspace/conciliacion/aplicar
 *
 * Ambos van por `UrlAccessGuard` + `RbacGuard` como el resto de contabilidad.
 * Ver el match confirmado escribe: por eso `aplicar` exige `banking.reconcile`.
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ReconciliationMatchService, type CandidateKind } from './reconciliation-match.service.js';

export class ConciliacionSugerenciasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Tolerancia absoluta de monto en pesos. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  tolerancia?: number;

  /** Ventana de fecha ±N días. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  dias?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limite?: number;
}

export class AplicarConciliacionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transactionId!: number;

  @IsIn(['INVOICE', 'PAYMENT'])
  candidateKind!: CandidateKind;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  candidateId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

@Controller('accounting/workspace/conciliacion')
@UseGuards(UrlAccessGuard)
export class ReconciliationMatchController {
  constructor(private readonly service: ReconciliationMatchService) {}

  @Get('sugerencias')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.BANKING_VIEW,
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  sugerencias(
    @Query() query: ConciliacionSugerenciasQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getSuggestions(
      {
        accountId: query.accountId ?? null,
        from: query.from,
        to: query.to,
        tolerancia: query.tolerancia,
        dias: query.dias,
        limite: query.limite,
      },
      companyId,
    );
  }

  @Post('aplicar')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_RECONCILE] })
  aplicar(
    @Body() dto: AplicarConciliacionDto,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.applyMatch(
      {
        transactionId: dto.transactionId,
        candidateKind: dto.candidateKind,
        candidateId: dto.candidateId,
        score: dto.score,
        notes: dto.notes,
      },
      user.id,
      companyId,
    );
  }
}
