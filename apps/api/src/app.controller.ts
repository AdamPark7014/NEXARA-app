import {
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from './common/rbac.guard.js';
import { PERMISSIONS } from './common/permissions.js';

/**
 * Respaldo e importación de todo: solo la plataforma. Con CONSOLE_ADMIN, el administrador de una
 * empresa sacaba actividades y evidencias sin filtro y la importación aceptaba cualquier `companyId`.
 * Va como guarda (no dentro del método) para que el archivo ni siquiera se lea antes de negar.
 */
@Injectable()
class SoloPlataformaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.isSuperAdmin || user?.superadmin || user?.roleKey === 'super_admin') return true;
    throw new ForbiddenException('Solo la plataforma exporta o importa todo.');
  }
}

@Controller()
@UseGuards(RbacGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('dashboard')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.EXECUTIVE_DASHBOARD] })
  async dashboard() {
    return this.appService.getDashboardStats();
  }

  @Get('export/all')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @UseGuards(SoloPlataformaGuard)
  async exportAll(@Res() res: Response) {
    const data = await this.appService.exportAll();
    res.header('Content-Type', 'application/json');
    res.attachment('nexara-backup.json');
    return res.send(JSON.stringify(data, null, 2));
  }

  @Post('import/all')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @UseGuards(SoloPlataformaGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async importAll(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      const json = JSON.parse(file.buffer.toString());
      const result = await this.appService.importAll(json);
      return { message: 'Importación general exitosa', ...result };
    } catch {
      throw new BadRequestException('Archivo inválido o error de importación');
    }
  }
}
