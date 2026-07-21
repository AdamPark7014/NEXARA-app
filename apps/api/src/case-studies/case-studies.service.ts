import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { promises as fs } from 'fs';
import * as path from 'path';

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

  async create(data: CreateCaseStudyDto, autorId: number, coverImage?: MulterFile) {
    const slug = data.slug || toSlug(data.titulo) + '-' + Date.now();
    const imageUrl = coverImage ? await this.saveCoverImage(coverImage) : data.imageUrl;
    return this.prisma.caseStudy.create({
      data: {
        titulo:      data.titulo,
        slug,
        cliente:     data.cliente,
        vertical:    data.vertical,
        impacto:     data.impacto,
        descripcion: data.descripcion,
        cover:       data.cover,
        imageUrl,
        publicado:   data.publicado ?? false,
        autorId,
      },
      include: { autor: { select: { id: true, nombre: true } } },
    });
  }

  async findAll(query?: PaginationQueryDto, publicadoOnly?: boolean) {
    const where = publicadoOnly ? { publicado: true } : undefined;
    const include = { autor: { select: { id: true, nombre: true } } };
    const orderBy = { createdAt: 'desc' as const };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.caseStudy.findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
        this.prisma.caseStudy.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.caseStudy.findMany({ where, include, orderBy });
  }

  async findOne(id: number) {
    const cs = await this.prisma.caseStudy.findUnique({
      where: { id },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    if (!cs) throw new NotFoundException(`CaseStudy #${id} not found`);
    return cs;
  }

  async findBySlug(slug: string) {
    const cs = await this.prisma.caseStudy.findUnique({ where: { slug } });
    if (!cs) throw new NotFoundException(`CaseStudy slug="${slug}" not found`);
    return cs;
  }

  async findBySlugPublic(slug: string) {
    const cs = await this.prisma.caseStudy.findFirst({
      where: { slug, publicado: true },
      include: { autor: { select: { id: true, nombre: true } } },
    });
    if (!cs) throw new NotFoundException(`Caso publicado slug="${slug}" no encontrado`);
    return cs;
  }

  async update(id: number, data: UpdateCaseStudyDto, coverImage?: MulterFile) {
    await this.findOne(id);
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

  async togglePublicado(id: number) {
    const cs = await this.findOne(id);
    return this.prisma.caseStudy.update({
      where: { id },
      data: { publicado: !cs.publicado, updatedAt: new Date() },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
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
