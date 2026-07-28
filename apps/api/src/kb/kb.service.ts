import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertCompanyAccess,
  companyWhere,
  requireCompanyId,
  resolvePublicCompanyId,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  private async publicCompanyId() {
    return withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
  }

  async listCategories(visibility?: string, companyId?: number | null, publicSite = false) {
    const tenantId = publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (visibility) where.visibility = visibility;
    const run = <T>(fn: () => Promise<T>) => (publicSite ? withTenantBypassAsync(fn) : fn());
    return run(() =>
      this.prisma.kbCategory.findMany({
        where,
        include: { _count: { select: { articles: { where: { status: 'PUBLISHED' } } } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async createCategory(
    dto: {
      name: string;
      description?: string;
      icon?: string;
      visibility?: string;
      parentId?: number;
      sortOrder?: number;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    let slug = slugify(dto.name);
    const existing = await this.prisma.kbCategory.findFirst({
      where: { slug, companyId: tenantId },
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    return this.prisma.kbCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        visibility: (dto.visibility as any) || 'PUBLIC',
        sortOrder: dto.sortOrder ?? 0,
        parentId: dto.parentId ?? null,
        companyId: tenantId,
      },
    });
  }

  async listArticles(
    filters?: { status?: string; visibility?: string; categoryId?: number; q?: string; tag?: string },
    companyId?: number | null,
    publicSite = false,
  ) {
    const tenantId = publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (filters?.status) where.status = filters.status;
    if (filters?.visibility) where.visibility = filters.visibility;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { excerpt: { contains: filters.q, mode: 'insensitive' } },
        { content: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    if (filters?.tag) where.tags = { contains: filters.tag };

    const run = <T>(fn: () => Promise<T>) => (publicSite ? withTenantBypassAsync(fn) : fn());
    return run(() =>
      this.prisma.kbArticle.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
          author: { select: { id: true, nombre: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async getArticle(slugOrId: string, companyId?: number | null, publicSite = false) {
    const tenantId = publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(companyId);
    const where: any = {
      ...companyWhere(tenantId),
      ...(/^\d+$/.test(slugOrId) ? { id: +slugOrId } : { slug: slugOrId }),
    };
    const run = <T>(fn: () => Promise<T>) => (publicSite ? withTenantBypassAsync(fn) : fn());
    const article = await run(() =>
      this.prisma.kbArticle.findFirst({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
          author: { select: { id: true, nombre: true } },
        },
      }),
    );
    if (!article) throw new NotFoundException('Artículo no encontrado');
    this.prisma.kbArticle
      .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => null);
    return article;
  }

  async createArticle(
    dto: {
      title: string;
      content: string;
      excerpt?: string;
      categoryId?: number;
      authorId?: number;
      visibility?: string;
      status?: string;
      tags?: string[] | string;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!dto.title || !dto.content) {
      throw new BadRequestException('Título y contenido son obligatorios');
    }
    let slug = slugify(dto.title);
    const existing = await this.prisma.kbArticle.findFirst({
      where: { slug, companyId: tenantId },
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const status = (dto.status as any) || 'DRAFT';
    const tagsCsv = Array.isArray(dto.tags) ? dto.tags.join(',') : dto.tags || null;

    return this.prisma.kbArticle.create({
      data: {
        slug,
        title: dto.title.trim(),
        excerpt: dto.excerpt?.trim() || dto.content.slice(0, 200),
        content: dto.content,
        categoryId: dto.categoryId ?? null,
        authorId: dto.authorId ?? null,
        visibility: (dto.visibility as any) || 'PUBLIC',
        status,
        tags: tagsCsv,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        companyId: tenantId,
      },
    });
  }

  async updateArticle(id: number, dto: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma.kbArticle.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(existing, tenantId, 'Artículo KB');
    const { companyId: _omit, ...rest } = dto || {};
    const data: any = { ...rest };
    if (dto.tags) data.tags = Array.isArray(dto.tags) ? dto.tags.join(',') : dto.tags;
    if (dto.status === 'PUBLISHED' && !dto.publishedAt) data.publishedAt = new Date();
    return this.prisma.kbArticle.update({ where: { id }, data });
  }

  async deleteArticle(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma.kbArticle.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(existing, tenantId, 'Artículo KB');
    return this.prisma.kbArticle.delete({ where: { id } });
  }

  async markHelpful(id: number) {
    const companyId = await this.publicCompanyId();
    const existing = await withTenantBypassAsync(() =>
      this.prisma.kbArticle.findFirst({ where: { id, companyId } }),
    );
    if (!existing) throw new NotFoundException('Artículo no encontrado');
    return this.prisma.kbArticle.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
    });
  }

  async listPublic(q?: string) {
    return this.listArticles({ status: 'PUBLISHED', visibility: 'PUBLIC', q }, null, true);
  }
}
