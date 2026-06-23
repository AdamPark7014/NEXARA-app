// ...existing code...
import {
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  // HttpStatus,
  BadRequestException,
  // InternalServerErrorException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service.js';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // @Get() endpoint removed: getHello() does not exist in AppService

  // Dashboard: métricas agregadas
  @Get('dashboard')
  async dashboard() {
    const result = await this.appService.getDashboardStats();
    // Removed error check for result.error as the type does not have this property
    return result;
  }

  // Exportar toda la información relevante
  @Get('export/all')
  async exportAll(@Res() res: Response) {
    const data = await this.appService.exportAll();
    res.header('Content-Type', 'application/json');
    res.attachment('nexara-backup.json');
    return res.send(JSON.stringify(data, null, 2));
  }

  // Importar toda la información relevante
  @Post('import/all')
  @UseInterceptors(FileInterceptor('file'))
  async importAll(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      const json = JSON.parse(file.buffer.toString());
      const result = await this.appService.importAll(json);
      return { message: 'Importación general exitosa', ...result };
    } catch (e) {
      throw new BadRequestException('Archivo inválido o error de importación');
    }
  }
}
