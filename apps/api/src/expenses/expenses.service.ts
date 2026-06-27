import { Injectable, BadRequestException } from '@nestjs/common';
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

  /** Gastos administrativos (renta, servicios, SaaS) — metadata en razonGasto JSON. */
  async createAdministrative(dto: {
    usuarioId: number;
    concepto: string;
    monto: number;
    categoria?: string;
    estado?: string;
    esRecurrente?: boolean;
    fecha?: string;
    actividadId?: number;
  }) {
    let actividadId = dto.actividadId;
    if (!actividadId) {
      const fallback = await this.prisma.activity.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
      if (!fallback) {
        throw new BadRequestException('No hay OT en el sistema. Crea una actividad o indica actividadId.');
      }
      actividadId = fallback.id;
    }
    const meta = JSON.stringify({
      tipo: 'ADMIN',
      concepto: dto.concepto.trim(),
      categoria: dto.categoria || 'Servicios',
      estado: dto.estado || 'BORRADOR',
      esRecurrente: Boolean(dto.esRecurrente),
      fecha: dto.fecha || new Date().toISOString().slice(0, 10),
    });
    const estatusMap: Record<string, string> = {
      APROBADO: 'Pagado',
      PAGADO: 'Pagado',
      RECHAZADO: 'Rechazado',
      PENDIENTE_APROBACION: 'Pendiente',
      BORRADOR: 'Pendiente',
    };
    return this.create({
      actividadId,
      usuarioId: dto.usuarioId,
      montoSolicitado: dto.monto,
      razonGasto: meta,
      estatusPago: estatusMap[dto.estado || 'BORRADOR'] || 'Pendiente',
      fechaSolicitud: dto.fecha ? new Date(`${dto.fecha}T12:00:00`) : undefined,
    });
  }

  async updateAdministrative(id: number, dto: Partial<{ concepto: string; monto: number; categoria: string; estado: string; esRecurrente: boolean; fecha: string }>) {
    const existing = await this.prisma['expense'].findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Gasto no encontrado');
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(existing.razonGasto || '{}');
    } catch {
      meta = { tipo: 'ADMIN', concepto: existing.razonGasto };
    }
    if (dto.concepto !== undefined) meta.concepto = dto.concepto;
    if (dto.categoria !== undefined) meta.categoria = dto.categoria;
    if (dto.estado !== undefined) meta.estado = dto.estado;
    if (dto.esRecurrente !== undefined) meta.esRecurrente = dto.esRecurrente;
    if (dto.fecha !== undefined) meta.fecha = dto.fecha;
    meta.tipo = 'ADMIN';
    const estatusMap: Record<string, string> = {
      APROBADO: 'Pagado', PAGADO: 'Pagado', RECHAZADO: 'Rechazado', PENDIENTE_APROBACION: 'Pendiente', BORRADOR: 'Pendiente',
    };
    return this.prisma['expense'].update({
      where: { id },
      data: {
        razonGasto: JSON.stringify(meta),
        montoSolicitado: dto.monto ?? undefined,
        estatusPago: dto.estado ? (estatusMap[dto.estado] || 'Pendiente') : undefined,
        fechaSolicitud: dto.fecha ? new Date(`${dto.fecha}T12:00:00`) : undefined,
      },
      include: { usuario: true, actividad: true },
    });
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
