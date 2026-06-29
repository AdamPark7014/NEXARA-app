import type { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ViaticosService } from './viaticos.service.js';
import { UsersService } from '../users/users.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { getUploadSubdir } from '../common/upload-paths.js';

@Controller('viatics')
@UseGuards(UrlAccessGuard) // RBAC v2 — gate por URL/rol antes que RbacGuard legacy
export class ViaticosController {
  constructor(
    private readonly viaticosService: ViaticosService,
    private readonly usersService: UsersService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
  ) {}

  // Endpoint para obtener todos los viáticos
  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_VIEW] })
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    return this.viaticosService.findAll(user, query);
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_CREATE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'viatics') }))
  create(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file?: any) {
    const ticketEvidenciaUrl = file
      ? `/uploads/viatics/${file.filename}`
      : body.ticketEvidenciaUrl ?? body.comprobante ?? null;
    if (!ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el ticket o comprobante');
    }
    return this.viaticosService.create({
      usuarioId: body.usuarioId ? Number(body.usuarioId) : user.id,
      actividadId: body.actividadId ? Number(body.actividadId) : null,
      projectId: body.projectId ? Number(body.projectId) : null,
      montoSolicitado: Number(body.montoSolicitado),
      motivo: body.motivo ?? body.concepto,
      ticketEvidenciaUrl,
      estatus: body.estatus ?? 'Pendiente',
    });
  }

  // Exportar viáticos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_EXPORT] })
  async export(@CurrentUser() user: any, @Param('format') format: string, @Res() res: Response) {
    const result = await this.viaticosService.findAll(user);
    const data: any[] = Array.isArray(result) ? result : (result as any).data;
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'viatics');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('viaticos.xlsx');
      return res.send(Buffer.from(buffer));
    }
    if (format === 'csv') {
      res.header('Content-Type', 'text/csv');
      res.attachment('viaticos.csv');
      return res.send('');
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('viaticos.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar viáticos desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @Res() res: Response) {
    if (!file) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo requerido' });
    }
    try {
      const result = await this.excelImport.importExcel('viatic', file.buffer);
      return res.json(result);
    } catch (e) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: e instanceof Error ? e.message : 'Archivo inválido o error de importación' });
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_VIEW] })
  findOne(@Param('id') id: string) {
    return this.viaticosService.findOne(+id);
  }

  @Patch(':id/approve')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action?: 'approve' | 'reject'; note?: string },
  ) {
    const action = body.action === 'reject' ? 'reject' : 'approve';
    return this.viaticosService.approveOrReject(+id, user, action, body.note);
  }

  @Patch(':id/pagado')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  markPagado(@Param('id') id: string) {
    return this.viaticosService.markPagado(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'viatics') }))
  update(@Param('id') id: string, @Body() body: any, @UploadedFile() file?: any) {
    const data: Record<string, unknown> = { ...body };
    if (file) data.ticketEvidenciaUrl = `/uploads/viatics/${file.filename}`;
    if (body.motivo !== undefined || body.concepto !== undefined) {
      data.motivo = body.motivo ?? body.concepto;
    }
    if (body.montoSolicitado !== undefined) {
      data.montoSolicitado = Number(body.montoSolicitado);
    }
    return this.viaticosService.update(+id, data);
  }
}


