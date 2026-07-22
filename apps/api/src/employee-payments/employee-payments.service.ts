import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto.js';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto.js';
import { PERMISSIONS } from '../common/permissions.js';
import { generateEmployeePaymentsReportPdf } from './employee-payments-report-pdf.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { resolveRequiredCompanyId, companyWhere } from '../common/tenant/tenant-scope.js';

const STATUS = {
  BORRADOR: 'Borrador',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado',
} as const;

@Injectable()
export class EmployeePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

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

  private normalizeStatus(value?: string | null): string {
    const raw = String(value || STATUS.PAGADO).trim().toLowerCase();
    if (['borrador', 'draft', 'pendiente'].includes(raw)) return STATUS.BORRADOR;
    if (['anulado', 'cancelado', 'void'].includes(raw)) return STATUS.ANULADO;
    return STATUS.PAGADO;
  }

  async findAll(
    user: { id: number; departmentId: number; isSuperAdmin?: boolean; permissions?: string[] },
    filters: { from?: string; to?: string; userId?: number; status?: string },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    const fromDate = this.toDate(filters.from);
    const toDate = this.toDate(filters.to);
    if ((filters.from && !fromDate) || (filters.to && !toDate)) {
      throw new BadRequestException('Rango invalido');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Rango invalido');
    }

    const where: Prisma.EmployeePaymentWhereInput = {
      deletedAt: null,
      ...companyWhere(companyId ?? null),
    };
    if (fromDate || toDate) {
      where.periodFrom = fromDate ? { gte: fromDate } : undefined;
      where.periodTo = toDate ? { lte: toDate } : undefined;
    }
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = this.normalizeStatus(filters.status);

    if (!this.canViewAll(user)) {
      where.user = { departmentId: user.departmentId };
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.employeePayment.findMany({
          where,
          include: { user: true, createdBy: true },
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
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
    dto: CreateEmployeePaymentDto & { concepto?: string; status?: string },
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
    if (!amount || Number(amount) <= 0) {
      throw new BadRequestException('Monto invalido');
    }
    const totalMinutes =
      dto.totalMinutes && !Number.isNaN(dto.totalMinutes) ? Math.max(0, Math.round(dto.totalMinutes)) : 0;
    const status = this.normalizeStatus(dto.status || STATUS.PAGADO);
    const concepto =
      (dto as any).concepto?.trim() ||
      dto.note?.trim() ||
      'Pago a empleado';
    const wantsPaid = status === STATUS.PAGADO;
    const companyId = await resolveRequiredCompanyId(this.prisma);

    const created = await this.prisma.employeePayment.create({
      data: {
        userId,
        periodFrom,
        periodTo,
        totalMinutes,
        amount,
        concepto: concepto.slice(0, 255),
        note: dto.note?.trim() || null,
        status: wantsPaid ? STATUS.BORRADOR : status,
        paidAt: null,
        contabilidadRef: null,
        companyId,
        evidenceUrls,
        createdById: currentUser.id || null,
      },
      include: { user: true, createdBy: true },
    });

    if (wantsPaid && currentUser.id) {
      return this.markPagado(created.id, currentUser.id);
    }

    await this.audit
      .log({ entityType: 'EmployeePayment', entityId: created.id, action: 'CREATE', changes: { status } }, currentUser.id)
      .catch(() => undefined);
    return created;
  }

  async update(
    id: number,
    dto: UpdateEmployeePaymentDto,
    evidenceUrls?: string[],
    actorId?: number,
  ) {
    const existing = await this.prisma.employeePayment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    if (existing.status === STATUS.ANULADO) {
      throw new BadRequestException('No se puede editar un pago anulado');
    }

    const data: Prisma.EmployeePaymentUpdateInput = {};
    if (dto.userId !== undefined) {
      const userId = Number(dto.userId);
      if (!userId || Number.isNaN(userId)) throw new BadRequestException('Empleado invalido');
      data.user = { connect: { id: userId } };
    }
    if (dto.periodFrom !== undefined || dto.periodTo !== undefined) {
      const periodFrom = this.toDate(dto.periodFrom ?? existing.periodFrom.toISOString().slice(0, 10));
      const periodTo = this.toDate(dto.periodTo ?? existing.periodTo.toISOString().slice(0, 10));
      if (!periodFrom || !periodTo || periodFrom > periodTo) {
        throw new BadRequestException('Rango invalido');
      }
      data.periodFrom = periodFrom;
      data.periodTo = periodTo;
    }
    if (dto.amount !== undefined) {
      const amount = this.toDecimal(dto.amount);
      if (!amount || Number(amount) <= 0) throw new BadRequestException('Monto invalido');
      data.amount = amount;
    }
    if (dto.totalMinutes !== undefined) {
      data.totalMinutes = Math.max(0, Math.round(Number(dto.totalMinutes) || 0));
    }
    if (dto.concepto !== undefined) data.concepto = dto.concepto.trim().slice(0, 255);
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.status !== undefined) {
      const status = this.normalizeStatus(dto.status);
      data.status = status;
      if (status === STATUS.PAGADO) {
        data.paidAt = existing.paidAt || new Date();
      }
      if (status === STATUS.ANULADO) {
        data.paidAt = null;
      }
    }
    if (evidenceUrls?.length) {
      data.evidenceUrls = [...(existing.evidenceUrls || []), ...evidenceUrls];
    }

    const updated = await this.prisma.employeePayment.update({
      where: { id },
      data,
      include: { user: true, createdBy: true },
    });

    if (dto.status !== undefined && this.normalizeStatus(dto.status) === STATUS.PAGADO && !existing.journalEntryId) {
      return this.markPagado(id, actorId);
    }

    await this.audit
      .log({ entityType: 'EmployeePayment', entityId: id, action: 'UPDATE', changes: dto }, actorId)
      .catch(() => undefined);
    return updated;
  }

  async markPagado(id: number, actorId?: number) {
    const existing = await this.prisma.employeePayment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    if (existing.status === STATUS.ANULADO) {
      throw new BadRequestException('No se puede pagar un registro anulado');
    }

    let journalEntryId = existing.journalEntryId;
    let contabilidadRef = existing.contabilidadRef;
    if (!journalEntryId && actorId) {
      const entry = await this.accounting.postOperationalDisbursement({
        kind: 'payroll',
        entityId: id,
        amount: Number(existing.amount),
        date: existing.paidAt || existing.periodTo,
        description: `Pago a empleado #${id}: ${existing.concepto || existing.note || 'Pago'}`,
        userId: actorId,
      });
      journalEntryId = entry.id;
      contabilidadRef = entry.entryNumber;
    }

    const updated = await this.prisma.employeePayment.update({
      where: { id },
      data: {
        status: STATUS.PAGADO,
        paidAt: existing.paidAt || new Date(),
        journalEntryId: journalEntryId ?? undefined,
        contabilidadRef: contabilidadRef || `PAG-${id}-${new Date().toISOString().slice(0, 10)}`,
      },
      include: { user: true, createdBy: true, journalEntry: true },
    });
    await this.audit
      .log(
        {
          entityType: 'EmployeePayment',
          entityId: id,
          action: 'MARK_PAID',
          changes: { journalEntryId, contabilidadRef },
        },
        actorId,
      )
      .catch(() => undefined);
    return updated;
  }

  async remove(id: number, actorId?: number) {
    const existing = await this.prisma.employeePayment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    const updated = await this.prisma.employeePayment.update({
      where: { id },
      data: { deletedAt: new Date(), status: STATUS.ANULADO },
      include: { user: true, createdBy: true },
    });
    await this.audit
      .log({ entityType: 'EmployeePayment', entityId: id, action: 'DELETE' }, actorId)
      .catch(() => undefined);
    return updated;
  }

  async analytics(
    user: { id: number; departmentId: number; isSuperAdmin?: boolean; permissions?: string[] },
    filters: { from?: string; to?: string; userId?: number },
  ) {
    const rows = (await this.findAll(user, filters)) as Array<{
      id: number;
      amount: any;
      status: string;
      concepto: string | null;
      note: string | null;
      periodFrom: Date;
      periodTo: Date;
      user?: { nombre?: string | null } | null;
      userId: number;
    }>;

    const sum = (list: typeof rows) => list.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    const pagados = rows.filter((r) => r.status === STATUS.PAGADO);
    const borradores = rows.filter((r) => r.status === STATUS.BORRADOR);
    const byEmployeeMap = new Map<string, { name: string; total: number; count: number }>();
    for (const row of pagados) {
      const name = row.user?.nombre || `Usuario #${row.userId}`;
      const entry = byEmployeeMap.get(name) || { name, total: 0, count: 0 };
      entry.total += Number(row.amount || 0);
      entry.count += 1;
      byEmployeeMap.set(name, entry);
    }

    return {
      periodLabel:
        filters.from || filters.to
          ? `${filters.from || 'inicio'} – ${filters.to || 'hoy'}`
          : 'todos los registros',
      totalPagado: sum(pagados),
      totalBorrador: sum(borradores),
      count: rows.length,
      employees: byEmployeeMap.size,
      byEmployee: [...byEmployeeMap.values()].sort((a, b) => b.total - a.total),
      rows: rows.slice(0, 200).map((r) => ({
        id: r.id,
        empleado: r.user?.nombre || `Usuario #${r.userId}`,
        concepto: r.concepto || r.note || '—',
        periodo: `${r.periodFrom.toISOString().slice(0, 10)} → ${r.periodTo.toISOString().slice(0, 10)}`,
        monto: Number(r.amount || 0),
        status: r.status,
      })),
    };
  }

  async reportPdf(
    user: { id: number; departmentId: number; isSuperAdmin?: boolean; permissions?: string[] },
    filters: { from?: string; to?: string; userId?: number },
    preparedBy?: string | null,
  ) {
    const analytics = await this.analytics(user, filters);
    return generateEmployeePaymentsReportPdf({
      title: 'Pagos a empleados',
      periodLabel: analytics.periodLabel,
      generatedAt: new Date().toLocaleString('es-MX'),
      preparedBy: preparedBy || null,
      currency: 'MXN',
      totalPagado: analytics.totalPagado,
      totalBorrador: analytics.totalBorrador,
      count: analytics.count,
      byEmployee: analytics.byEmployee,
      rows: analytics.rows,
    });
  }
}
