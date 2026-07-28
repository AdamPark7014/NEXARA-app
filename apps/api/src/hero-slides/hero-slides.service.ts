import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto.js';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto.js';
import { resolveLegacyUploadsDir, resolveUploadsDir } from '../common/uploads-path.js';
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

@Injectable()
export class HeroSlidesService {
  constructor(private readonly prisma: PrismaService) {}

  private async publicCompanyId() {
    return withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
  }

  /** Slides activos para el sitio público (orden ascendente). */
  async publicList() {
    const companyId = await this.publicCompanyId();
    return withTenantBypassAsync(() =>
      this.prisma.heroSlide.findMany({
        where: { isActive: true, companyId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  /** Listado completo (admin) — incluye inactivos. */
  adminList(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.heroSlide.findMany({
      where: companyWhere(tenantId),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const slide = await this.prisma.heroSlide.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(slide, tenantId, 'Hero slide');
    return slide;
  }

  async create(
    payload: CreateHeroSlideDto,
    files?: { image?: MulterFile; imageMobile?: MulterFile },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const imageUrl = files?.image
      ? await this.saveImage(files.image)
      : payload.imageUrl?.trim() || null;

    if (!imageUrl) {
      throw new BadRequestException(
        'Debes subir una imagen desktop o proporcionar un imageUrl válido.',
      );
    }

    const imageUrlMobile = files?.imageMobile
      ? await this.saveImage(files.imageMobile)
      : null;

    const position = payload.position ?? (await this.nextPosition(tenantId));

    return this.prisma.heroSlide.create({
      data: {
        imageUrl,
        imageUrlMobile,
        altText: payload.altText?.trim() || null,
        caption: payload.caption?.trim() || null,
        href: payload.href?.trim() || null,
        position,
        isActive: payload.isActive ?? true,
        companyId: tenantId,
      },
    });
  }

  async update(
    id: number,
    payload: UpdateHeroSlideDto,
    files?: { image?: MulterFile; imageMobile?: MulterFile },
    options?: { clearMobile?: boolean; companyId?: number | null },
  ) {
    const existing = await this.findOne(id, options?.companyId);

    let imageUrl: string | undefined;
    if (files?.image) {
      imageUrl = await this.saveImage(files.image);
      await this.deleteImageFile(existing.imageUrl);
    } else {
      imageUrl = payload.imageUrl?.trim();
    }

    let imageUrlMobile: string | null | undefined;
    if (options?.clearMobile) {
      await this.deleteImageFile(existing.imageUrlMobile);
      imageUrlMobile = null;
    } else if (files?.imageMobile) {
      imageUrlMobile = await this.saveImage(files.imageMobile);
      await this.deleteImageFile(existing.imageUrlMobile);
    }

    return this.prisma.heroSlide.update({
      where: { id },
      data: {
        imageUrl: imageUrl || undefined,
        imageUrlMobile:
          imageUrlMobile === undefined ? undefined : imageUrlMobile,
        altText:
          payload.altText !== undefined
            ? payload.altText?.trim() || null
            : undefined,
        caption:
          payload.caption !== undefined
            ? payload.caption?.trim() || null
            : undefined,
        href:
          payload.href !== undefined ? payload.href?.trim() || null : undefined,
        position: payload.position ?? undefined,
        isActive: payload.isActive ?? undefined,
      },
    });
  }

  async remove(id: number, companyId?: number | null) {
    const existing = await this.findOne(id, companyId);
    await this.prisma.heroSlide.delete({ where: { id } });
    await this.deleteImageFile(existing.imageUrl);
    await this.deleteImageFile(existing.imageUrlMobile);
  }

  async reorder(ids: number[], companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma.heroSlide.findMany({
      where: { id: { in: ids }, ...companyWhere(tenantId) },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((s) => s.id));
    const filtered = ids.filter((id) => existingSet.has(id));

    if (!filtered.length) {
      throw new BadRequestException('Ningún ID válido para reordenar.');
    }

    await this.prisma.$transaction(
      filtered.map((id, index) =>
        this.prisma.heroSlide.update({
          where: { id },
          data: { position: index + 1 },
        }),
      ),
    );

    return this.adminList(tenantId);
  }

  private async nextPosition(companyId: number): Promise<number> {
    const last = await this.prisma.heroSlide.findFirst({
      where: companyWhere(companyId),
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  private async saveImage(file: MulterFile): Promise<string> {
    try {
      const uploadDir = resolveUploadsDir('hero');
      await fs.mkdir(uploadDir, { recursive: true });

      const safeBase = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
      const filename = `${Date.now()}-${safeBase || 'slide'}`;
      const filepath = path.join(uploadDir, filename);

      await fs.writeFile(filepath, file.buffer);
      return `/hero-slides/image/${filename}`;
    } catch (_error) {
      throw new InternalServerErrorException(
        'Error al guardar la imagen del hero',
      );
    }
  }

  private async deleteImageFile(imageUrl: string | null | undefined): Promise<void> {
    if (!imageUrl) return;
    const localPrefix = '/hero-slides/image/';
    if (!imageUrl.startsWith(localPrefix)) return;
    try {
      const filename = path.basename(imageUrl.slice(localPrefix.length));
      const candidates = [
        path.join(resolveUploadsDir('hero'), filename),
        path.join(resolveLegacyUploadsDir('hero'), filename),
      ];
      for (const filepath of candidates) {
        try {
          await fs.unlink(filepath);
        } catch {
          // Si el archivo ya no existe no es un error crítico
        }
      }
    } catch {
      // Si el archivo ya no existe no es un error crítico
    }
  }
}
