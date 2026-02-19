import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { Patch, Delete, Body } from '@nestjs/common';
import { EvidencesService } from './evidences.service.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_VIEW] })
  findAll(@CurrentUser() user: any) {
    return this.evidencesService.findForHierarchy(user);
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: 'apps/api/uploads/evidences' }))
  async create(
    @CurrentUser() user: any,
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Archivo requerido');
    }
    const actividadId = Number(body.actividadId);
    if (!actividadId || Number.isNaN(actividadId)) {
      throw new BadRequestException('actividadId inválido');
    }
    const tipoEvidencia = body.tipoEvidencia || 'Evidencia';
    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;
    const payloads = files.map((file) => ({
      actividadId,
      tipoEvidencia,
      archivoUrl: `/uploads/evidences/${file.filename}`,
      userId: user.id,
      comentarios: body.comentarios || null,
      estatus: 'Pendiente',
      aprobada: false,
      latitud: Number.isFinite(latitud) ? latitud : undefined,
      longitud: Number.isFinite(longitud) ? longitud : undefined,
    }));

    return Promise.all(payloads.map((payload) => this.evidencesService.create(payload)));
  }

  // Exportar evidencias (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    res: Response,
  ) {
    const data = await this.evidencesService.findForHierarchy(user);
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
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_IMPORT] })
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
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
  ) {
    const shouldStampReview =
      updateEvidenceDto.aprobada !== undefined ||
      updateEvidenceDto.estatus !== undefined ||
      updateEvidenceDto.observacionesRevision !== undefined ||
      updateEvidenceDto.calificacionEficiencia !== undefined;

    if (shouldStampReview) {
      updateEvidenceDto.aprobadoPorId = user.id;
      updateEvidenceDto.revisadoEn = new Date();
    }

    return this.evidencesService.update(+id, updateEvidenceDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  remove(@Param('id') id: string) {
    return this.evidencesService.remove(+id);
  }

  @Delete('self/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.EVIDENCES_CREATE] })
  removeOwn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.evidencesService.removeOwn(+id, user.id);
  }
}
