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
import { PERMISSIONS } from '../common/permissions.js';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  create(@CurrentUser() user: any, @Body() createExpenseDto: CreateExpenseDto) {
    if (!user.isSuperAdmin && createExpenseDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes crear tus propios gastos');
    }
    return this.expensesService.create(createExpenseDto);
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
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(+id, updateExpenseDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  remove(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.remove(+id);
  }
}
