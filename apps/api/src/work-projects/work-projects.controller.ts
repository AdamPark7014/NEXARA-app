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
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { WorkProjectsService } from './work-projects.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateWorkProjectDto } from './dto/create-work-project.dto.js';
import { UpdateWorkProjectDto } from './dto/update-work-project.dto.js';
import { CreateWorkProjectExpenseDto } from './dto/create-work-project-expense.dto.js';
import { CreateWorkProjectPayrollDto } from './dto/create-work-project-payroll.dto.js';
import { CreateWorkProjectLogDto } from './dto/create-work-project-log.dto.js';

@Controller('work-projects')
export class WorkProjectsController {
  constructor(private readonly service: WorkProjectsService) {}

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.service.findAll(query);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post()
  create(@Body() dto: CreateWorkProjectDto) {
    return this.service.create(dto);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkProjectDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/expenses')
  addExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWorkProjectExpenseDto,
  ) {
    return this.service.addExpense(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/payroll')
  addPayroll(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWorkProjectPayrollDto,
  ) {
    return this.service.addPayroll(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/logs')
  addLog(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWorkProjectLogDto,
  ) {
    return this.service.addLog(id, dto);
  }
}
