import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesLeadDto } from './dto/create-sales-lead.dto.js';
import { UpdateSalesLeadDto } from './dto/update-sales-lead.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { SalesPaginationQueryDto } from './dto/sales-pagination-query.dto.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/leads')
export class VentasLeadsController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(
    @Body() dto: CreateSalesLeadDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const created = await this.ventasService.createLead(dto, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'lead.create',
      entityType: 'lead',
      entityId: created.id,
      actorId: user?.id,
      companyId,
      metadata: { status: created.status, source: created.source || null },
    });
    return created;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query() query: SalesPaginationQueryDto,
  ) {
    return this.ventasService.listLeads(user, query.ownerId, query, companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getLead(id, user, companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesLeadDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const updated = await this.ventasService.updateLead(id, dto, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'lead.update',
      entityType: 'lead',
      entityId: updated.id,
      actorId: user?.id,
      companyId,
      metadata: { status: updated.status },
    });
    return updated;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const removed = await this.ventasService.deleteLead(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'lead.delete',
      entityType: 'lead',
      entityId: removed.id,
      actorId: user?.id,
      companyId,
    });
    return removed;
  }
}
