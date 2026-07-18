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
    const elevated =
      user.isSuperAdmin ||
      user.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE) ||
      user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);
    const usuarioId =
      elevated && body.usuarioId != null ? Number(body.usuarioId) : Number(user.id);

    if (body.concepto && body.monto !== undefined) {
      return this.expensesService.createAdministrative({
        usuarioId,
        concepto: String(body.concepto),
        monto: Number(body.monto),
        categoria: body.categoria ? String(body.categoria) : undefined,
        // No aceptar estado forged en create — siempre borrador/pendiente
        estado: 'BORRADOR',
        esRecurrente: Boolean(body.esRecurrente),
        fecha: body.fecha ? String(body.fecha) : undefined,
        actividadId: body.actividadId ? Number(body.actividadId) : undefined,
      });
    }
    if (!elevated && body.usuarioId != null && Number(body.usuarioId) !== Number(user.id)) {
      throw new ForbiddenException('Solo puedes crear tus propios gastos');
    }
    return this.expensesService.create({
      ...body,
      usuarioId,
      estatusPago: 'Pendiente',
    } as CreateExpenseDto);
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
      const { estado: _estado, ...rest } = body as any;
      return this.expensesService.updateAdministrative(+id, {
        concepto: rest.concepto ? String(rest.concepto) : undefined,
        monto: rest.monto !== undefined ? Number(rest.monto) : undefined,
        categoria: rest.categoria ? String(rest.categoria) : undefined,
        // estado/estatusPago solo por flujos de aprobación dedicados (si existen)
        esRecurrente: rest.esRecurrente !== undefined ? Boolean(rest.esRecurrente) : undefined,
        fecha: rest.fecha ? String(rest.fecha) : undefined,
      });
    }
    const { estatusPago: _e, usuarioId: _u, ...safe } = body as UpdateExpenseDto & Record<string, unknown>;
    return this.expensesService.update(+id, safe as UpdateExpenseDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  remove(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.remove(+id);
  }
}
