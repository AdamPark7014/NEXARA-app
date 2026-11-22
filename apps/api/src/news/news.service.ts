import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateNewsPostDto } from './dto/create-news-post.dto.js';
import { UpdateNewsPostDto } from './dto/update-news-post.dto.js';
import { NewsStatus } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';
import {
  companyWhere,
  requireCompanyId,
  resolvePublicCompanyId,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';
import { remitenteConNombre } from '../common/email/correo-nexara.js';
import { correoDeNoticia, ligaDeLaNoticia } from './correo-noticia.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface NewsFiles {
  coverImage?: MulterFile;
  gallery?: MulterFile[];
}

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma;
  }

  private async publicCompanyId() {
    return withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
  }

  async create(payload: CreateNewsPostDto, files?: NewsFiles, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const title = payload.title.trim();
    const slugBase = this.slugify(payload.slug?.trim() || title);
    const slug = await this.ensureUniqueSlug(slugBase, undefined, tenantId);

    const status = payload.status ?? NewsStatus.DRAFT;
    const publishedAt = this.resolvePublishedAt(status, payload.publishedAt);

    const coverImageUrl = files?.coverImage
      ? await this.saveImage(files.coverImage)
      : payload.coverImageUrl?.trim() || null;
    const galleryUrls = files?.gallery?.length
      ? await this.saveImages(files.gallery)
      : this.normalizeGallery(payload.galleryUrls);

    const post = await this.db.newsPost.create({
      data: {
        title,
        slug,
        summary: payload.summary?.trim() || null,
        content: payload.content.trim(),
        coverImageUrl,
        galleryUrls,
        status,
        publishedAt,
        tags: this.normalizeTags(payload.tags),
        companyId: tenantId,
      },
    });

    if (post.status === NewsStatus.PUBLISHED) {
      this.notifyNewsletterSubscribers(post).catch((err) => {
        console.warn('[news] newsletter notification failed', err);
      });
    }

    return post;
  }

  async list(
    search?: string,
    status?: string,
    query?: PaginationQueryDto,
    options?: { includeDrafts?: boolean; companyId?: number | null; publicSite?: boolean },
  ) {
    const tenantId = options?.publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(options?.companyId);
    const term = search?.trim();
    const normalizedStatus = this.normalizeStatus(status);
    const where = {
      ...companyWhere(tenantId),
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: 'insensitive' as const } },
              { summary: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(options?.includeDrafts
        ? normalizedStatus
          ? { status: normalizedStatus }
          : {}
        : { status: NewsStatus.PUBLISHED }),
    };

    const run = <T>(fn: () => Promise<T>) =>
      options?.publicSite ? withTenantBypassAsync(fn) : fn();

    if (query?.limit) {
      const [data, total] = await run(() =>
        Promise.all([
          this.db.newsPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
          this.db.newsPost.count({ where }),
        ]),
      );
      return buildPaginatedResponse(data, total, query);
    }
    return run(() => this.db.newsPost.findMany({ where, orderBy: { createdAt: 'desc' } }));
  }

  async findOne(
    id: number,
    options?: { includeDrafts?: boolean; companyId?: number | null; publicSite?: boolean },
  ) {
    const tenantId = options?.publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(options?.companyId);
    const run = <T>(fn: () => Promise<T>) =>
      options?.publicSite ? withTenantBypassAsync(fn) : fn();
    const post = await run(() =>
      this.db.newsPost.findFirst({
        where: { id, ...companyWhere(tenantId) },
      }),
    );
    if (!post) {
      throw new NotFoundException(`Noticia con ID ${id} no encontrada`);
    }
    if (!options?.includeDrafts && post.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException(`Noticia con ID ${id} no encontrada`);
    }
    return post;
  }

  async findBySlug(
    slug: string,
    options?: { includeDrafts?: boolean; companyId?: number | null; publicSite?: boolean },
  ) {
    const safe = slug?.trim().toLowerCase();
    if (!safe) {
      throw new NotFoundException('Noticia no encontrada');
    }
    const tenantId = options?.publicSite
      ? await this.publicCompanyId()
      : requireCompanyId(options?.companyId);
    const post = await (options?.publicSite
      ? withTenantBypassAsync(() =>
          this.db.newsPost.findFirst({ where: { slug: safe, companyId: tenantId } }),
        )
      : this.db.newsPost.findFirst({ where: { slug: safe, companyId: tenantId } }));
    if (!post) {
      throw new NotFoundException(`Noticia "${safe}" no encontrada`);
    }
    if (!options?.includeDrafts && post.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException(`Noticia "${safe}" no encontrada`);
    }
    return post;
  }

  async update(id: number, payload: UpdateNewsPostDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.findOne(id, { includeDrafts: true, companyId: tenantId });

    const nextSlugBase = payload.slug?.trim() ? this.slugify(payload.slug.trim()) : undefined;
    const slug = nextSlugBase ? await this.ensureUniqueSlug(nextSlugBase, id, tenantId) : existing.slug;

    const status = payload.status ?? existing.status;
    const publishedAt = this.resolvePublishedAt(status, payload.publishedAt, existing.publishedAt);

    const updated = await this.db.newsPost.update({
      where: { id },
      data: {
        title: payload.title?.trim() || undefined,
        slug,
        summary: payload.summary?.trim() || undefined,
        content: payload.content?.trim() || undefined,
        coverImageUrl: payload.coverImageUrl?.trim() || undefined,
        galleryUrls: payload.galleryUrls
          ? this.normalizeGallery(payload.galleryUrls)
          : undefined,
        status,
        publishedAt,
        tags: payload.tags ? this.normalizeTags(payload.tags) : undefined,
      },
    });

    if (existing.status !== NewsStatus.PUBLISHED && updated.status === NewsStatus.PUBLISHED) {
      this.notifyNewsletterSubscribers(updated).catch((err) => {
        console.warn('[news] newsletter notification failed', err);
      });
    }

    return updated;
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, { includeDrafts: true, companyId });
    return this.db.newsPost.delete({ where: { id } });
  }

  private normalizeStatus(status?: string) {
    if (!status) return undefined;
    const value = status.toUpperCase().trim();
    return Object.values(NewsStatus).includes(value as NewsStatus)
      ? (value as NewsStatus)
      : undefined;
  }

  private normalizeTags(tags?: string[]) {
    if (!tags) return [];
    return tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 20);
  }

  private normalizeGallery(urls?: string[]) {
    if (!urls) return [];
    return urls
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
      .slice(0, 8);
  }

  private async saveImages(files: MulterFile[]): Promise<string[]> {
    const saved: string[] = [];
    for (const file of files) {
      saved.push(await this.saveImage(file));
    }
    return saved;
  }

  private async saveImage(file: MulterFile): Promise<string> {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/news');
      await fs.mkdir(uploadDir, { recursive: true });

      const filename = `${Date.now()}-${file.originalname}`;
      const filepath = path.join(uploadDir, filename);

      await fs.writeFile(filepath, file.buffer);

      return `/news/image/${filename}`;
    } catch (_error) {
      throw new InternalServerErrorException('Error al guardar la imagen');
    }
  }

  private resolvePublishedAt(
    status: NewsStatus,
    publishedAt?: string,
    existing?: Date | null,
  ) {
    if (publishedAt) {
      return new Date(publishedAt);
    }
    if (status === NewsStatus.PUBLISHED && !existing) {
      return new Date();
    }
    if (status !== NewsStatus.PUBLISHED) {
      return null;
    }
    return existing ?? null;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200);
  }

  private async ensureUniqueSlug(base: string, excludeId?: number, companyId?: number) {
    const safeBase = base || `news-${Date.now()}`;
    let candidate = safeBase;
    let suffix = 1;
    const tenantId = companyId ?? 0;

    while (
      await this.db.newsPost.findFirst({
        where: {
          slug: candidate,
          companyId: tenantId,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      })
    ) {
      candidate = `${safeBase}-${suffix++}`;
    }

    return candidate;
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async notifyNewsletterSubscribers(post: {
    id: number;
    title: string;
    slug: string;
    summary: string | null;
    content: string;
    coverImageUrl: string | null;
    publishedAt: Date | null;
    companyId: number;
  }) {
    const subscribers = await this.db.newsletterSubscriber.findMany({
      where: { companyId: post.companyId },
      orderBy: { subscribedAt: 'desc' },
    });

    if (!subscribers.length) return;

    const transporter = this.buildTransporter();
    const from = process.env['SMTP_FROM'] || 'no-reply@nexara.com.mx';
    const baseUrl = (process.env['PUBLIC_WEB_URL'] || process.env['WEB_URL'] || 'https://nexara.com.mx')
      .replace(/\/+$/, '');
    // «Ver noticia» abre la noticia, no la portada, cuando el blog del sitio la publica.
    const esDelSitio = await this.publicCompanyId()
      .then((id) => id === post.companyId)
      .catch(() => false);
    const newsUrl = ligaDeLaNoticia(baseUrl, post.slug, esDelSitio);
    const preview = this.buildNewsPreview(post.summary, post.content);

    const chunkSize = 25;
    for (let i = 0; i < subscribers.length; i += chunkSize) {
      const chunk = subscribers.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map((subscriber) => {
          const correo = correoDeNoticia({
            suscriptor: subscriber.name,
            tituloDeLaNoticia: post.title,
            resumen: preview,
            liga: newsUrl,
          });

          return transporter.sendMail({
            from: remitenteConNombre(from),
            to: subscriber.email,
            subject: correo.subject,
            html: correo.html,
            text: correo.text,
          });
        }),
      );
    }
  }

  private buildNewsPreview(summary: string | null, content: string) {
    const clean = (summary?.trim() || content.trim()).replace(/\s+/g, ' ');
    if (clean.length <= 200) return clean;
    return `${clean.slice(0, 199)}…`;
  }
}
