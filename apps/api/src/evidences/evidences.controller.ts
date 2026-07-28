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
  ForbiddenException,
  Query,
  Res,
  Patch,
  Delete,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { EvidencesService } from './evidences.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';

@Controller('evidences')
export class EvidencesController {
  constructor(
    private readonly evidencesService: EvidencesService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
  ) {}

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.EVIDENCES_VIEW,
      PERMISSIONS.EVIDENCES_REVIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.evidencesService.findForHierarchy(user, query, companyId);
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: getUploadSubdir(__dirname, 'evidences') }))
  async create(
    @CurrentUser() user: any,
    @UploadedFiles() files: any[],
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
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

    return Promise.all(payloads.map((payload) => this.evidencesService.create(payload, companyId)));
  }

  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const result = await this.evidencesService.findForHierarchy(user, undefined, companyId);
    const data: any[] = Array.isArray(result) ? result : (result as any).data;
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'evidences');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('evidencias.xlsx');
      return res.send(Buffer.from(buffer));
    }
    throw new BadRequestException('Solo se permite format=xlsx. CSV/JSON estan deshabilitados.');
  }

  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @CurrentCompanyId() companyId: number | null) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      const json = JSON.parse(file.buffer.toString());
      const result = await this.evidencesService.importMany(json, companyId);
      return { message: 'Importación exitosa', count: result.length };
    } catch (e) {
      try {
        return await this.excelImport.importExcel('evidence', file.buffer, companyId);
      } catch (excelError) {
        if (excelError instanceof ForbiddenException) throw excelError;
        throw new BadRequestException(
          excelError instanceof Error ? excelError.message : 'Archivo inválido o error de importación',
        );
      }
    }
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
    @CurrentCompanyId() companyId: number | null,
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

    return this.evidencesService.update(+id, updateEvidenceDto, companyId);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  remove(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.evidencesService.remove(+id, companyId);
  }

  @Delete('self/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.EVIDENCES_CREATE] })
  removeOwn(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.evidencesService.removeOwn(+id, user.id, companyId);
  }
}
