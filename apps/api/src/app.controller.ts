import {
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from './common/rbac.guard.js';
import { PERMISSIONS } from './common/permissions.js';

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
  async exportAll(@Res() res: Response) {
    const data = await this.appService.exportAll();
    res.header('Content-Type', 'application/json');
    res.attachment('nexara-backup.json');
    return res.send(JSON.stringify(data, null, 2));
  }

  @Post('import/all')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @UseInterceptors(FileInterceptor('file'))
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
