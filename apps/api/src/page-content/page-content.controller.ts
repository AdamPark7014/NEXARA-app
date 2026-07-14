import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { PageContentService, VALID_SECTIONS } from './page-content.service.js';
import { UpsertPageContentDto } from './dto/upsert-page-content.dto.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Controller('studio/page-content')
export class PageContentController {
  constructor(private readonly svc: PageContentService) {}

  /** GET /api/studio/page-content — lista todas las secciones guardadas */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.svc.findAll();
  }

  /** GET /api/studio/page-content/sections — lista las secciones válidas */
  @Get('sections')
  @UseGuards(AuthGuard('jwt'))
  listSections() {
    return { sections: VALID_SECTIONS };
  }

  /** POST /api/studio/page-content/media — sube imagen para slots de página */
  @Post('media')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('image'))
  async uploadMedia(@UploadedFile() file?: MulterFile) {
    if (!file) {
      throw new BadRequestException('Selecciona una imagen.');
    }
    const maxSize = parseInt(process.env['MAX_FILE_SIZE'] || '5242880', 10);
    if (!ALLOWED_MIME.includes(file.mimetype) || file.size > maxSize) {
      throw new BadRequestException(
        'Imagen inválida. Permitidos: JPG/PNG/WEBP/GIF hasta 5MB.',
      );
    }

    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/page-media');
      await fs.mkdir(uploadDir, { recursive: true });
      const safeBase = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
      const filename = `${Date.now()}-${safeBase || 'page'}`;
      await fs.writeFile(path.join(uploadDir, filename), file.buffer);
      return { url: `/studio/page-content/media/${filename}` };
    } catch {
      throw new InternalServerErrorException('Error al guardar la imagen');
    }
  }

  /** GET /api/studio/page-content/media/:filename — sirve imagen de página */
  @Get('media/:filename')
  async getMedia(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/page-media');
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

  /**
   * GET /api/studio/page-content/:section
   * Uso público (landing page) y Studio.
   */
  @Get(':section')
  findOne(@Param('section') section: string) {
    return this.svc.findOne(section);
  }

  /**
   * PUT /api/studio/page-content/:section
   * Solo Studio.
   */
  @Put(':section')
  @UseGuards(AuthGuard('jwt'))
  upsert(
    @Param('section') section: string,
    @Body() dto: UpsertPageContentDto,
  ) {
    return this.svc.upsert(section, dto);
  }
}
