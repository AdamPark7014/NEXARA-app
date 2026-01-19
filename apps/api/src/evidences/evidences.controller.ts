import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { Patch, Delete, Body } from '@nestjs/common';
import { EvidencesService } from './evidences.service.js';

@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  // Exportar evidencias (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  // @RBAC({ minLevel: 50 }) // Corregido: línea fuera de contexto, revisar ubicación si es necesario
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    res: Response,
  ) {
    let data;
    if (user.nivelAutoridad === 100) {
      data = await this.evidencesService.findAll();
    } else {
      data = await this.evidencesService.findByDepartment(user.departmentId);
    }
    if (format === 'csv') {
      const csv = this.evidencesService.toCSV(data);
      res.header('Content-Type', 'text/csv');
      res.attachment('evidencias.csv');
      return res.send(csv);
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('evidencias.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar evidencias desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 100 })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      const json = JSON.parse(file.buffer.toString());
      const result = await this.evidencesService.importMany(json);
      return { message: 'Importación exitosa', count: result.length };
    } catch (e) {
      throw new BadRequestException('Archivo inválido o error de importación');
    }
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  update(
    // user param removed
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
  ) {
    return this.evidencesService.update(+id, updateEvidenceDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 100 })
  remove(@Param('id') id: string) {
    return this.evidencesService.remove(+id);
  }
}
