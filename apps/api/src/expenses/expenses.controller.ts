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
} from '@nestjs/common';
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  create(@CurrentUser() user: any, @Body() createExpenseDto: CreateExpenseDto) {
    // Staff solo puede crear gastos propios
    if (user.nivelAutoridad === 10 && createExpenseDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes crear tus propios gastos');
    }
    return this.expensesService.create(createExpenseDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  findAll(@CurrentUser() user: any) {
    // CEO ve todos, supervisor ve su departamento
    if (user.nivelAutoridad === 100) {
      return this.expensesService.findAll();
    } else {
      return this.expensesService.findByDepartment(user.departmentId);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  findOne(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  update(
    @CurrentUser() _user: any,
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(+id, updateExpenseDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 100 })
  remove(@CurrentUser() _user: any, @Param('id') id: string) {
    return this.expensesService.remove(+id);
  }
}
