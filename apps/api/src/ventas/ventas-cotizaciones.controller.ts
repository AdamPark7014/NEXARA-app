import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('ventas/cotizaciones')
export class VentasCotizacionesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll(
    @Query('clientName') clientName?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ventasService.findCotizacionesForVentas(clientName, status, startDate, endDate);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.getCotizacionDetail(id);
  }

  @Post(':cotizacionId/link/:opportunityId')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  linkToOpportunity(
    @Param('cotizacionId', ParseIntPipe) cotizacionId: number,
    @Param('opportunityId', ParseIntPipe) opportunityId: number,
    @CurrentUser() user: any,
    @Body() dto?: { versionLabel?: string },
  ) {
    return this.ventasService.linkCotizacionToOpportunity(cotizacionId, opportunityId, user, dto?.versionLabel);
  }

  @Post('generar-pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  generateQuotePdf(
    @Body() body: { opportunityQuoteId: number; clientId: number; templateId?: number },
    @CurrentUser() user: any,
  ) {
    return this.ventasService.generateQuotePdfDynamic(body.opportunityQuoteId, body.clientId, body.templateId, user);
  }
}
