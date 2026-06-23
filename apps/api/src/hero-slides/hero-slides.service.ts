import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto.js';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto.js';
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

@Injectable()
export class HeroSlidesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lectura ────────────────────────────────────────────────────────

  /** Slides activos para el sitio público (orden ascendente). */
  publicList() {
    return this.prisma.heroSlide.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /** Listado completo (admin) — incluye inactivos. */
  adminList() {
    return this.prisma.heroSlide.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    const slide = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!slide) throw new NotFoundException(`Hero slide ${id} no encontrado`);
    return slide;
  }

  // ── Escritura ──────────────────────────────────────────────────────

  async create(payload: CreateHeroSlideDto, file?: MulterFile) {
    const imageUrl = file
      ? await this.saveImage(file)
      : payload.imageUrl?.trim() || null;

    if (!imageUrl) {
      throw new BadRequestException(
        'Debes subir una imagen o proporcionar un imageUrl válido.',
      );
    }

    const position = payload.position ?? (await this.nextPosition());

    return this.prisma.heroSlide.create({
      data: {
        imageUrl,
        altText: payload.altText?.trim() || null,
        caption: payload.caption?.trim() || null,
        href: payload.href?.trim() || null,
        position,
        isActive: payload.isActive ?? true,
      },
    });
  }

  async update(id: number, payload: UpdateHeroSlideDto, file?: MulterFile) {
    const existing = await this.findOne(id);

    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.saveImage(file);
      await this.deleteImageFile(existing.imageUrl);
    } else {
      imageUrl = payload.imageUrl?.trim();
    }

    return this.prisma.heroSlide.update({
      where: { id },
      data: {
        imageUrl: imageUrl || undefined,
        altText: payload.altText !== undefined ? payload.altText?.trim() || null : undefined,
        caption: payload.caption !== undefined ? payload.caption?.trim() || null : undefined,
        href: payload.href !== undefined ? payload.href?.trim() || null : undefined,
        position: payload.position ?? undefined,
        isActive: payload.isActive ?? undefined,
      },
    });
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    await this.prisma.heroSlide.delete({ where: { id } });
    await this.deleteImageFile(existing.imageUrl);
  }

  /** Reordena en lote: el primer ID queda en posición 1, etc. */
  async reorder(ids: number[]) {
    const existing = await this.prisma.heroSlide.findMany({
      where: { id: { in: ids } },
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

    return this.adminList();
  }

  // ── Utilidades ─────────────────────────────────────────────────────

  private async nextPosition(): Promise<number> {
    const last = await this.prisma.heroSlide.findFirst({
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  private async saveImage(file: MulterFile): Promise<string> {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/hero');
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
      throw new InternalServerErrorException('Error al guardar la imagen del hero');
    }
  }

  private async deleteImageFile(imageUrl: string | null): Promise<void> {
    if (!imageUrl) return;
    // Solo borra archivos locales; las URLs externas (https://) se ignoran.
    const localPrefix = '/hero-slides/image/';
    if (!imageUrl.startsWith(localPrefix)) return;
    try {
      const filename = imageUrl.slice(localPrefix.length);
      const filepath = path.resolve(process.cwd(), './uploads/hero', filename);
      await fs.unlink(filepath);
    } catch {
      // Si el archivo ya no existe no es un error crítico
    }
  }
}
