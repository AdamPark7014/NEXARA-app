import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto.js';
import { PERMISSIONS } from '../common/permissions.js';

@Injectable()
export class EmployeePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDecimal(value?: string | number | null) {
    if (value === undefined || value === null) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(parsed)) return null;
    return new Prisma.Decimal(parsed);
  }

  private toDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private canViewAll(user: { isSuperAdmin?: boolean; permissions?: string[] }) {
    return Boolean(user?.isSuperAdmin || user?.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE));
  }

  async findAll(
    user: { id: number; departmentId: number; isSuperAdmin?: boolean; permissions?: string[] },
    filters: { from?: string; to?: string; userId?: number },
    query?: PaginationQueryDto,
  ) {
    const fromDate = this.toDate(filters.from);
    const toDate = this.toDate(filters.to);
    if ((filters.from && !fromDate) || (filters.to && !toDate)) {
      throw new BadRequestException('Rango invalido');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Rango invalido');
    }

    const where: any = {};
    if (fromDate || toDate) {
      where.periodFrom = fromDate ? { gte: fromDate } : undefined;
      where.periodTo = toDate ? { lte: toDate } : undefined;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (!this.canViewAll(user)) {
      where.user = { departmentId: user.departmentId };
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.employeePayment.findMany({ where, include: { user: true, createdBy: true }, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.employeePayment.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.employeePayment.findMany({
      where,
      include: { user: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    currentUser: { id: number },
    dto: CreateEmployeePaymentDto,
    evidenceUrls: string[] = [],
  ) {
    const userId = Number(dto.userId);
    if (!userId || Number.isNaN(userId)) {
      throw new BadRequestException('Empleado invalido');
    }
    const periodFrom = this.toDate(dto.periodFrom);
    const periodTo = this.toDate(dto.periodTo);
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      throw new BadRequestException('Rango invalido');
    }
    const amount = this.toDecimal(dto.amount);
    if (!amount) {
      throw new BadRequestException('Monto invalido');
    }
    const totalMinutes = dto.totalMinutes && !Number.isNaN(dto.totalMinutes)
      ? Math.max(0, Math.round(dto.totalMinutes))
      : 0;

    return this.prisma.employeePayment.create({
      data: {
        userId,
        periodFrom,
        periodTo,
        totalMinutes,
        amount,
        note: dto.note?.trim() || null,
        evidenceUrls,
        createdById: currentUser.id || null,
      },
      include: { user: true, createdBy: true },
    });
  }
}
