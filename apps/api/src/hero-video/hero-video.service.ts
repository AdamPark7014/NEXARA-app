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
export class HeroVideoService {
  constructor(private readonly prisma: PrismaService) {}

  private async publicCompanyId() {
    return withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
  }

  async publicActive() {
    const companyId = await this.publicCompanyId();
    return withTenantBypassAsync(() =>
      this.prisma.heroVideo.findFirst({
        where: { isActive: true, companyId },
        orderBy: { id: 'desc' },
      }),
    );
  }

  adminCurrent(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.heroVideo.findFirst({
      where: companyWhere(tenantId),
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const video = await this.prisma.heroVideo.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(video, tenantId, 'Video de hero');
    return video;
  }

  async upsert(
    opts: {
      title?: string;
      video?: MulterFile;
      videoMobile?: MulterFile;
      clearMobile?: boolean;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const previous = await this.adminCurrent(tenantId);
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
        companyId: tenantId,
      },
    });

    if (previous) {
      await this.prisma.heroVideo.delete({ where: { id: previous.id } });
      if (video) await this.deleteVideoFile(previous.videoUrl);
    }

    return created;
  }

  async upload(title: string | undefined, file?: MulterFile, companyId?: number | null) {
    return this.upsert({ title, video: file }, companyId);
  }

  async update(id: number, payload: UpdateHeroVideoDto, companyId?: number | null) {
    await this.findOne(id, companyId);
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

  async remove(id: number, companyId?: number | null) {
    const existing = await this.findOne(id, companyId);
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
