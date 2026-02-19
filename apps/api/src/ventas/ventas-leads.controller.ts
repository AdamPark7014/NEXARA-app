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
import { CreateSalesLeadDto } from './dto/create-sales-lead.dto.js';
import { UpdateSalesLeadDto } from './dto/update-sales-lead.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('ventas/leads')
export class VentasLeadsController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  create(@Body() dto: CreateSalesLeadDto, @CurrentUser() user: any) {
    return this.ventasService.createLead(dto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll(@CurrentUser() user: any) {
    return this.ventasService.listLeads(user);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getLead(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesLeadDto, @CurrentUser() user: any) {
    return this.ventasService.updateLead(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.deleteLead(id, user);
  }
}
