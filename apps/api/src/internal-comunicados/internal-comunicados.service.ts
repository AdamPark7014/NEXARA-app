import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

export interface CreateComunicadoDto {
  titulo: string;
  cuerpo: string;
  audiencia: string;
  prioridad?: string;
  estado?: string;
  scheduledAt?: string | Date;
  totalDestinatarios?: number;
}

export interface UpdateComunicadoDto extends Partial<CreateComunicadoDto> {}

@Injectable()
export class InternalComunicadosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateComunicadoDto, autorId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.internalComunicado.create({
      data: {
        titulo: data.titulo,
        cuerpo: data.cuerpo,
        audiencia: data.audiencia,
        prioridad: data.prioridad ?? 'Normal',
        estado: data.estado ?? 'Borrador',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        totalDestinatarios: data.totalDestinatarios ?? 0,
        autorId,
        companyId: tenantId,
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async findAll(query?: PaginationQueryDto, estado?: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId), ...(estado ? { estado } : {}) };
    const include = { autor: { select: { id: true, nombre: true } } };
    const orderBy = { createdAt: 'desc' as const };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.internalComunicado.findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
        this.prisma.internalComunicado.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.internalComunicado.findMany({ where, include, orderBy });
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const c = await this.prisma.internalComunicado.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    assertCompanyAccess(c, tenantId, 'Comunicado');
    return c;
  }

  async update(id: number, data: UpdateComunicadoDto, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.internalComunicado.update({
      where: { id },
      data: {
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        updatedAt: new Date(),
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async enviar(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.internalComunicado.update({
      where: { id },
      data: { estado: 'Enviado', sentAt: new Date(), updatedAt: new Date() },
    });
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.internalComunicado.delete({ where: { id } });
  }
}
