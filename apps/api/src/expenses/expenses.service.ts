import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(createExpenseDto: CreateExpenseDto) {
    return this.prisma['expense'].create({ data: createExpenseDto });
  }

  findAll() {
    return this.prisma['expense'].findMany({ include: { usuario: true, actividad: true } });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['expense'].findMany({
      where: { usuario: { departmentId } },
      include: { usuario: true, actividad: true },
    });
  }

  findOne(id: number) {
    return this.prisma['expense'].findUnique({
      where: { id },
      include: { usuario: true, actividad: true },
    });
  }

  update(id: number, updateExpenseDto: UpdateExpenseDto) {
    return this.prisma['expense'].update({
      where: { id },
      data: updateExpenseDto,
    });
  }

  remove(id: number) {
    return this.prisma['expense'].delete({ where: { id } });
  }
}
