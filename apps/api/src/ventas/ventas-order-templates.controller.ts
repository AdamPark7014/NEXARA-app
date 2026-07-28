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
import { CreateOrderTemplateDto } from './dto/create-order-template.dto.js';
import { UpdateOrderTemplateDto } from './dto/update-order-template.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_TEMPLATE_ACCESS = [PERMISSIONS.SALES_TEMPLATES_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/order-templates')
export class VentasOrderTemplatesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async create(
    @Body() dto: CreateOrderTemplateDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const template = await this.ventasService.createOrderTemplate(dto, user?.id, companyId);
    await this.ventasService.createAuditEvent({
      action: 'template.create',
      entityType: 'template',
      entityId: template.id,
      actorId: user?.id,
      metadata: { name: template.name },
    });
    return template;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.ventasService.listOrderTemplates(query, companyId);
  }

  @Get('default')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getDefault(@CurrentCompanyId() companyId: number | null) {
    return this.ventasService.getDefaultOrderTemplate(companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.ventasService.getOrderTemplate(id, companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderTemplateDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const template = await this.ventasService.updateOrderTemplate(id, dto, companyId);
    await this.ventasService.createAuditEvent({
      action: 'template.update',
      entityType: 'template',
      entityId: template.id,
      actorId: user?.id,
      metadata: { name: template.name },
    });
    return template;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const deleted = await this.ventasService.deleteOrderTemplate(id, companyId);
    await this.ventasService.createAuditEvent({
      action: 'template.delete',
      entityType: 'template',
      entityId: deleted.id,
      actorId: user?.id,
    });
    return deleted;
  }

  @Post(':id/set-default')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async setAsDefault(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const template = await this.ventasService.setOrderTemplateAsDefault(id, companyId);
    await this.ventasService.createAuditEvent({
      action: 'template.set.default',
      entityType: 'template',
      entityId: template.id,
      actorId: user?.id,
      metadata: { name: template.name },
    });
    return template;
  }
}
