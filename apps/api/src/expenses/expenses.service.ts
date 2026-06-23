import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoApproval: AutoApprovalService,
  ) {}

  async create(createExpenseDto: CreateExpenseDto) {
    const expense = await this.prisma['expense'].create({ data: createExpenseDto });

    if (createExpenseDto.usuarioId) {
      this.autoApproval
        .evaluate({
          entityType: 'EXPENSE',
          entityId: expense.id,
          userId: createExpenseDto.usuarioId,
          payload: { amount: Number(createExpenseDto.montoSolicitado || 0) },
        })
        .catch(() => undefined);
    }

    return expense;
  }

  async findAll(query?: PaginationQueryDto) {
    const include = { usuario: true, actividad: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['expense'].findMany({ include, orderBy: { fechaSolicitud: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['expense'].count(),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['expense'].findMany({ include });
  }

  async findByDepartment(departmentId: number, query?: PaginationQueryDto) {
    const where = { usuario: { departmentId } };
    const include = { usuario: true, actividad: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['expense'].findMany({ where, include, skip: query.skip, take: query.take }),
        this.prisma['expense'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['expense'].findMany({ where, include });
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
