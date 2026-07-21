import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertPageContentDto } from './dto/upsert-page-content.dto.js';

/** Secciones válidas del sitio público (copy + visuales + SEO). */
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
  /** Meta title / description / Open Graph editables en Studio. */
  'seo_home',
  'seo_servicios',
  'seo_soluciones',
  'seo_nosotros',
  'seo_contacto',
  'seo_proyectos',
  'seo_blog',
  'seo_cobertura',
] as const;

export type HomeSection = (typeof VALID_SECTIONS)[number];

@Injectable()
export class PageContentService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSection(section: string) {
    if (!(VALID_SECTIONS as readonly string[]).includes(section)) {
      throw new BadRequestException(
        `Sección "${section}" no es válida. Usa una de: ${VALID_SECTIONS.join(', ')}`,
      );
    }
  }

  /** Sitio público: solo contenido publicado. */
  async findPublished(section: string) {
    const row = await this.prisma.pageContent.findUnique({ where: { section } });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido publicado todavía.`);
    return {
      ...row,
      content: row.content,
      isDraft: false,
      hasUnpublishedChanges: this.hasUnpublishedChanges(row),
    };
  }

  /** Studio: borrador (o publicado si aún no hay draft). */
  async findDraft(section: string) {
    const row = await this.prisma.pageContent.findUnique({ where: { section } });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido guardado todavía.`);
    const draft = (row.draftContent ?? row.content) as Prisma.JsonValue;
    return {
      ...row,
      content: draft,
      draftContent: draft,
      isDraft: true,
      hasUnpublishedChanges: this.hasUnpublishedChanges(row),
    };
  }

  /** Compat: GET público / Studio legacy → publicado. */
  async findOne(section: string) {
    return this.findPublished(section);
  }

  private hasUnpublishedChanges(row: {
    content: Prisma.JsonValue;
    draftContent: Prisma.JsonValue | null;
  }) {
    if (row.draftContent == null) return false;
    return JSON.stringify(row.draftContent) !== JSON.stringify(row.content);
  }

  /** Guarda borrador (no afecta sitio público). */
  async upsert(section: string, dto: UpsertPageContentDto) {
    this.assertSection(section);
    const existing = await this.prisma.pageContent.findUnique({ where: { section } });
    if (!existing) {
      // Primera vez: publica y deja draft igual (sitio no queda vacío)
      return this.prisma.pageContent.create({
        data: {
          section,
          content: dto.content,
          draftContent: dto.content,
          updatedBy: dto.updatedBy ?? null,
          publishedAt: new Date(),
          publishedBy: dto.updatedBy ?? null,
        },
      });
    }
    return this.prisma.pageContent.update({
      where: { section },
      data: {
        draftContent: dto.content,
        updatedBy: dto.updatedBy ?? null,
      },
    });
  }

  /** Publica el borrador al sitio. */
  async publish(section: string, publishedBy?: string) {
    this.assertSection(section);
    const row = await this.prisma.pageContent.findUnique({ where: { section } });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido.`);
    const toPublish = row.draftContent ?? row.content;
    return this.prisma.pageContent.update({
      where: { section },
      data: {
        content: toPublish as Prisma.InputJsonValue,
        draftContent: toPublish as Prisma.InputJsonValue,
        publishedAt: new Date(),
        publishedBy: publishedBy?.trim() || row.updatedBy || null,
        updatedBy: publishedBy?.trim() || row.updatedBy || null,
      },
    });
  }

  /** Lista todas las secciones guardadas (Studio). */
  findAll() {
    return this.prisma.pageContent.findMany({ orderBy: { section: 'asc' } });
  }
}
