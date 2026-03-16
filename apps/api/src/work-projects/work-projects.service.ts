import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateWorkProjectDto } from './dto/create-work-project.dto.js';
import { UpdateWorkProjectDto } from './dto/update-work-project.dto.js';
import { CreateWorkProjectExpenseDto } from './dto/create-work-project-expense.dto.js';
import { CreateWorkProjectPayrollDto } from './dto/create-work-project-payroll.dto.js';
import { CreateWorkProjectLogDto } from './dto/create-work-project-log.dto.js';

@Injectable()
export class WorkProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDecimal(value?: string | number | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(parsed)) return undefined;
    return new Prisma.Decimal(parsed);
  }

  private toDate(value?: string | null) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  }

  private clampProgress(value?: number | null) {
    if (value === undefined || value === null) return undefined;
    return Math.min(100, Math.max(0, value));
  }

  async create(dto: CreateWorkProjectDto) {
    if (!dto.title?.trim()) {
      throw new BadRequestException('Titulo requerido');
    }

    return this.prisma.workProject.create({
      data: {
        title: dto.title.trim(),
        clientName: dto.clientName?.trim() || null,
        managerName: dto.managerName?.trim() || null,
        status: dto.status || WorkProjectStatus.IN_PROGRESS,
        startDate: this.toDate(dto.startDate) || null,
        endDate: this.toDate(dto.endDate) || null,
        budgetTotal: this.toDecimal(dto.budgetTotal) || null,
        budgetUsed: this.toDecimal(dto.budgetUsed) || null,
        progress: this.clampProgress(dto.progress) ?? 0,
        description: dto.description?.trim() || null,
      },
      include: {
        expenses: true,
        payroll: true,
        logs: true,
      },
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const include = { expenses: { orderBy: { incurredAt: 'desc' } as const }, payroll: { orderBy: { paidAt: 'desc' } as const }, logs: { orderBy: { createdAt: 'desc' } as const } };
    if (query?.limit) {
      const where = query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : undefined;
      const [data, total] = await Promise.all([
        this.prisma.workProject.findMany({ where, orderBy: { createdAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.prisma.workProject.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.workProject.findMany({
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: number) {
    const project = await this.prisma.workProject.findUnique({
      where: { id },
      include: {
        expenses: { orderBy: { incurredAt: 'desc' } },
        payroll: { orderBy: { paidAt: 'desc' } },
        logs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!project) {
      throw new NotFoundException('Proyecto en curso no encontrado');
    }
    return project;
  }

  async update(id: number, dto: UpdateWorkProjectDto) {
    await this.findOne(id);

    return this.prisma.workProject.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        clientName: dto.clientName?.trim() || undefined,
        managerName: dto.managerName?.trim() || undefined,
        status: dto.status,
        startDate: dto.startDate ? this.toDate(dto.startDate) : undefined,
        endDate: dto.endDate ? this.toDate(dto.endDate) : undefined,
        budgetTotal: dto.budgetTotal !== undefined ? this.toDecimal(dto.budgetTotal) : undefined,
        budgetUsed: dto.budgetUsed !== undefined ? this.toDecimal(dto.budgetUsed) : undefined,
        progress: dto.progress !== undefined ? this.clampProgress(dto.progress) : undefined,
        description: dto.description?.trim() || undefined,
      },
      include: {
        expenses: true,
        payroll: true,
        logs: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.workProject.delete({ where: { id } });
  }

  async addExpense(projectId: number, dto: CreateWorkProjectExpenseDto) {
    const project = await this.findOne(projectId);
    const amount = this.toDecimal(dto.amount);
    if (!amount) {
      throw new BadRequestException('Monto invalido');
    }

    const expense = await this.prisma.workProjectExpense.create({
      data: {
        projectId,
        category: dto.category.trim(),
        amount,
        incurredAt: this.toDate(dto.incurredAt) || new Date(),
        note: dto.note?.trim() || null,
      },
    });

    await this.updateBudgetUsed(project, amount);
    return expense;
  }

  async addPayroll(projectId: number, dto: CreateWorkProjectPayrollDto) {
    const project = await this.findOne(projectId);
    const amount = this.toDecimal(dto.amount);
    if (!amount) {
      throw new BadRequestException('Monto invalido');
    }

    const payroll = await this.prisma.workProjectPayroll.create({
      data: {
        projectId,
        employee: dto.employee.trim(),
        amount,
        paidAt: this.toDate(dto.paidAt) || new Date(),
        note: dto.note?.trim() || null,
      },
    });

    await this.updateBudgetUsed(project, amount);
    return payroll;
  }

  async addLog(projectId: number, dto: CreateWorkProjectLogDto) {
    await this.findOne(projectId);
    const progress = this.clampProgress(dto.progress);

    const log = await this.prisma.workProjectLog.create({
      data: {
        projectId,
        label: dto.label.trim(),
        progress: progress ?? 0,
        note: dto.note?.trim() || null,
      },
    });

    if (progress !== undefined) {
      await this.prisma.workProject.update({
        where: { id: projectId },
        data: { progress },
      });
    }

    return log;
  }

  private async updateBudgetUsed(project: { id: number; budgetUsed: Prisma.Decimal | null }, amount: Prisma.Decimal) {
    const current = project.budgetUsed ? new Prisma.Decimal(project.budgetUsed) : new Prisma.Decimal(0);
    await this.prisma.workProject.update({
      where: { id: project.id },
      data: { budgetUsed: current.plus(amount) },
    });
  }
}
