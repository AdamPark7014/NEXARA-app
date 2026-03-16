import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { NewsService } from './news.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateNewsPostDto } from './dto/create-news-post.dto.js';
import { UpdateNewsPostDto } from './dto/update-news-post.dto.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface NewsFiles {
  coverImage?: MulterFile[];
  gallery?: MulterFile[];
}

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'coverImage', maxCount: 1 },
      { name: 'gallery', maxCount: 8 },
    ]),
  )
  create(@Body() payload: CreateNewsPostDto, @UploadedFiles() files: NewsFiles) {
    const coverImage = files?.coverImage?.[0];
    const gallery = files?.gallery || [];

    this.validateImages(coverImage ? [coverImage] : []);
    this.validateImages(gallery);

    const normalized = this.parseListFields(payload);

    return this.newsService.create(normalized, {
      coverImage,
      gallery,
    });
  }

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string, @Query() query?: PaginationQueryDto) {
    return this.newsService.list(search, status, query);
  }

  @Get('image/:filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/news');
      const filepath = path.join(uploadDir, filename);

      const realPath = await fs.realpath(filepath);
      const realUploadDir = await fs.realpath(uploadDir);

      if (!realPath.startsWith(realUploadDir)) {
        throw new NotFoundException('File not found');
      }

      await fs.access(filepath);

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const stream = createReadStream(filepath);
      stream.pipe(res);
    } catch (_error) {
      throw new NotFoundException('Image not found');
    }
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateNewsPostDto,
  ) {
    return this.newsService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.remove(id);
  }

  private validateImages(files: MulterFile[]) {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = parseInt(process.env['MAX_FILE_SIZE'] || '5242880');

    for (const file of files) {
      if (!allowedMimes.includes(file.mimetype) || file.size > maxSize) {
        throw new BadRequestException('Invalid image file format');
      }
    }
  }

  private parseListFields<T extends CreateNewsPostDto | UpdateNewsPostDto>(dto: T) {
    const parseList = (value?: unknown) => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value as string[];
      if (typeof value !== 'string') return undefined;

      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch {
        // fall back to comma splitting
      }

      return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    };

    return {
      ...dto,
      tags: parseList(dto.tags) as string[] | undefined,
      galleryUrls: parseList(dto.galleryUrls) as string[] | undefined,
    };
  }
}
