import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesProjectDto } from './dto/create-sales-project.dto.js';
import { UpdateSalesProjectDto } from './dto/update-sales-project.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { Response } from 'express';

@Controller('ventas/proyectos')
export class VentasProyectosController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  create(@Body() dto: CreateSalesProjectDto, @CurrentUser() user: any) {
    return this.ventasService.createProject(dto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll(@CurrentUser() user: any) {
    return this.ventasService.listProjects(user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesProjectDto, @CurrentUser() user: any) {
    return this.ventasService.updateProject(id, dto, user);
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  closeProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.closeProject(id, user);
  }

  @Get(':id/orden')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  getOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectOrder(id, user);
  }

  @Get(':id/viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  getProjectViaticos(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectViaticos(id, user);
  }

  @Post(':id/viaticos/assign')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  assignViaticosToProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { viaticIds: number[] },
    @CurrentUser() user: any,
  ) {
    return this.ventasService.assignViaticosToProject(id, body.viaticIds, user);
  }

  @Post('viaticos/:id/unassign')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  unassignViaticFromProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.unassignViaticFromProject(id, user);
  }

  @Get(':id/expenses')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  getProjectExpensesSummary(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectExpensesSummary(id, user);
  }

  @Get(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  calculateProjectCosts(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.calculateProjectCosts(id, user);
  }

  @Patch(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  updateProjectCosts(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { costProducts?: number; costViaticos?: number; costOperativo?: number },
    @CurrentUser() user: any,
  ) {
    return this.ventasService.updateProjectCosts(id, body, user);
  }

  @Get(':id/validar-presupuesto')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  validateProjectBudget(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.validateProjectBudget(id, user);
  }

  @Post(':id/sync-viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  syncViaticosToProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.syncViaticosToProject(id, user);
  }
}
