import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CotizacionesService } from './cotizaciones.service.js';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto.js';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';
import { SendCotizacionDto } from './dto/send-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('cotizaciones')
@UseGuards(UrlAccessGuard)
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.create(dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.cotizacionesService.findAll(query, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.findOne(id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Put(':id')
  update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.update(id, dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/send')
  send(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.send(id, dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  // Quien puede ver la cotización (SALES_VIEW) también puede descargar su PDF
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS] })
  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const pdf = await this.cotizacionesService.getPdfBuffer(id, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion-${id}.pdf`);
    res.send(pdf);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get(':id/pdf/internal')
  async downloadInternalPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const pdf = await this.cotizacionesService.getInternalPdfBuffer(id, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion-${id}-interno.pdf`);
    res.send(pdf);
  }

  @Get('public/:token')
  getPublic(@Param('token') token: string) {
    return this.cotizacionesService.getPublicByToken(token);
  }

  @Post('public/:token/sign')
  signPublic(@Param('token') token: string, @Body() dto: SignCotizacionDto) {
    return this.cotizacionesService.signByToken(token, dto);
  }
}
