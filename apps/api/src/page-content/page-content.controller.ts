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
import { resolveUploadsDir } from '../common/uploads-path.js';
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

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Controller('studio/page-content')
export class PageContentController {
  constructor(private readonly svc: PageContentService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@CurrentCompanyId() companyId: number | null) {
    return this.svc.findAll(companyId);
  }

  @Get('sections')
  @UseGuards(AuthGuard('jwt'))
  listSections() {
    return { sections: VALID_SECTIONS };
  }

  @Post('media')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
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
      const uploadDir = resolveUploadsDir('page-media');
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

  @Get('media/:filename')
  async getMedia(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const safeName = path.basename(filename);
      const primaryDir = resolveUploadsDir('page-media');
      const legacyDir = path.resolve(process.cwd(), './uploads/page-media');
      const candidates = [
        path.join(primaryDir, safeName),
        path.join(legacyDir, safeName),
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

  @Get(':section/draft')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  findDraft(@Param('section') section: string, @CurrentCompanyId() companyId: number | null) {
    return this.svc.findDraft(section, companyId);
  }

  @Post(':section/publish')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  publish(
    @Param('section') section: string,
    @Body() body: { updatedBy?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.publish(section, body?.updatedBy, companyId);
  }

  @Get(':section/revisions')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  listRevisions(@Param('section') section: string, @CurrentCompanyId() companyId: number | null) {
    return this.svc.listRevisions(section, companyId);
  }

  @Post(':section/revisions/:version/rollback')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  rollback(
    @Param('section') section: string,
    @Param('version') version: string,
    @Body() body: { updatedBy?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.rollback(section, +version, body?.updatedBy, companyId);
  }

  @Get(':section')
  findOne(@Param('section') section: string) {
    return this.svc.findPublished(section);
  }

  @Put(':section')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.STUDIO_CONTENT_MANAGE, PERMISSIONS.PANEL_WEB, PERMISSIONS.CONSOLE_ADMIN] })
  upsert(
    @Param('section') section: string,
    @Body() dto: UpsertPageContentDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.upsert(section, dto, companyId);
  }
}

