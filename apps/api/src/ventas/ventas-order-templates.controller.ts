import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateOrderTemplateDto } from './dto/create-order-template.dto.js';
import { UpdateOrderTemplateDto } from './dto/update-order-template.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_TEMPLATE_ACCESS = [PERMISSIONS.SALES_TEMPLATES_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/order-templates')
export class VentasOrderTemplatesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async create(@Body() dto: CreateOrderTemplateDto, @CurrentUser() user: any) {
    const template = await this.ventasService.createOrderTemplate(dto, user?.id);
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
  findAll() {
    return this.ventasService.listOrderTemplates();
  }

  @Get('default')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getDefault() {
    return this.ventasService.getDefaultOrderTemplate();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.getOrderTemplate(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_TEMPLATE_ACCESS })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderTemplateDto, @CurrentUser() user: any) {
    const template = await this.ventasService.updateOrderTemplate(id, dto);
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
  async delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const deleted = await this.ventasService.deleteOrderTemplate(id);
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
  async setAsDefault(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const template = await this.ventasService.setOrderTemplateAsDefault(id);
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
