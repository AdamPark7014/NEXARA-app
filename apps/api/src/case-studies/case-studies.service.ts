import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  assertCompanyAccess,
  companyWhere,
  requireCompanyId,
  resolvePublicCompanyId,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface CreateCaseStudyDto {
  titulo: string;
  slug?: string;
  cliente: string;
  vertical: string;
  impacto: string;
  descripcion?: string;
  cover?: string;
  imageUrl?: string;
  publicado?: boolean;
}

export interface UpdateCaseStudyDto extends Partial<CreateCaseStudyDto> {}

function toSlug(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 200);
}

@Injectable()
export class CaseStudiesService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: CreateCaseStudyDto,
    autorId: number,
    coverImage?: MulterFile,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const slug = data.slug || toSlug(data.titulo) + '-' + Date.now();
    const imageUrl = coverImage ? await this.saveCoverImage(coverImage) : data.imageUrl;
    return this.prisma.caseStudy.create({
      data: {
        titulo: data.titulo,
        slug,
        cliente: data.cliente,
        vertical: data.vertical,
        impacto: data.impacto,
        descripcion: data.descripcion,
        cover: data.cover,
        imageUrl,
        publicado: data.publicado ?? false,
        autorId,
        companyId: tenantId,
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async findAll(
    query?: PaginationQueryDto,
    publicadoOnly?: boolean,
    options?: { companyId?: number | null; publicSite?: boolean },
  ) {
    const tenantId = options?.publicSite
      ? await withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma))
      : requireCompanyId(options?.companyId);
    const where: any = {
      ...companyWhere(tenantId),
      ...(publicadoOnly ? { publicado: true } : {}),
    };
    const include = { autor: { select: { id: true, nombre: true } } };
    const orderBy = { createdAt: 'desc' as const };
    const run = <T>(fn: () => Promise<T>) =>
      options?.publicSite ? withTenantBypassAsync(fn) : fn();

    if (query?.limit) {
      const [data, total] = await run(() =>
        Promise.all([
          this.prisma.caseStudy.findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
          this.prisma.caseStudy.count({ where }),
        ]),
      );
      return buildPaginatedResponse(data, total, query);
    }
    return run(() => this.prisma.caseStudy.findMany({ where, include, orderBy }));
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const cs = await this.prisma.caseStudy.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    assertCompanyAccess(cs, tenantId, 'CaseStudy');
    return cs;
  }

  async findBySlugPublic(slug: string) {
    const companyId = await withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
    const cs = await withTenantBypassAsync(() =>
      this.prisma.caseStudy.findFirst({
        where: { slug, publicado: true, companyId },
        include: { autor: { select: { id: true, nombre: true } } },
      }),
    );
    if (!cs) throw new NotFoundException(`Caso publicado slug="${slug}" no encontrado`);
    return cs;
  }

  async update(
    id: number,
    data: UpdateCaseStudyDto,
    coverImage?: MulterFile,
    companyId?: number | null,
  ) {
    await this.findOne(id, companyId);
    const imageUrl = coverImage ? await this.saveCoverImage(coverImage) : data.imageUrl;
    const { imageUrl: _omit, ...rest } = data;
    return this.prisma.caseStudy.update({
      where: { id },
      data: {
        ...rest,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        updatedAt: new Date(),
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async togglePublicado(id: number, companyId?: number | null) {
    const cs = await this.findOne(id, companyId);
    return this.prisma.caseStudy.update({
      where: { id },
      data: { publicado: !cs.publicado, updatedAt: new Date() },
    });
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma.caseStudy.delete({ where: { id } });
  }

  private async saveCoverImage(file: MulterFile): Promise<string> {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/case-studies');
      await fs.mkdir(uploadDir, { recursive: true });
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${Date.now()}-${safeName}`;
      await fs.writeFile(path.join(uploadDir, filename), file.buffer);
      return `/case-studies/image/${filename}`;
    } catch {
      throw new InternalServerErrorException('Error al guardar la imagen del caso');
    }
  }
}
