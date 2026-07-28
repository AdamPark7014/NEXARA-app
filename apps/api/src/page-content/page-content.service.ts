import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertPageContentDto } from './dto/upsert-page-content.dto.js';
import {
  requireCompanyId,
  resolvePublicCompanyId,
  companyWhere,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

/** Secciones válidas del sitio público (copy + visuales + SEO). */
export const VALID_SECTIONS = [
  'home_hero',
  'home_metricas',
  'home_servicios',
  'home_proceso',
  'home_industrias',
  'home_cta',
  'page_home',
  'page_servicios',
  'page_soluciones',
  'page_nosotros',
  'page_contacto',
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

  private async publicCompanyId() {
    return withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
  }

  /** Sitio público: solo contenido publicado del tenant público. */
  async findPublished(section: string) {
    const companyId = await this.publicCompanyId();
    const row = await withTenantBypassAsync(() =>
      this.prisma.pageContent.findUnique({
        where: { companyId_section: { companyId, section } },
      }),
    );
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido publicado todavía.`);
    return {
      ...row,
      content: row.content,
      isDraft: false,
      hasUnpublishedChanges: this.hasUnpublishedChanges(row),
    };
  }

  /** Studio: borrador del tenant activo. */
  async findDraft(section: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.pageContent.findUnique({
      where: { companyId_section: { companyId: tenantId, section } },
    });
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

  async upsert(section: string, dto: UpsertPageContentDto, companyId?: number | null) {
    this.assertSection(section);
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma.pageContent.findUnique({
      where: { companyId_section: { companyId: tenantId, section } },
    });
    if (!existing) {
      return this.prisma.pageContent.create({
        data: {
          section,
          companyId: tenantId,
          content: dto.content,
          draftContent: dto.content,
          updatedBy: dto.updatedBy ?? null,
          publishedAt: new Date(),
          publishedBy: dto.updatedBy ?? null,
        },
      });
    }
    return this.prisma.pageContent.update({
      where: { id: existing.id },
      data: {
        draftContent: dto.content,
        updatedBy: dto.updatedBy ?? null,
      },
    });
  }

  async publish(section: string, publishedBy?: string, companyId?: number | null) {
    this.assertSection(section);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.pageContent.findUnique({
      where: { companyId_section: { companyId: tenantId, section } },
    });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido.`);
    const toPublish = row.draftContent ?? row.content;
    const resolvedPublishedBy = publishedBy?.trim() || row.updatedBy || null;
    const nextVersion =
      (await this.prisma.pageContentRevision.count({
        where: { section, ...companyWhere(tenantId) },
      })) + 1;

    const [updated] = await this.prisma.$transaction([
      this.prisma.pageContent.update({
        where: { id: row.id },
        data: {
          content: toPublish as Prisma.InputJsonValue,
          draftContent: toPublish as Prisma.InputJsonValue,
          publishedAt: new Date(),
          publishedBy: resolvedPublishedBy,
          updatedBy: resolvedPublishedBy,
        },
      }),
      this.prisma.pageContentRevision.create({
        data: {
          section,
          version: nextVersion,
          content: toPublish as Prisma.InputJsonValue,
          publishedBy: resolvedPublishedBy,
          companyId: tenantId,
        },
      }),
    ]);
    return updated;
  }

  async listRevisions(section: string, companyId?: number | null) {
    this.assertSection(section);
    const tenantId = requireCompanyId(companyId);
    return this.prisma.pageContentRevision.findMany({
      where: { section, ...companyWhere(tenantId) },
      orderBy: { version: 'desc' },
    });
  }

  async rollback(section: string, version: number, publishedBy?: string, companyId?: number | null) {
    this.assertSection(section);
    const tenantId = requireCompanyId(companyId);
    const revision = await this.prisma.pageContentRevision.findFirst({
      where: { section, version, ...companyWhere(tenantId) },
    });
    if (!revision) throw new NotFoundException(`La versión ${version} no existe para "${section}"`);

    const row = await this.prisma.pageContent.findUnique({
      where: { companyId_section: { companyId: tenantId, section } },
    });
    if (!row) throw new NotFoundException(`Sección "${section}" no tiene contenido.`);

    await this.prisma.pageContent.update({
      where: { id: row.id },
      data: { draftContent: revision.content as Prisma.InputJsonValue },
    });
    return this.publish(section, publishedBy ? `${publishedBy} (restaurar v${version})` : `restaurar v${version}`, tenantId);
  }

  findAll(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.pageContent.findMany({
      where: { companyId: tenantId },
      orderBy: { section: 'asc' },
    });
  }
}
