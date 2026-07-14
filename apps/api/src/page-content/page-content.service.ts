import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertPageContentDto } from './dto/upsert-page-content.dto.js';

/** Secciones válidas del sitio público (copy + visuales). */
export const VALID_SECTIONS = [
  'home_hero',
  'home_metricas',
  'home_servicios',
  'home_proceso',
  'home_industrias',
  'home_cta',
  /** Imágenes estratégicas del inicio (debajo del hero Studio). */
  'page_home',
  'page_servicios',
  'page_soluciones',
  'page_nosotros',
  'page_contacto',
] as const;

export type HomeSection = (typeof VALID_SECTIONS)[number];

@Injectable()
export class PageContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve el contenido de una sección. 404 si no existe aún. */
  async findOne(section: string) {
    const row = await this.prisma.pageContent.findUnique({ where: { section } });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido guardado todavía.`);
    return row;
  }

  /** Crea o actualiza el contenido de una sección (upsert). */
  async upsert(section: string, dto: UpsertPageContentDto) {
    if (!(VALID_SECTIONS as readonly string[]).includes(section)) {
      throw new BadRequestException(
        `Sección "${section}" no es válida. Usa una de: ${VALID_SECTIONS.join(', ')}`,
      );
    }
    return this.prisma.pageContent.upsert({
      where: { section },
      create: {
        section,
        content: dto.content,
        updatedBy: dto.updatedBy ?? null,
      },
      update: {
        content: dto.content,
        updatedBy: dto.updatedBy ?? null,
      },
    });
  }

  /** Lista todas las secciones guardadas. */
  findAll() {
    return this.prisma.pageContent.findMany({ orderBy: { section: 'asc' } });
  }
}
