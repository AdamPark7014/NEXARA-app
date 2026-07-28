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
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

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
      throw new NotFoundException('File not found');
    }
  }

  @Get('public')
  findAllPublic(@Query() query: PaginationQueryDto) {
    return this.svc.findAll(query, true, { publicSite: true });
  }

  @Get('public/by-slug/:slug')
  findBySlugPublic(@Param('slug') slug: string) {
    return this.svc.findBySlugPublic(slug);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  @UseInterceptors(FileInterceptor('coverImage'))
  create(
    @Body() body: CreateCaseStudyDto,
    @UploadedFile() coverImage: MulterFile | undefined,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.create(body, user.id, coverImage, companyId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  findAll(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.svc.findAll(query, false, { companyId });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.findOne(id, companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  @UseInterceptors(FileInterceptor('coverImage'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCaseStudyDto,
    @UploadedFile() coverImage: MulterFile | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.update(id, body, coverImage, companyId);
  }

  @Patch(':id/toggle-publicado')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  togglePublicado(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.togglePublicado(id, companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.remove(id, companyId);
  }
}
