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

@Controller('ventas/order-templates')
export class VentasOrderTemplatesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  create(@Body() dto: CreateOrderTemplateDto, @CurrentUser() user: any) {
    return this.ventasService.createOrderTemplate(dto, user?.id);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll() {
    return this.ventasService.listOrderTemplates();
  }

  @Get('default')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  getDefault() {
    return this.ventasService.getDefaultOrderTemplate();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.getOrderTemplate(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderTemplateDto) {
    return this.ventasService.updateOrderTemplate(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.deleteOrderTemplate(id);
  }

  @Post(':id/set-default')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  setAsDefault(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.setOrderTemplateAsDefault(id);
  }
}
