import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

export interface CreateSocialPostDto {
  red: string;
  titulo: string;
  contenido?: string;
  mediaUrl?: string;
  cuando: string | Date;
  estado?: string;
}

export interface UpdateSocialPostDto extends Partial<CreateSocialPostDto> {}

@Injectable()
export class SocialPostsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateSocialPostDto, autorId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.socialPost.create({
      data: {
        red: data.red,
        titulo: data.titulo,
        contenido: data.contenido,
        mediaUrl: data.mediaUrl,
        cuando: new Date(data.cuando),
        estado: data.estado ?? 'Borrador',
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
    const orderBy = { cuando: 'asc' as const };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.socialPost.findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
        this.prisma.socialPost.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.socialPost.findMany({ where, include, orderBy });
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const sp = await this.prisma.socialPost.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    assertCompanyAccess(sp, tenantId, 'SocialPost');
    return sp;
  }

  async update(id: number, data: UpdateSocialPostDto, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.socialPost.update({
      where: { id },
      data: {
        ...data,
        cuando: data.cuando ? new Date(data.cuando) : undefined,
        updatedAt: new Date(),
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async setEstado(id: number, estado: string, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.socialPost.update({
      where: { id },
      data: { estado, updatedAt: new Date() },
    });
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.socialPost.delete({ where: { id } });
  }
}
