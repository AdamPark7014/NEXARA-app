import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('expenses')
@UseGuards(UrlAccessGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  create(@CurrentUser() user: any, @Body() body: CreateExpenseDto & Record<string, unknown>) {
    if (body.concepto && body.monto !== undefined) {
      return this.expensesService.createAdministrative({
        usuarioId: Number(body.usuarioId ?? user.id),
        concepto: String(body.concepto),
        monto: Number(body.monto),
        categoria: body.categoria ? String(body.categoria) : undefined,
        estado: body.estado ? String(body.estado) : undefined,
        esRecurrente: Boolean(body.esRecurrente),
        fecha: body.fecha ? String(body.fecha) : undefined,
        actividadId: body.actividadId ? Number(body.actividadId) : undefined,
      });
    }
    if (!user.isSuperAdmin && body.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes crear tus propios gastos');
    }
    return this.expensesService.create(body);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    if (user.isSuperAdmin) {
      return this.expensesService.findAll(query);
    } else {
      return this.expensesService.findByDepartment(user.departmentId, query);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  findOne(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  update(
    @CurrentUser() _user: any,
    @Param('id') id: string,
    @Body() body: UpdateExpenseDto & Record<string, unknown>,
  ) {
    if (body.concepto !== undefined || body.monto !== undefined || body.categoria !== undefined) {
      return this.expensesService.updateAdministrative(+id, {
        concepto: body.concepto ? String(body.concepto) : undefined,
        monto: body.monto !== undefined ? Number(body.monto) : undefined,
        categoria: body.categoria ? String(body.categoria) : undefined,
        estado: body.estado ? String(body.estado) : undefined,
        esRecurrente: body.esRecurrente !== undefined ? Boolean(body.esRecurrente) : undefined,
        fecha: body.fecha ? String(body.fecha) : undefined,
      });
    }
    return this.expensesService.update(+id, body);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  remove(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.remove(+id);
  }
}
