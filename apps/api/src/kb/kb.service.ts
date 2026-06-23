import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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

  // ── Categorías ────────────────────────────────────────────────
  async listCategories(visibility?: string) {
    const where: any = {};
    if (visibility) where.visibility = visibility;
    return (this.prisma as any).kbCategory.findMany({
      where,
      include: { _count: { select: { articles: { where: { status: 'PUBLISHED' } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: { name: string; description?: string; icon?: string; visibility?: string; parentId?: number; sortOrder?: number }) {
    let slug = slugify(dto.name);
    const existing = await (this.prisma as any).kbCategory.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    return (this.prisma as any).kbCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        visibility: (dto.visibility as any) || 'PUBLIC',
        sortOrder: dto.sortOrder ?? 0,
        parentId: dto.parentId ?? null,
      },
    });
  }

  // ── Artículos ─────────────────────────────────────────────────
  async listArticles(filters?: { status?: string; visibility?: string; categoryId?: number; q?: string; tag?: string }) {
    const where: any = {};
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

    return (this.prisma as any).kbArticle.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
        author: { select: { id: true, nombre: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getArticle(slugOrId: string) {
    const where = /^\d+$/.test(slugOrId) ? { id: +slugOrId } : { slug: slugOrId };
    const article = await (this.prisma as any).kbArticle.findUnique({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
        author: { select: { id: true, nombre: true } },
      },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    // Incremento viewCount async fire-and-forget
    (this.prisma as any).kbArticle.update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } }).catch(() => null);
    return article;
  }

  async createArticle(dto: {
    title: string;
    content: string;
    excerpt?: string;
    categoryId?: number;
    authorId?: number;
    visibility?: string;
    status?: string;
    tags?: string[] | string;
  }) {
    if (!dto.title || !dto.content) {
      throw new BadRequestException('Título y contenido son obligatorios');
    }
    let slug = slugify(dto.title);
    const existing = await (this.prisma as any).kbArticle.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const status = (dto.status as any) || 'DRAFT';
    const tagsCsv = Array.isArray(dto.tags) ? dto.tags.join(',') : (dto.tags || null);

    return (this.prisma as any).kbArticle.create({
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
      },
    });
  }

  async updateArticle(id: number, dto: any) {
    const data: any = { ...dto };
    if (dto.tags) data.tags = Array.isArray(dto.tags) ? dto.tags.join(',') : dto.tags;
    if (dto.status === 'PUBLISHED' && !dto.publishedAt) data.publishedAt = new Date();
    return (this.prisma as any).kbArticle.update({ where: { id }, data });
  }

  async deleteArticle(id: number) {
    return (this.prisma as any).kbArticle.delete({ where: { id } });
  }

  async markHelpful(id: number) {
    return (this.prisma as any).kbArticle.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
    });
  }

  // ── Endpoint público (sin auth) — solo PUBLISHED & PUBLIC ────────
  async listPublic(q?: string) {
    return this.listArticles({ status: 'PUBLISHED', visibility: 'PUBLIC', q });
  }
}
