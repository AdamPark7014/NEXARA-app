import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

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

  async create(data: CreateComunicadoDto, autorId: number) {
    return this.prisma.internalComunicado.create({
      data: {
        titulo:             data.titulo,
        cuerpo:             data.cuerpo,
        audiencia:          data.audiencia,
        prioridad:          data.prioridad ?? 'Normal',
        estado:             data.estado ?? 'Borrador',
        scheduledAt:        data.scheduledAt ? new Date(data.scheduledAt) : null,
        totalDestinatarios: data.totalDestinatarios ?? 0,
        autorId,
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async findAll(query?: PaginationQueryDto, estado?: string) {
    const where = estado ? { estado } : undefined;
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

  async findOne(id: number) {
    const c = await this.prisma.internalComunicado.findUnique({
      where: { id },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    if (!c) throw new NotFoundException(`Comunicado #${id} not found`);
    return c;
  }

  async update(id: number, data: UpdateComunicadoDto) {
    await this.findOne(id);
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

  async enviar(id: number) {
    await this.findOne(id);
    return this.prisma.internalComunicado.update({
      where: { id },
      data: { estado: 'Enviado', sentAt: new Date(), updatedAt: new Date() },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.internalComunicado.delete({ where: { id } });
  }
}
