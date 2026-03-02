import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Response } from 'express';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { getCvsUploadDir } from '../common/upload-paths.js';
import { CreateCvDto } from './dto/create-cv.dto.js';
import {
  AdminReviewCvDto,
  MoveCvDto,
  RecruiterReviewCvDto,
  ReorderCvDto,
  SuperadminReviewCvDto,
} from './dto/review-cv.dto.js';
import { CvsService } from './cvs.service.js';

@Controller('cvs')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CvsController {
  private readonly cvsUploadDir = getCvsUploadDir(__dirname);
  private readonly allowedImageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif'];

  constructor(private readonly cvsService: CvsService) {}

  private isAllowedCvFile(file: any) {
    const lowerName = String(file?.originalname || '').toLowerCase();
    const mimeType = String(file?.mimetype || '').toLowerCase();
    const isPdf = mimeType.includes('pdf') || lowerName.endsWith('.pdf');
    const isImage = mimeType.startsWith('image/') || this.allowedImageExtensions.some((ext) => lowerName.endsWith(ext));
    return isPdf || isImage;
  }

  private getContentType(fileName: string) {
    const lowerName = String(fileName || '').toLowerCase();
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.gif')) return 'image/gif';
    if (lowerName.endsWith('.bmp')) return 'image/bmp';
    if (lowerName.endsWith('.svg')) return 'image/svg+xml';
    if (lowerName.endsWith('.avif')) return 'image/avif';
    return 'application/octet-stream';
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  @UseInterceptors(FileInterceptor('file', { dest: getCvsUploadDir(__dirname) }))
  async create(@CurrentUser() user: any, @Body() body: CreateCvDto, @UploadedFile() file?: any) {
    if (!file) {
      throw new BadRequestException('Debes subir un archivo de CV (PDF o imagen)');
    }
    if (!this.isAllowedCvFile(file)) {
      throw new BadRequestException('Solo se permiten archivos PDF o imagen');
    }

    const tags = Array.isArray(body.tags)
      ? body.tags
      : String((body as any).tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

    return this.cvsService.create(user, {
      fullName: body.fullName,
      email: body.email,
      whatsapp: body.whatsapp,
      category: body.category,
      tags,
      employmentStatus: body.employmentStatus,
      recruiterNotes: body.recruiterNotes,
      cvFileUrl: `/uploads/cvs/${file.filename}`,
    });
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  async list(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('stage') stage?: string,
    @Query('employmentStatus') employmentStatus?: string,
    @Query('onlyMine') onlyMine?: string,
  ) {
    return this.cvsService.list(user, { search, category, stage, employmentStatus, onlyMine });
  }

  @Get('summary/stats')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  summary(@CurrentUser() user: any) {
    return this.cvsService.summary(user);
  }

  @Get(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  getOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.cvsService.getById(user, id);
  }

  @Patch(':id/recruiter-review')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  recruiterReview(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: RecruiterReviewCvDto) {
    return this.cvsService.recruiterReview(user, id, body);
  }

  @Patch(':id/admin-review')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  adminReview(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: AdminReviewCvDto) {
    return this.cvsService.adminReview(user, id, body);
  }

  @Patch(':id/superadmin-review')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  superadminReview(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: SuperadminReviewCvDto) {
    return this.cvsService.superadminReview(user, id, body);
  }

  @Patch(':id/move')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  move(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: MoveCvDto) {
    return this.cvsService.move(user, id, body.stage, body.sortOrder);
  }

  @Patch('reorder/stage')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  reorder(@CurrentUser() user: any, @Body() body: ReorderCvDto) {
    return this.cvsService.reorder(user, body.stage, body.orderedIds || []);
  }

  @Get(':id/download')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  async download(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const row = await this.cvsService.getById(user, id);
    const fileName = basename(row.cvFileUrl || 'cv.pdf');
    const absolutePath = join(this.cvsUploadDir, fileName);

    if (!existsSync(absolutePath)) {
      throw new BadRequestException('El archivo no existe en almacenamiento');
    }

    res.setHeader('Content-Type', this.getContentType(fileName));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    createReadStream(absolutePath).pipe(res);
  }

  @Get(':id/preview')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  async preview(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const row = await this.cvsService.getById(user, id);
    const fileName = basename(row.cvFileUrl || 'cv.pdf');
    const absolutePath = join(this.cvsUploadDir, fileName);

    if (!existsSync(absolutePath)) {
      throw new BadRequestException('El archivo no existe en almacenamiento');
    }

    res.setHeader('Content-Type', this.getContentType(fileName));
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    createReadStream(absolutePath).pipe(res);
  }

  @Get(':id/user-prefill')
  @RBAC({ anyPermissions: [PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.USERS_MANAGE] })
  getUserPrefill(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.cvsService.getUserPrefill(user, id);
  }
}
