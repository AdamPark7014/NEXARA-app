import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
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
import { HeroSlidesService } from './hero-slides.service.js';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto.js';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto.js';
import { ReorderHeroSlidesDto } from './dto/reorder-hero-slides.dto.js';
import { resolveLegacyUploadsDir, resolveUploadsDir } from '../common/uploads-path.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Controller('hero-slides')
export class HeroSlidesController {
  constructor(private readonly heroSlidesService: HeroSlidesService) {}

  // ── Público (sitio web) ────────────────────────────────────────────

  @Get('public')
  publicList() {
    return this.heroSlidesService.publicList();
  }

  @Get('image/:filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const safeName = path.basename(filename);
      const candidates = [
        path.join(resolveUploadsDir('hero'), safeName),
        path.join(resolveLegacyUploadsDir('hero'), safeName),
      ];

      let filepath: string | null = null;
      for (const candidate of candidates) {
        try {
          const realPath = await fs.realpath(candidate);
          const realUploadDir = await fs.realpath(path.dirname(candidate));
          if (realPath === realUploadDir || realPath.startsWith(realUploadDir + path.sep)) {
            await fs.access(candidate);
            filepath = candidate;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!filepath) {
        throw new NotFoundException('Image not found');
      }

      const ext = path.extname(safeName).toLowerCase();
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      createReadStream(filepath).pipe(res);
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  // ── Admin (Studio) ─────────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  adminList(@CurrentCompanyId() companyId: number | null) {
    return this.heroSlidesService.adminList(companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.heroSlidesService.findOne(id, companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageMobile', maxCount: 1 },
    ]),
  )
  create(
    @Body() payload: CreateHeroSlideDto,
    @UploadedFiles()
    files?: { image?: MulterFile[]; imageMobile?: MulterFile[] },
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const image = files?.image?.[0];
    const imageMobile = files?.imageMobile?.[0];
    this.assertValidImage(image, false);
    this.assertValidImage(imageMobile, false);
    return this.heroSlidesService.create(payload, { image, imageMobile }, companyId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'imageMobile', maxCount: 1 },
    ]),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateHeroSlideDto & { clearMobile?: string },
    @UploadedFiles()
    files?: { image?: MulterFile[]; imageMobile?: MulterFile[] },
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const image = files?.image?.[0];
    const imageMobile = files?.imageMobile?.[0];
    this.assertValidImage(image, false);
    this.assertValidImage(imageMobile, false);
    const clearMobile =
      payload.clearMobile === 'true' || payload.clearMobile === '1';
    return this.heroSlidesService.update(
      id,
      payload,
      { image, imageMobile },
      { clearMobile, companyId },
    );
  }

  @Patch('reorder')
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  reorder(@Body() payload: ReorderHeroSlidesDto, @CurrentCompanyId() companyId: number | null) {
    return this.heroSlidesService.reorder(payload.ids, companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.heroSlidesService.remove(id, companyId);
  }

  // ── Validación común ───────────────────────────────────────────────

  private assertValidImage(file?: MulterFile, required = false) {
    if (!file) {
      if (required) {
        throw new BadRequestException('Selecciona la imagen desktop.');
      }
      return;
    }
    const maxSize = parseInt(process.env['MAX_FILE_SIZE'] || '5242880', 10);
    if (!ALLOWED_MIME.includes(file.mimetype) || file.size > maxSize) {
      throw new BadRequestException(
        'Imagen inválida. Permitidos: JPG/PNG/WEBP/GIF hasta 5MB.',
      );
    }
  }
}
