import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateHeroVideoDto } from './dto/update-hero-video.dto.js';
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
export class HeroVideoService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lectura ────────────────────────────────────────────────────────

  /** Video activo para el sitio público, o null si no hay ninguno configurado. */
  publicActive() {
    return this.prisma.heroVideo.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
  }

  /** Registro actual (admin) — el más reciente, sin filtrar por isActive. */
  adminCurrent() {
    return this.prisma.heroVideo.findFirst({ orderBy: { id: 'desc' } });
  }

  async findOne(id: number) {
    const video = await this.prisma.heroVideo.findUnique({ where: { id } });
    if (!video) throw new NotFoundException(`Video de hero ${id} no encontrado`);
    return video;
  }

  // ── Escritura ──────────────────────────────────────────────────────

  /** Sube (o reemplaza) el video del hero. Es un singleton lógico: el
   *  registro y archivo previos se eliminan al confirmar el nuevo. */
  async upload(title: string | undefined, file?: MulterFile) {
    if (!file) {
      throw new BadRequestException('Debes subir un archivo de video.');
    }

    const videoUrl = await this.saveVideo(file);
    const previous = await this.adminCurrent();

    const created = await this.prisma.heroVideo.create({
      data: {
        videoUrl,
        title: title?.trim() || null,
        isActive: true,
      },
    });

    if (previous) {
      await this.prisma.heroVideo.delete({ where: { id: previous.id } });
      await this.deleteVideoFile(previous.videoUrl);
    }

    return created;
  }

  async update(id: number, payload: UpdateHeroVideoDto) {
    await this.findOne(id);
    return this.prisma.heroVideo.update({
      where: { id },
      data: {
        title: payload.title !== undefined ? payload.title?.trim() || null : undefined,
        isActive: payload.isActive ?? undefined,
      },
    });
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    await this.prisma.heroVideo.delete({ where: { id } });
    await this.deleteVideoFile(existing.videoUrl);
  }

  // ── Utilidades ─────────────────────────────────────────────────────

  private async saveVideo(file: MulterFile): Promise<string> {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/hero-video');
      await fs.mkdir(uploadDir, { recursive: true });

      const safeBase = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
      const filename = `${Date.now()}-${safeBase || 'video'}`;
      const filepath = path.join(uploadDir, filename);

      await fs.writeFile(filepath, file.buffer);
      return `/hero-video/stream/${filename}`;
    } catch (_error) {
      throw new InternalServerErrorException('Error al guardar el video del hero');
    }
  }

  private async deleteVideoFile(videoUrl: string | null): Promise<void> {
    if (!videoUrl) return;
    const localPrefix = '/hero-video/stream/';
    if (!videoUrl.startsWith(localPrefix)) return;
    try {
      const filename = videoUrl.slice(localPrefix.length);
      const filepath = path.resolve(process.cwd(), './uploads/hero-video', filename);
      await fs.unlink(filepath);
    } catch {
      // Si el archivo ya no existe no es un error crítico
    }
  }
}
