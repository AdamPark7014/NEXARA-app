import {
  Controller,
  Delete,
  Get,
  Header,
  GoneException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { WorkProjectsService } from './work-projects.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { OcultarMontosInterceptor } from '../common/visibilidad/ocultar-montos.interceptor.js';

/** @deprecated Use OperationalProject (/operational-projects). Read-only for legacy data. */
@Controller('work-projects')
@UseInterceptors(OcultarMontosInterceptor)
export class WorkProjectsController {
  constructor(private readonly service: WorkProjectsService) {}

  private rejectWrites(): never {
    throw new GoneException(
      'Este módulo se retiró: usa Proyectos',
    );
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get()
  @Header('X-Module-Notice', 'Este módulo se retiró: usa Proyectos')
  findAll(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.findAll(query, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get(':id')
  @Header('X-Module-Notice', 'Este módulo se retiró: usa Proyectos')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.findOne(id, companyId);
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
