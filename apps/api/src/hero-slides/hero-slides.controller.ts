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
      const uploadDir = path.resolve(process.cwd(), './uploads/hero');
      const filepath = path.join(uploadDir, filename);

      const realPath = await fs.realpath(filepath);
      const realUploadDir = await fs.realpath(uploadDir);
      if (!realPath.startsWith(realUploadDir)) {
        throw new NotFoundException('File not found');
      }

      await fs.access(filepath);

      const ext = path.extname(filename).toLowerCase();
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
  @UseGuards(AuthGuard('jwt'))
  adminList() {
    return this.heroSlidesService.adminList();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.heroSlidesService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
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
  ) {
    const image = files?.image?.[0];
    const imageMobile = files?.imageMobile?.[0];
    this.assertValidImage(image, false);
    this.assertValidImage(imageMobile, false);
    return this.heroSlidesService.create(payload, { image, imageMobile });
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
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
      { clearMobile },
    );
  }

  @Patch('reorder')
  @UseGuards(AuthGuard('jwt'))
  reorder(@Body() payload: ReorderHeroSlidesDto) {
    return this.heroSlidesService.reorder(payload.ids);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.heroSlidesService.remove(id);
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
