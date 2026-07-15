import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { HeroVideoService } from './hero-video.service.js';
import { UpdateHeroVideoDto } from './dto/update-hero-video.dto.js';
import { resolveLegacyUploadsDir, resolveUploadsDir } from '../common/uploads-path.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME = ['video/mp4', 'video/webm'];

@Controller('hero-video')
export class HeroVideoController {
  constructor(private readonly heroVideoService: HeroVideoService) {}

  // ── Público (sitio web) ────────────────────────────────────────────

  @Get('public')
  publicActive() {
    return this.heroVideoService.publicActive();
  }

  /** Streaming con soporte de Range (206) para que el <video> pueda buscar. */
  @Get('stream/:filename')
  async stream(
    @Param('filename') filename: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const safeName = path.basename(filename);
      const primaryDir = resolveUploadsDir('hero-video');
      const legacyDir = resolveLegacyUploadsDir('hero-video');
      const candidates = [
        path.join(primaryDir, safeName),
        path.join(legacyDir, safeName),
      ];

      let filepath: string | null = null;
      for (const candidate of candidates) {
        try {
          const realPath = await fs.realpath(candidate);
          const realUploadDir = await fs.realpath(path.dirname(candidate));
          if (
            realPath === realUploadDir ||
            realPath.startsWith(realUploadDir + path.sep)
          ) {
            await fs.access(candidate);
            filepath = candidate;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!filepath) {
        throw new NotFoundException('Video not found');
      }

      const stat = await fs.stat(filepath);
      const ext = path.extname(safeName).toLowerCase();
      const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Accept-Ranges', 'bytes');

      if (!range) {
        res.setHeader('Content-Length', stat.size);
        createReadStream(filepath).pipe(res);
        return;
      }

      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
      const chunkStart = Number.isNaN(start) ? 0 : start;
      const chunkEnd = Number.isNaN(end) ? stat.size - 1 : Math.min(end, stat.size - 1);

      if (chunkStart >= stat.size || chunkStart > chunkEnd) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${chunkStart}-${chunkEnd}/${stat.size}`);
      res.setHeader('Content-Length', chunkEnd - chunkStart + 1);
      createReadStream(filepath, { start: chunkStart, end: chunkEnd }).pipe(res);
    } catch {
      throw new NotFoundException('Video not found');
    }
  }

  // ── Admin (Studio) ─────────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'))
  adminCurrent() {
    return this.heroVideoService.adminCurrent();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'video', maxCount: 1 },
      { name: 'videoMobile', maxCount: 1 },
    ]),
  )
  upload(
    @Body('title') title: string | undefined,
    @Body('clearMobile') clearMobileRaw: string | undefined,
    @UploadedFiles()
    files?: { video?: MulterFile[]; videoMobile?: MulterFile[] },
  ) {
    const video = files?.video?.[0];
    const videoMobile = files?.videoMobile?.[0];
    this.assertValidVideo(video, false);
    this.assertValidVideo(videoMobile, false);
    const clearMobile = clearMobileRaw === 'true' || clearMobileRaw === '1';
    return this.heroVideoService.upsert({
      title,
      video,
      videoMobile,
      clearMobile,
    });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id', ParseIntPipe) id: number, @Body() payload: UpdateHeroVideoDto) {
    return this.heroVideoService.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.heroVideoService.remove(id);
  }

  // ── Validación común ───────────────────────────────────────────────

  private assertValidVideo(file?: MulterFile, required = false) {
    if (!file) {
      if (required) {
        throw new BadRequestException('Selecciona un archivo de video.');
      }
      return;
    }
    const maxSize = parseInt(process.env['MAX_VIDEO_SIZE'] || '83886080', 10); // 80MB
    if (!ALLOWED_MIME.includes(file.mimetype) || file.size > maxSize) {
      throw new BadRequestException(
        'Video inválido. Permitidos: MP4/WEBM hasta 80MB.',
      );
    }
  }
}
