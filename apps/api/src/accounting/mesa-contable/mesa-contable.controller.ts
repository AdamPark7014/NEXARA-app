import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { PorFacturarService } from './por-facturar.service.js';
import { PagosGastosService } from './pagos-gastos.service.js';
import { EstadosFinancierosService } from './estados-financieros.service.js';
import { RevisionFacturaService } from './revision-factura.service.js';

class OrigenDto {
  @IsString()
  origen!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  origenId!: number;
}

class DescartarDto extends OrigenDto {
  @IsString()
  @MaxLength(300)
  motivo!: string;
}

class CfdiRecibidoDto {
  /** El XML como texto (la pantalla lee el archivo y lo manda). */
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  xml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  uuid?: string;
}

class LigarBancoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bankTransactionId!: number;
}

const VER = [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.INVOICING_VIEW];

/**
 * Mesa contable: el espacio de la contadora (por facturar, pagos y gastos, estados financieros).
 * Ver `.ai/RELEVO.md` del 29-10-2026 y el mockup aprobado.
 */
@Controller('accounting/workspace/mesa')
@UseGuards(UrlAccessGuard, RbacGuard)
export class MesaContableController {
  constructor(
    private readonly porFacturar: PorFacturarService,
    private readonly pagosGastos: PagosGastosService,
    private readonly estados: EstadosFinancierosService,
    private readonly revision: RevisionFacturaService,
  ) {}

  @Get('resumen')
  @RBAC({ anyPermissions: VER })
  async resumen(@CurrentCompanyId() companyId: number | null) {
    const [porFacturar, pagosPendientes] = await Promise.all([
      this.porFacturar.resumenConteo(companyId),
      this.pagosGastos.conteoPendientes(companyId),
    ]);
    return { porFacturar, pagosPendientes };
  }

  // ── Por facturar ──
  @Get('por-facturar')
  @RBAC({ anyPermissions: VER })
  listarPorFacturar(@CurrentCompanyId() companyId: number | null, @Query('origen') origen?: string) {
    return this.porFacturar.listar(companyId, origen);
  }

  @Post('por-facturar/preparar')
  @RBAC({ anyPermissions: [PERMISSIONS.INVOICING_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  preparar(@Body() dto: OrigenDto, @CurrentUser() user: { id: number }, @CurrentCompanyId() companyId: number | null) {
    return this.porFacturar.preparar(dto, user.id, companyId);
  }

  @Post('por-facturar/descartar')
  @RBAC({ anyPermissions: [PERMISSIONS.INVOICING_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  descartar(@Body() dto: DescartarDto, @CurrentUser() user: { id: number }, @CurrentCompanyId() companyId: number | null) {
    return this.porFacturar.descartar(dto, user.id, companyId);
  }

  @Get('facturas/:id/revision')
  @RBAC({ anyPermissions: VER })
  revisarFactura(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.revision.revisar(companyId, id);
  }

  // ── Pagos y gastos ──
  @Get('pagos-gastos')
  @RBAC({ anyPermissions: VER })
  pagosYGastos(
    @CurrentCompanyId() companyId: number | null,
    @Query('mes') mes?: string,
    @Query('tipo') tipo?: string,
    @Query('soloPendientes') soloPendientes?: string,
  ) {
    return this.pagosGastos.listar(companyId, { mes, tipo, soloPendientes });
  }

  @Get('pagos-gastos/:origen/:origenId')
  @RBAC({ anyPermissions: VER })
  detalle(
    @Param('origen') origen: string,
    @Param('origenId', ParseIntPipe) origenId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.pagosGastos.detalle(companyId, origen, origenId);
  }

  @Post('pagos-gastos/:origen/:origenId/cfdi')
  @RBAC({ anyPermissions: [PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  ligarCfdi(
    @Param('origen') origen: string,
    @Param('origenId', ParseIntPipe) origenId: number,
    @Body() dto: CfdiRecibidoDto,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.pagosGastos.ligarCfdi(companyId, origen, origenId, dto, user.id);
  }

  @Post('pagos-gastos/:origen/:origenId/banco')
  @RBAC({ anyPermissions: [PERMISSIONS.BANKING_RECONCILE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  ligarBanco(
    @Param('origen') origen: string,
    @Param('origenId', ParseIntPipe) origenId: number,
    @Body() dto: LigarBancoDto,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.pagosGastos.ligarBanco(companyId, origen, origenId, dto.bankTransactionId, user.id);
  }

  @Post('pagos-gastos/:origen/:origenId/poliza')
  @RBAC({ anyPermissions: [PERMISSIONS.ACCOUNTING_POST, PERMISSIONS.CONTABILIDAD_MANAGE] })
  registrarPoliza(
    @Param('origen') origen: string,
    @Param('origenId', ParseIntPipe) origenId: number,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.pagosGastos.registrarPoliza(companyId, origen, origenId, user.id);
  }

  @Delete('vinculos/:id')
  @RBAC({ anyPermissions: [PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  quitarVinculo(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.pagosGastos.quitarVinculo(companyId, id);
  }

  // ── Estados financieros ──
  @Get('estados')
  @RBAC({ anyPermissions: VER })
  estadosFinancieros(
    @CurrentCompanyId() companyId: number | null,
    @Query('vista') vista?: string,
    @Query('periodo') periodo?: string,
    @Query('fecha') fecha?: string,
  ) {
    return vista === 'balance' ? this.estados.balance(companyId, fecha) : this.estados.resultados(companyId, periodo, fecha);
  }

  @Get('estados/excel')
  @RBAC({ anyPermissions: VER })
  async excel(
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('periodo') periodo?: string,
    @Query('fecha') fecha?: string,
  ) {
    const { buffer, nombre } = await this.estados.excel(companyId, periodo, fecha);
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="${nombre}"`);
    return res.send(buffer);
  }
}
