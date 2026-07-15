import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateHeroVideoDto } from './dto/update-hero-video.dto.js';
import { resolveLegacyUploadsDir, resolveUploadsDir } from '../common/uploads-path.js';
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

  publicActive() {
    return this.prisma.heroVideo.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
    });
  }

  adminCurrent() {
    return this.prisma.heroVideo.findFirst({ orderBy: { id: 'desc' } });
  }

  async findOne(id: number) {
    const video = await this.prisma.heroVideo.findUnique({ where: { id } });
    if (!video) throw new NotFoundException(`Video de hero ${id} no encontrado`);
    return video;
  }

  async upsert(opts: {
    title?: string;
    video?: MulterFile;
    videoMobile?: MulterFile;
    clearMobile?: boolean;
  }) {
    const previous = await this.adminCurrent();
    const { video, videoMobile, clearMobile, title } = opts;

    if (!previous && !video) {
      throw new BadRequestException(
        'Debes subir el video desktop (formato principal).',
      );
    }

    if (!video && !videoMobile && !clearMobile && title === undefined) {
      throw new BadRequestException(
        'No hay cambios: sube desktop, móvil o un título.',
      );
    }

    if (previous && !video) {
      let videoUrlMobile = previous.videoUrlMobile;
      if (clearMobile) {
        await this.deleteVideoFile(previous.videoUrlMobile);
        videoUrlMobile = null;
      } else if (videoMobile) {
        const nextMobile = await this.saveVideo(videoMobile);
        await this.deleteVideoFile(previous.videoUrlMobile);
        videoUrlMobile = nextMobile;
      }

      return this.prisma.heroVideo.update({
        where: { id: previous.id },
        data: {
          videoUrlMobile,
          title: title !== undefined ? title.trim() || null : undefined,
        },
      });
    }

    const videoUrl = video ? await this.saveVideo(video) : previous!.videoUrl;

    let videoUrlMobile: string | null = previous?.videoUrlMobile ?? null;
    if (clearMobile) {
      await this.deleteVideoFile(previous?.videoUrlMobile);
      videoUrlMobile = null;
    } else if (videoMobile) {
      videoUrlMobile = await this.saveVideo(videoMobile);
      await this.deleteVideoFile(previous?.videoUrlMobile);
    }

    const created = await this.prisma.heroVideo.create({
      data: {
        videoUrl,
        videoUrlMobile,
        title: title?.trim() || previous?.title || null,
        isActive: true,
      },
    });

    if (previous) {
      await this.prisma.heroVideo.delete({ where: { id: previous.id } });
      if (video) await this.deleteVideoFile(previous.videoUrl);
    }

    return created;
  }

  async upload(title: string | undefined, file?: MulterFile) {
    return this.upsert({ title, video: file });
  }

  async update(id: number, payload: UpdateHeroVideoDto) {
    await this.findOne(id);
    return this.prisma.heroVideo.update({
      where: { id },
      data: {
        title:
          payload.title !== undefined
            ? payload.title?.trim() || null
            : undefined,
        isActive: payload.isActive ?? undefined,
      },
    });
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    await this.prisma.heroVideo.delete({ where: { id } });
    await this.deleteVideoFile(existing.videoUrl);
    await this.deleteVideoFile(existing.videoUrlMobile);
  }

  private async saveVideo(file: MulterFile): Promise<string> {
    try {
      const uploadDir = resolveUploadsDir('hero-video');
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

  private async deleteVideoFile(videoUrl: string | null | undefined): Promise<void> {
    if (!videoUrl) return;
    const localPrefix = '/hero-video/stream/';
    if (!videoUrl.startsWith(localPrefix)) return;
    try {
      const filename = path.basename(videoUrl.slice(localPrefix.length));
      const candidates = [
        path.join(resolveUploadsDir('hero-video'), filename),
        path.join(resolveLegacyUploadsDir('hero-video'), filename),
      ];
      for (const filepath of candidates) {
        try {
          await fs.unlink(filepath);
        } catch {
          // ignore missing
        }
      }
    } catch {
      // ignore
    }
  }
}
