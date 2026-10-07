import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { getUploadSubdir } from '../../common/upload-paths.js';
import { CSP_VISTA_PREVIA } from '../../common/files/vista-previa-documento.js';
import {
  ActivityAttachmentsService,
  ADJUNTO_MAX_BYTES,
  ADJUNTOS_MAX_POR_ENVIO,
  ADJUNTOS_SUBDIR,
  EXTENSIONES_ADJUNTO,
  extensionDe,
  nombreEnDisco,
  nombreOriginal,
  type Actor,
} from './activity-attachments.service.js';

const VER = [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN];

function actor(user: any): Actor {
  return {
    id: Number(user?.id) || 0,
    email: user?.email ?? null,
    roleKey: user?.roleKey ?? null,
    isSuperAdmin: Boolean(user?.isSuperAdmin),
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
  };
}

/** `filename*` para que «Propuesta Toks.xlsx» se guarde con su nombre, acentos incluidos. */
function disposicion(tipo: 'inline' | 'attachment', nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * Archivos adjuntos de una actividad (Excel, Word, PDF, imágenes…).
 *
 * - `GET    /activities/:id/adjuntos`                       lista
 * - `POST   /activities/:id/adjuntos`                       multipart `files` (hasta 10, 25 MB c/u)
 * - `DELETE /activities/:id/adjuntos/:adjuntoId`            lo quita de la actividad
 * - `GET    /activities/:id/adjuntos/:adjuntoId/archivo`    el archivo con su nombre y tipo
 * - `GET    /activities/:id/adjuntos/:adjuntoId/vista-previa`  HTML de Excel/CSV/Word (sin scripts)
 */
@Controller('activities/:id/adjuntos')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityAttachmentsController {
  constructor(private readonly service: ActivityAttachmentsService) {}

  @Get()
  @RBAC({ anyPermissions: VER })
  listar(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listar(activityId, actor(user), companyId);
  }

  @Post()
  @RBAC({ anyPermissions: VER })
  @UseInterceptors(
    FilesInterceptor('files', ADJUNTOS_MAX_POR_ENVIO, {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, getUploadSubdir(__dirname, ADJUNTOS_SUBDIR)),
        filename: (_req, file, cb) => cb(null, nombreEnDisco(nombreOriginal(file.originalname))),
      }),
      limits: { fileSize: ADJUNTO_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extensionDe(nombreOriginal(file.originalname));
        if (EXTENSIONES_ADJUNTO.has(ext)) cb(null, true);
        else
          cb(
            new BadRequestException(
              `No se puede adjuntar «${nombreOriginal(file.originalname)}». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto.`,
            ),
            false,
          );
      },
    }),
  )
  agregar(
    @Param('id', ParseIntPipe) activityId: number,
    @UploadedFiles() files: any[],
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!files?.length) throw new BadRequestException('Adjunta al menos un archivo');
    return this.service.agregar(
      activityId,
      files.map((f) => ({
        nombre: nombreOriginal(f.originalname) || f.filename,
        filename: f.filename,
        mimeType: f.mimetype ?? null,
        size: typeof f.size === 'number' ? f.size : null,
      })),
      actor(user),
      companyId,
    );
  }

  @Delete(':adjuntoId')
  @RBAC({ anyPermissions: VER })
  quitar(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.quitar(activityId, adjuntoId, actor(user), companyId);
  }

  @Get(':adjuntoId/archivo')
  @RBAC({ anyPermissions: VER })
  async archivo(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const { buffer, nombre, mimeType } = await this.service.archivo(activityId, adjuntoId, companyId);
    const enLinea = mimeType === 'application/pdf' || mimeType.startsWith('image/');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', disposicion(enLinea ? 'inline' : 'attachment', nombre));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(buffer);
  }

  @Get(':adjuntoId/vista-previa')
  @RBAC({ anyPermissions: VER })
  async vistaPrevia(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const html = await this.service.vistaPrevia(activityId, adjuntoId, companyId);
    if (html == null) throw new NotFoundException('Este archivo no tiene vista previa');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', CSP_VISTA_PREVIA);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(html);
  }
}
