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

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/cotizaciones')
export class VentasCotizacionesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
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
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.getCotizacionDetail(id);
  }

  @Post(':cotizacionId/link/:opportunityId')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async linkToOpportunity(
    @Param('cotizacionId', ParseIntPipe) cotizacionId: number,
    @Param('opportunityId', ParseIntPipe) opportunityId: number,
    @CurrentUser() user: any,
    @Body() dto?: { versionLabel?: string },
  ) {
    const linked = await this.ventasService.linkCotizacionToOpportunity(cotizacionId, opportunityId, user, dto?.versionLabel);
    await this.ventasService.createAuditEvent({
      action: 'quote.link.opportunity',
      entityType: 'quote',
      entityId: cotizacionId,
      actorId: user?.id,
      metadata: { opportunityId, salesQuoteId: linked?.id || null },
    });
    return linked;
  }

  @Post('generar-pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async generateQuotePdf(
    @Body() body: { opportunityQuoteId: number; clientId: number; templateId?: number },
    @CurrentUser() user: any,
  ) {
    const result = await this.ventasService.generateQuotePdfDynamic(body.opportunityQuoteId, body.clientId, body.templateId, user);
    await this.ventasService.createAuditEvent({
      action: 'quote.pdf.generate',
      entityType: 'quote',
      entityId: body.opportunityQuoteId,
      actorId: user?.id,
      metadata: { clientId: body.clientId, templateId: body.templateId || null },
    });
    return result;
  }
}
