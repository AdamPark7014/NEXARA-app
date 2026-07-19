import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';
import { generateExpensesReportPdf } from './expenses-report-pdf.js';

const ADMIN_EXPENSE_ACTIVITY_AN = 'SYS-ADMIN-GASTOS';

export const EXPENSE_CATEGORIES = [
  'Renta',
  'Servicios',
  'Suscripciones',
  'Material',
  'Publicidad',
  'Equipo',
  'Nómina',
  'Impuestos',
  'Otro',
] as const;

const STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoApproval: AutoApprovalService,
  ) {}

  private normalizeStatus(value?: string | null): string {
    const raw = String(value || STATUS.PENDIENTE).trim().toLowerCase();
    if (['pagado', 'paid', 'aprobado_pagado'].includes(raw)) return STATUS.PAGADO;
    if (['aprobado', 'approved', 'autorizado'].includes(raw)) return STATUS.APROBADO;
    if (['rechazado', 'rejected', 'cancelado'].includes(raw)) return STATUS.RECHAZADO;
    if (['pendiente', 'borrador', 'pendiente_aprobacion', 'draft'].includes(raw)) return STATUS.PENDIENTE;
    // Legacy uppercase UI values
    if (raw === 'pagado' || value === 'PAGADO') return STATUS.PAGADO;
    if (value === 'APROBADO') return STATUS.APROBADO;
    if (value === 'RECHAZADO') return STATUS.RECHAZADO;
    if (value === 'BORRADOR' || value === 'PENDIENTE_APROBACION') return STATUS.PENDIENTE;
    return STATUS.PENDIENTE;
  }

  private normalizeCategory(value?: string | null): string {
    const raw = String(value || 'Servicios').trim();
    const found = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
    return found || 'Otro';
  }

  /** OT interna para gastos administrativos (renta, SaaS, servicios). */
  private async ensureAdministrativeActivity(usuarioId: number): Promise<number> {
    const existing = await this.prisma.activity.findFirst({
      where: { anNumber: ADMIN_EXPENSE_ACTIVITY_AN, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.activity.create({
      data: {
        anNumber: ADMIN_EXPENSE_ACTIVITY_AN,
        titulo: 'Gastos administrativos',
        descripcion: 'Contenedor interno para gastos de oficina, renta y servicios (no operación de campo).',
        estatus: 'Finalizado',
        activityType: 'INTERNAL',
        creadoPorId: usuarioId,
        responsableId: usuarioId,
      },
      select: { id: true },
    });
    return created.id;
  }

  async create(createExpenseDto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({ data: createExpenseDto });

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

  async createAdministrative(dto: {
    usuarioId: number;
    createdById?: number;
    concepto: string;
    monto: number;
    categoria?: string;
    esRecurrente?: boolean;
    fecha?: string;
    ticketEvidenciaUrl?: string | null;
    actividadId?: number;
  }) {
    if (!dto.concepto?.trim()) throw new BadRequestException('Concepto requerido');
    if (!dto.monto || Number.isNaN(Number(dto.monto)) || Number(dto.monto) <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    if (!dto.ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el comprobante del gasto');
    }

    const actividadId = dto.actividadId ?? (await this.ensureAdministrativeActivity(dto.usuarioId));
    const categoria = this.normalizeCategory(dto.categoria);
    const fechaGasto = dto.fecha ? new Date(`${dto.fecha}T12:00:00`) : new Date();
    if (Number.isNaN(fechaGasto.getTime())) throw new BadRequestException('Fecha inválida');

    const expense = await this.prisma.expense.create({
      data: {
        actividadId,
        usuarioId: dto.usuarioId,
        createdById: dto.createdById ?? dto.usuarioId,
        montoSolicitado: new Prisma.Decimal(dto.monto),
        isAdministrative: true,
        concepto: dto.concepto.trim().slice(0, 255),
        categoria,
        esRecurrente: Boolean(dto.esRecurrente),
        fechaGasto,
        fechaSolicitud: fechaGasto,
        ticketEvidenciaUrl: dto.ticketEvidenciaUrl,
        estatusPago: STATUS.PENDIENTE,
        razonGasto: dto.concepto.trim().slice(0, 255),
      },
      include: { usuario: true, actividad: true, createdBy: true },
    });

    this.autoApproval
      .evaluate({
        entityType: 'EXPENSE',
        entityId: expense.id,
        userId: dto.usuarioId,
        payload: { amount: Number(dto.monto) },
      })
      .catch(() => undefined);

    return expense;
  }

  async updateAdministrative(
    id: number,
    dto: Partial<{
      concepto: string;
      monto: number;
      categoria: string;
      esRecurrente: boolean;
      fecha: string;
      ticketEvidenciaUrl: string;
    }>,
  ) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, isAdministrative: true },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    if (existing.estatusPago === STATUS.PAGADO) {
      throw new BadRequestException('No se puede editar un gasto ya pagado');
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.concepto !== undefined) {
      data.concepto = dto.concepto.trim().slice(0, 255);
      data.razonGasto = dto.concepto.trim().slice(0, 255);
    }
    if (dto.categoria !== undefined) data.categoria = this.normalizeCategory(dto.categoria);
    if (dto.esRecurrente !== undefined) data.esRecurrente = Boolean(dto.esRecurrente);
    if (dto.monto !== undefined) {
      if (Number.isNaN(Number(dto.monto)) || Number(dto.monto) <= 0) {
        throw new BadRequestException('Monto inválido');
      }
      data.montoSolicitado = new Prisma.Decimal(dto.monto);
    }
    if (dto.fecha !== undefined) {
      const fechaGasto = new Date(`${dto.fecha}T12:00:00`);
      if (Number.isNaN(fechaGasto.getTime())) throw new BadRequestException('Fecha inválida');
      data.fechaGasto = fechaGasto;
      data.fechaSolicitud = fechaGasto;
    }
    if (dto.ticketEvidenciaUrl !== undefined) data.ticketEvidenciaUrl = dto.ticketEvidenciaUrl;

    return this.prisma.expense.update({
      where: { id },
      data,
      include: { usuario: true, actividad: true, createdBy: true },
    });
  }

  async approveOrReject(id: number, action: 'approve' | 'reject', note?: string) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, isAdministrative: true },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    if (existing.estatusPago !== STATUS.PENDIENTE) {
      throw new BadRequestException('Solo se pueden autorizar gastos pendientes');
    }

    if (action === 'reject') {
      return this.prisma.expense.update({
        where: { id },
        data: {
          estatusPago: STATUS.RECHAZADO,
          razonGasto: note?.trim()
            ? `${existing.concepto || existing.razonGasto || ''} · Rechazo: ${note.trim()}`.slice(0, 500)
            : existing.razonGasto,
        },
        include: { usuario: true, actividad: true, createdBy: true },
      });
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        estatusPago: STATUS.APROBADO,
        contabilidadRef: existing.contabilidadRef || `GAS-${id}-${new Date().toISOString().slice(0, 10)}`,
      },
      include: { usuario: true, actividad: true, createdBy: true },
    });
  }

  async markPagado(id: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, isAdministrative: true },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    if (existing.estatusPago !== STATUS.APROBADO && existing.estatusPago !== STATUS.PAGADO) {
      throw new BadRequestException('El gasto debe estar aprobado para marcarlo como pagado');
    }
    return this.prisma.expense.update({
      where: { id },
      data: {
        estatusPago: STATUS.PAGADO,
        contabilidadRef: existing.contabilidadRef || `GAS-${id}-${new Date().toISOString().slice(0, 10)}`,
      },
      include: { usuario: true, actividad: true, createdBy: true },
    });
  }

  private adminWhere(departmentId?: number) {
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      isAdministrative: true,
    };
    if (departmentId != null) {
      where.usuario = { departmentId };
    }
    return where;
  }

  async findAllAdministrative(query?: PaginationQueryDto, departmentId?: number) {
    const where = this.adminWhere(departmentId);
    const include = { usuario: true, actividad: true, createdBy: true } as const;
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.expense.findMany({
          where,
          include,
          orderBy: { fechaSolicitud: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.expense.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.expense.findMany({ where, include, orderBy: { fechaSolicitud: 'desc' } });
  }

  async findAll(query?: PaginationQueryDto) {
    return this.findAllAdministrative(query);
  }

  async findByDepartment(departmentId: number, query?: PaginationQueryDto) {
    return this.findAllAdministrative(query, departmentId);
  }

  findOne(id: number) {
    return this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: { usuario: true, actividad: true, createdBy: true },
    });
  }

  update(id: number, updateExpenseDto: UpdateExpenseDto) {
    return this.prisma.expense.update({
      where: { id },
      data: updateExpenseDto,
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    return this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date(), estatusPago: STATUS.RECHAZADO },
    });
  }

  async analytics(filters: { from?: string; to?: string }, departmentId?: number) {
    const where = this.adminWhere(departmentId);
    if (filters.from || filters.to) {
      where.fechaSolicitud = {};
      if (filters.from) where.fechaSolicitud.gte = new Date(`${filters.from}T00:00:00`);
      if (filters.to) where.fechaSolicitud.lte = new Date(`${filters.to}T23:59:59`);
    }

    const rows = await this.prisma.expense.findMany({
      where,
      include: { usuario: true },
      orderBy: { fechaSolicitud: 'desc' },
    });

    const sum = (list: typeof rows) => list.reduce((acc, r) => acc + Number(r.montoSolicitado || 0), 0);
    const byCategoryMap = new Map<string, { name: string; total: number; count: number }>();
    const byPersonMap = new Map<string, { name: string; total: number; count: number }>();

    for (const row of rows) {
      const cat = row.categoria || 'Otro';
      const catEntry = byCategoryMap.get(cat) || { name: cat, total: 0, count: 0 };
      catEntry.total += Number(row.montoSolicitado || 0);
      catEntry.count += 1;
      byCategoryMap.set(cat, catEntry);

      const person = row.usuario?.nombre || `Usuario #${row.usuarioId}`;
      const personEntry = byPersonMap.get(person) || { name: person, total: 0, count: 0 };
      personEntry.total += Number(row.montoSolicitado || 0);
      personEntry.count += 1;
      byPersonMap.set(person, personEntry);
    }

    const pendientes = rows.filter((r) => r.estatusPago === STATUS.PENDIENTE);
    const aprobados = rows.filter((r) => r.estatusPago === STATUS.APROBADO);
    const pagados = rows.filter((r) => r.estatusPago === STATUS.PAGADO);

    return {
      periodLabel:
        filters.from || filters.to
          ? `${filters.from || 'inicio'} – ${filters.to || 'hoy'}`
          : 'todos los registros',
      totalSolicitado: sum(rows),
      totalAprobado: sum([...aprobados, ...pagados]),
      totalPagado: sum(pagados),
      count: rows.length,
      pendientes: pendientes.length,
      byCategory: [...byCategoryMap.values()].sort((a, b) => b.total - a.total),
      byPerson: [...byPersonMap.values()].sort((a, b) => b.total - a.total),
      rows: rows.slice(0, 200).map((r) => ({
        id: r.id,
        fecha: (r.fechaGasto || r.fechaSolicitud)?.toISOString?.().slice(0, 10) || '',
        concepto: r.concepto || r.razonGasto || '—',
        categoria: r.categoria || '—',
        solicitante: r.usuario?.nombre || `Usuario #${r.usuarioId}`,
        monto: Number(r.montoSolicitado || 0),
        estatus: r.estatusPago,
        recurrente: r.esRecurrente,
      })),
    };
  }

  async reportPdf(filters: { from?: string; to?: string }, preparedBy?: string | null, departmentId?: number) {
    const analytics = await this.analytics(filters, departmentId);
    return generateExpensesReportPdf({
      title: 'Control de gastos administrativos',
      periodLabel: analytics.periodLabel,
      generatedAt: new Date().toLocaleString('es-MX'),
      preparedBy: preparedBy || null,
      currency: 'MXN',
      totalSolicitado: analytics.totalSolicitado,
      totalAprobado: analytics.totalAprobado,
      totalPagado: analytics.totalPagado,
      byCategory: analytics.byCategory,
      byPerson: analytics.byPerson,
      rows: analytics.rows,
    });
  }
}
