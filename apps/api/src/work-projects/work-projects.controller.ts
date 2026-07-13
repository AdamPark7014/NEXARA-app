import {
  Controller,
  Delete,
  Get,
  GoneException,
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

/** @deprecated Use OperationalProject (/operational-projects). Read-only for legacy data. */
@Controller('work-projects')
export class WorkProjectsController {
  constructor(private readonly service: WorkProjectsService) {}

  private rejectWrites(): never {
    throw new GoneException(
      'work-projects está deprecado. Usa operational-projects (OPS) y sales-projects (CRM).',
    );
  }

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
  create() {
    return this.rejectWrites();
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id')
  update() {
    return this.rejectWrites();
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete(':id')
  remove() {
    return this.rejectWrites();
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/expenses')
  addExpense() {
    return this.rejectWrites();
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/payroll')
  addPayroll() {
    return this.rejectWrites();
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post(':id/logs')
  addLog() {
    return this.rejectWrites();
  }
}
