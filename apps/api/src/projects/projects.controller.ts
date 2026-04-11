import {
  BadRequestException,
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
  Body,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { ProjectsService } from './projects.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ProjectFiles {
  mainImage?: MulterFile[];
  gallery?: MulterFile[];
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImage', maxCount: 1 },
      { name: 'gallery', maxCount: 8 },
    ]),
  )
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @UploadedFiles() files: ProjectFiles,
  ) {
    const mainImage = files?.mainImage?.[0];
    const gallery = files?.gallery || [];

    this.validateImages(mainImage ? [mainImage] : []);
    this.validateImages(gallery);

    const payload = this.parseListFields(createProjectDto);

    return this.projectsService.create(payload, {
      mainImage,
      gallery,
    });
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Get('catalog-pdf/download')
  async downloadCatalogPdf(@Res() res: Response) {
    const pdfBuffer = await this.projectsService.buildCatalogPdf();
    const filename = `cv-empresarial-proyectos-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  }

  @Get('image/:filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/projects');
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
    return this.projectsService.findOne(id);
  }

  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImage', maxCount: 1 },
      { name: 'gallery', maxCount: 8 },
    ]),
  )
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectDto: UpdateProjectDto,
    @UploadedFiles() files: ProjectFiles,
  ) {
    const mainImage = files?.mainImage?.[0];
    const gallery = files?.gallery || [];

    this.validateImages(mainImage ? [mainImage] : []);
    this.validateImages(gallery);

    const payload = this.parseListFields(updateProjectDto);

    return this.projectsService.update(id, payload, {
      mainImage,
      gallery,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }

  @Post(':id/delete')
  removeViaPost(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
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

  private parseListFields<T extends CreateProjectDto | UpdateProjectDto>(dto: T) {
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
      services: parseList(dto.services) as string[] | undefined,
      tags: parseList(dto.tags) as string[] | undefined,
      highlights: parseList(dto.highlights) as string[] | undefined,
      galleryKeep: parseList((dto as Record<string, unknown>)['galleryKeep']) as
        | string[]
        | undefined,
    };
  }
}
