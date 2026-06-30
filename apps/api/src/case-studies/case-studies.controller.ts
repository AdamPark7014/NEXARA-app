import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe, UseGuards, Res, UploadedFile, UseInterceptors, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CaseStudiesService, CreateCaseStudyDto, UpdateCaseStudyDto } from './case-studies.service.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('case-studies')
export class CaseStudiesController {
  constructor(private readonly svc: CaseStudiesService) {}

  @Get('image/:filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/case-studies');
      const filepath = path.join(uploadDir, filename);
      const realPath = await fs.realpath(filepath);
      const realUploadDir = await fs.realpath(uploadDir);
      if (!realPath.startsWith(realUploadDir)) {
        throw new NotFoundException('File not found');
      }
      await fs.access(filepath);
      const ext = path.extname(filename).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png'
          : ext === '.webp' ? 'image/webp'
            : ext === '.gif' ? 'image/gif'
              : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      createReadStream(filepath).pipe(res);
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('coverImage'))
  create(
    @Body() body: CreateCaseStudyDto,
    @UploadedFile() coverImage: MulterFile | undefined,
    @CurrentUser() user: any,
  ) {
    return this.svc.create(body, user.id, coverImage);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Query() query: PaginationQueryDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('coverImage'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCaseStudyDto,
    @UploadedFile() coverImage: MulterFile | undefined,
  ) {
    return this.svc.update(id, body, coverImage);
  }

  @Patch(':id/toggle-publicado')
  @UseGuards(AuthGuard('jwt'))
  togglePublicado(@Param('id', ParseIntPipe) id: number) {
    return this.svc.togglePublicado(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
