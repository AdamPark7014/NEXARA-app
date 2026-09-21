import type { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Put,
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
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { ViaticosService } from './viaticos.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_VIATICOS } from '../common/excel/reportes.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { CreateViaticoDto } from './dto/create-viatico.dto.js';
import { AssignViaticoDto } from './dto/assign-viatico.dto.js';
import { AssignViaticoLoteDto } from './dto/assign-viatico-lote.dto.js';
import { UpdateViaticoDto } from './dto/update-viatico.dto.js';
import { ComprobarViaticoDto, SetViaticoRepartoDto } from './dto/viatico-reparto.dto.js';

@Controller('viatics')
@UseGuards(UrlAccessGuard)
export class ViaticosController {
  constructor(
    private readonly viaticosService: ViaticosService,
    private readonly excelExport: ExcelExportService,
  ) {}

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE] })
  async findAll(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Query() query: PaginationQueryDto) {
    return this.viaticosService.findAll(user, query, companyId);
  }

  @Get('analytics')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE] })
  analytics(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.viaticosService.analytics(
      {
        from: from || undefined,
        to: to || undefined,
        projectId: projectId ? Number(projectId) : undefined,
      },
      user,
      companyId,
    );
  }

  @Get('report.pdf')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_EXPORT] })
  async reportPdf(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('projectId') projectId?: string,
    @Res() res?: Response,
  ) {
    const buffer = await this.viaticosService.reportPdf(
      {
        from: from || undefined,
        to: to || undefined,
        projectId: projectId ? Number(projectId) : undefined,
      },
      user?.nombre ?? null,
      user,
      companyId,
    );
    res!.header('Content-Type', 'application/pdf');
    res!.header(
      'Content-Disposition',
      `attachment; filename="viaticos-${from || 'inicio'}-${to || 'hoy'}.pdf"`,
    );
    return res!.send(buffer);
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_CREATE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'viatics') }))
  create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CreateViaticoDto,
    @UploadedFile() file?: any,
  ) {
    const ticketEvidenciaUrl = file
      ? `/uploads/viatics/${file.filename}`
      : body.ticketEvidenciaUrl ?? body.comprobante ?? null;
    if (!ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el ticket o comprobante');
    }
    return this.viaticosService.create(
      {
        usuarioId: (() => {
          const elevated =
            user.isSuperAdmin ||
            user.permissions?.includes(PERMISSIONS.VIATICS_MANAGE) ||
            user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);
          return elevated && body.usuarioId ? Number(body.usuarioId) : user.id;
        })(),
        actividadId: body.actividadId ? Number(body.actividadId) : null,
        projectId: body.projectId ? Number(body.projectId) : null,
        vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
        categoria: body.categoria,
        montoSolicitado: Number(body.montoSolicitado),
        motivo: body.motivo ?? body.concepto,
        ticketEvidenciaUrl,
        estatus: 'Pendiente',
        partes: body.partes,
      },
      user,
      companyId,
    );
  }

  /**
   * Asigna el mismo viático a varias personas y/o varias actividades de una vez:
   * la cuadrilla que sale el lunes a cubrir la semana. `montoPorPersona` es lo
   * que recibe cada beneficiario, no el total del lote.
   */
  @Post('assign/lote')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  assignLote(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: AssignViaticoLoteDto,
  ) {
    return this.viaticosService.assignLote(
      {
        usuarioIds: body.usuarioIds,
        actividadIds: body.actividadIds,
        projectId: body.projectId ?? null,
        vehicleId: body.vehicleId ?? null,
        categoria: body.categoria,
        montoPorPersona: Number(body.montoPorPersona),
        motivo: body.motivo,
        desde: body.desde,
        hasta: body.hasta,
      },
      user,
      companyId,
    );
  }

  /** Asigna viático a un usuario para actividad/proyecto (sin evidencia previa). */
  @Post('assign')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  assign(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: AssignViaticoDto,
  ) {
    if (!body.usuarioId) {
      throw new BadRequestException('Debes indicar el usuario beneficiario');
    }
    return this.viaticosService.assign(
      {
        usuarioId: Number(body.usuarioId),
        actividadId: body.actividadId ? Number(body.actividadId) : null,
        projectId: body.projectId ? Number(body.projectId) : null,
        vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
        categoria: body.categoria,
        montoSolicitado: Number(body.montoSolicitado),
        motivo: body.motivo ?? body.concepto,
        partes: body.partes,
      },
      user,
      companyId,
    );
  }

  /**
   * Reparte el costo de un viático entre varias actividades.
   *
   * Vive aparte del alta porque el reparto se decide cuando se sabe qué visitas
   * cubrió el viaje —a veces al volver—, y porque el alta con ticket viaja en
   * `multipart`, donde una lista anidada no sobrevive.
   *
   * Mismos permisos que crear un viático: quien lo pidió sabe entre qué
   * actividades repartirlo. El servicio impide tocar los de terceros a quien no
   * administra viáticos.
   */
  @Put(':id/reparto')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_CREATE] })
  setReparto(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: SetViaticoRepartoDto,
  ) {
    return this.viaticosService.setReparto(+id, body.partes, user, companyId);
  }

  /** Comprueba el anticipo con tickets y deja el saldo a favor o en contra. */
  @Patch(':id/comprobar')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_CREATE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'viatics') }))
  comprobar(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: ComprobarViaticoDto,
    @UploadedFile() file?: any,
  ) {
    return this.viaticosService.comprobar(
      +id,
      {
        montoComprobado: body.montoComprobado,
        ticketEvidenciaUrl: file ? `/uploads/viatics/${file.filename}` : body.ticketEvidenciaUrl,
        nota: body.nota,
      },
      user,
      companyId,
    );
  }

  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    if (format !== 'xlsx') {
      throw new BadRequestException('Solo se permite format=xlsx. CSV/JSON están deshabilitados.');
    }
    const result = await this.viaticosService.findAll(user, undefined, companyId);
    const data: any[] = Array.isArray(result) ? result : (result as any).data;
    const buffer = await this.excelExport.exportarReporte({
      titulo: 'Viáticos',
      subtitulo: 'Solicitudes y asignaciones visibles según tu rol',
      hoja: 'Viáticos',
      columnas: COLUMNAS_VIATICOS,
      filas: data ?? [],
      generadoPor: user?.nombre ?? null,
      hojaInformacion: true,
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('viaticos.xlsx');
    return res.send(buffer);
  }

  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() _file: any,
    @Res() res: Response,
    @CurrentCompanyId() companyId: number | null,
  ) {
    try {
      this.viaticosService.importMany([{ _disabled: true }], companyId);
    } catch (err) {
      if (err instanceof BadRequestException) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message:
            'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
        });
      }
      throw err;
    }
    return res.status(HttpStatus.BAD_REQUEST).json({
      message:
        'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
    });
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE] })
  findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.viaticosService.findOne(+id, user, companyId);
  }

  @Patch(':id/approve')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { action?: 'approve' | 'reject'; note?: string; montoAprobado?: number | string },
  ) {
    const action = body.action === 'reject' ? 'reject' : 'approve';
    return this.viaticosService.approveOrReject(
      +id,
      user,
      action,
      body.note,
      companyId,
      body.montoAprobado,
    );
  }

  @Patch(':id/pagado')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  markPagado(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.viaticosService.markPagado(+id, user?.id, companyId);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'viatics') }))
  update(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: UpdateViaticoDto,
    @UploadedFile() file?: any,
  ) {
    const data: Record<string, unknown> = {};
    if (file) data.ticketEvidenciaUrl = `/uploads/viatics/${file.filename}`;
    if (body.ticketEvidenciaUrl !== undefined) data.ticketEvidenciaUrl = body.ticketEvidenciaUrl;
    if (body.comprobante !== undefined) data.ticketEvidenciaUrl = body.comprobante;
    if (body.motivo !== undefined || body.concepto !== undefined) {
      data.motivo = body.motivo ?? body.concepto;
    }
    if (body.montoSolicitado !== undefined) {
      data.montoSolicitado = Number(body.montoSolicitado);
    }
    if (body.categoria !== undefined) data.categoria = body.categoria;
    if (body.projectId !== undefined) {
      data.projectId = body.projectId ? Number(body.projectId) : null;
    }
    if (body.actividadId !== undefined) {
      data.actividadId = body.actividadId ? Number(body.actividadId) : null;
    }
    if (body.vehicleId !== undefined) {
      data.vehicleId = body.vehicleId ? Number(body.vehicleId) : null;
    }
    if (body.partes !== undefined) data.partes = body.partes;
    return this.viaticosService.update(+id, data, companyId);
  }
}
