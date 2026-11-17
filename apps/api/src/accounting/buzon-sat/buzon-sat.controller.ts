import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { BuzonSatService } from './buzon-sat.service.js';
import { PolizaPropuestaService } from './poliza-propuesta.service.js';
import { FacturaIaService } from './factura-ia.service.js';
import { E2E4ContabilidadService } from './e2-e4.service.js';
import type { RenglonPoliza } from '../mesa-contable/polizas-mesa.js';

const VER = [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.INVOICING_VIEW];
const MANAGE = [PERMISSIONS.CONTABILIDAD_MANAGE, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.INVOICING_MANAGE];

class XmlDto {
  @IsString()
  @MaxLength(2_000_000)
  xml!: string;
}

class CorregirDto {
  @IsString()
  @MaxLength(40)
  cuentaGastoCodigo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  centroCosto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  explicacion?: string;
}

class AceptarDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cuentaGastoCodigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  centroCosto?: string;

  @IsOptional()
  renglones?: RenglonPoliza[];
}

class ArmarFacturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  texto?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cotizacionId?: number;
}

@Controller('accounting/buzon-sat')
@UseGuards(UrlAccessGuard, RbacGuard)
export class BuzonSatController {
  constructor(
    private readonly buzon: BuzonSatService,
    private readonly polizas: PolizaPropuestaService,
    private readonly facturaIa: FacturaIaService,
    private readonly e2e4: E2E4ContabilidadService,
  ) {}

  @Get()
  @RBAC({ anyPermissions: VER })
  listar(
    @CurrentCompanyId() companyId: number | null,
    @Query('pestana') pestana?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('q') q?: string,
  ) {
    return this.buzon.listar(companyId, { pestana, desde, hasta, q });
  }

  @Get('excel')
  @RBAC({ anyPermissions: VER })
  async excel(
    @CurrentCompanyId() companyId: number | null,
    @Query('pestana') pestana?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Res() res?: Response,
  ) {
    const { buffer, nombre } = await this.buzon.excel(companyId, { pestana, desde, hasta });
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res!.send(buffer);
  }

  @Post('importar-xml')
  @RBAC({ anyPermissions: MANAGE })
  importar(
    @Body() dto: XmlDto,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: { id: number },
  ) {
    return this.buzon.importarXml(companyId, dto.xml, user.id);
  }

  @Post('lista-69b')
  @RBAC({ anyPermissions: MANAGE })
  lista69b(@Body() body: { csv?: string }) {
    return this.buzon.actualizarLista69B(body?.csv);
  }

  @Post('correr-ahora')
  @RBAC({ anyPermissions: MANAGE })
  correr(@CurrentCompanyId() companyId: number | null) {
    return this.buzon.correrDescargaAutomatica(companyId ?? undefined);
  }

  @Get('por-contabilizar')
  @RBAC({ anyPermissions: VER })
  porContabilizar(@CurrentCompanyId() companyId: number | null) {
    return this.polizas.listarPendientes(companyId);
  }

  @Post('por-contabilizar/:id/aceptar')
  @RBAC({ anyPermissions: MANAGE })
  aceptar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AceptarDto,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: { id: number },
  ) {
    return this.polizas.aceptar(companyId, id, user.id, body);
  }

  @Post('por-contabilizar/aceptar-alta')
  @RBAC({ anyPermissions: MANAGE })
  aceptarAlta(@CurrentCompanyId() companyId: number | null, @CurrentUser() user: { id: number }) {
    return this.polizas.aceptarAltaConfianza(companyId, user.id);
  }

  @Post('por-contabilizar/:id/corregir')
  @RBAC({ anyPermissions: MANAGE })
  corregir(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CorregirDto,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: { id: number },
  ) {
    return this.polizas.corregir(companyId, id, user.id, body);
  }

  @Post('armar-factura')
  @RBAC({ anyPermissions: MANAGE })
  armarFactura(
    @Body() body: ArmarFacturaDto,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: { id: number },
  ) {
    return this.facturaIa.armarBorrador(companyId, user.id, body);
  }

  @Get('cruces')
  @RBAC({ anyPermissions: VER })
  cruces(@CurrentCompanyId() companyId: number | null) {
    return this.e2e4.cruces(companyId);
  }

  @Get('mi-cierre')
  @RBAC({ anyPermissions: VER })
  miCierre(@CurrentCompanyId() companyId: number | null) {
    return this.e2e4.miCierre(companyId);
  }

  @Get('plantillas-poliza')
  @RBAC({ anyPermissions: VER })
  listarPlantillas(@CurrentCompanyId() companyId: number | null) {
    return this.e2e4.listarPlantillas(companyId);
  }

  @Post('plantillas-poliza')
  @RBAC({ anyPermissions: MANAGE })
  guardarPlantilla(
    @Body() body: { tipo: string; nombre: string; renglones: unknown },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.e2e4.guardarPlantilla(companyId, body);
  }

  @Get('ppd')
  @RBAC({ anyPermissions: VER })
  tableroPpd(@CurrentCompanyId() companyId: number | null) {
    return this.e2e4.tableroPpd(companyId);
  }

  @Get('polizas-xml')
  @RBAC({ anyPermissions: VER })
  async exportXml(
    @CurrentCompanyId() companyId: number | null,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Res() res?: Response,
  ) {
    const m = Number(mes) || new Date().getMonth() + 1;
    const a = Number(anio) || new Date().getFullYear();
    const xml = await this.e2e4.exportPolizasXml(companyId, m, a);
    res!.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="polizas-${a}-${String(m).padStart(2, '0')}.xml"`);
    res!.send(xml);
  }
}
