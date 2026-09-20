import type { Response } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto.js';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_PRE_NOMINA } from '../common/excel/reportes.js';

@Controller('employee-payments')
export class EmployeePaymentsController {
  constructor(
    private readonly service: EmployeePaymentsService,
    private readonly excel: ExcelExportService,
  ) {}

  private validateFiles(files?: any[]) {
    if (!files?.length) return;
    const invalid = files.find((file) => {
      const name = (file.originalname || '').toLowerCase();
      const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
      const isImage = (file.mimetype || '').startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name);
      return !isPdf && !isImage;
    });
    if (invalid) throw new BadRequestException('Solo se permiten imagenes o PDF');
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Get('calculate-from-attendance')
  calculateFromAttendance(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!userId) throw new BadRequestException('userId requerido');
    return this.service.calculateFromAttendance(this.viewer(user), +userId, from, to, companyId);
  }

  /**
   * Pre-nómina del periodo: una fila por persona con horas netas, productividad y el
   * tiempo extra aprobado (lo único pagable), más lo que ya esté capturado.
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('pre-nomina')
  preNomina(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    return this.service.preNomina(this.viewer(user), this.rango(desde, hasta), companyId);
  }

  /** La misma pre-nómina en Excel, con el tema corporativo y los totales con fórmulas. */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('pre-nomina/export.xlsx')
  async preNominaExcel(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    const rango = this.rango(desde, hasta);
    const datos = await this.service.preNomina(this.viewer(user), rango, companyId);
    const r = datos.resumen;
    const buffer = await this.excel.exportarReporte({
      titulo: 'Pre-nómina',
      subtitulo: `Del ${rango.desde} al ${rango.hasta}`,
      hoja: 'Pre-nómina',
      columnas: COLUMNAS_PRE_NOMINA,
      filas: datos.filas,
      generadoPor: user?.nombre ?? null,
      generadoEn: new Date(datos.generadoAt),
      filtros: [
        { etiqueta: 'Desde', valor: rango.desde },
        { etiqueta: 'Hasta', valor: rango.hasta },
        { etiqueta: 'Alcance', valor: datos.scope === 'company' ? 'Toda la empresa' : 'Mi organigrama' },
      ],
      notas: [
        `${r.personas} persona(s) · ${r.conAvisos} con algo que revisar antes de pagar.`,
        'Las horas son netas de comida y salen de los mismos registros que los indicadores.',
        'El tiempo extra solo se paga si un jefe lo aprobó: «Extra sin aprobar» no está incluido en ningún total pagable.',
        ...datos.supuestos,
      ],
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="pre-nomina-${rango.desde}-${rango.hasta}.xlsx"`);
    return res.send(buffer);
  }

  private viewer(user: any) {
    return {
      id: Number(user?.id),
      roleKey: user?.roleKey ?? null,
      email: user?.email ?? null,
      isSuperAdmin: Boolean(user?.isSuperAdmin),
    };
  }

  private rango(desde?: string, hasta?: string) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !iso.test(desde) || !hasta || !iso.test(hasta)) {
      throw new BadRequestException('desde y hasta son obligatorios en formato AAAA-MM-DD');
    }
    if (desde > hasta) throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta"');
    return { desde, hasta };
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONTABILIDAD_MANAGE,
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.HR_VIEW,
      PERMISSIONS.HR_MANAGE,
    ],
  })
  @Get('preview-period')
  previewPeriod(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userIds') userIds?: string,
  ) {
    if (!from || !to) throw new BadRequestException('from y to requeridos');
    const ids = userIds
      ? userIds
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      : undefined;
    return this.service.previewPeriod(from, to, companyId, ids);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONTABILIDAD_MANAGE, PERMISSIONS.HR_MANAGE] })
  @Post('prenomina/batch')
  createPrenominaBatch(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { from?: string; to?: string; userIds?: number[] },
  ) {
    if (!body?.from || !body?.to) throw new BadRequestException('from y to requeridos');
    return this.service.createBorradorBatch(user, body.from, body.to, companyId, body.userIds);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('analytics')
  analytics(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) throw new BadRequestException('Empleado invalido');
    return this.service.analytics(user, { from, to, userId: parsedUserId }, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('report.pdf')
  async reportPdf(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Res() res?: Response,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) throw new BadRequestException('Empleado invalido');
    const buffer = await this.service.reportPdf(
      user,
      { from, to, userId: parsedUserId },
      user?.nombre ?? null,
      companyId,
    );
    res!.header('Content-Type', 'application/pdf');
    res!.header(
      'Content-Disposition',
      `attachment; filename="pagos-${from || 'inicio'}-${to || 'hoy'}.pdf"`,
    );
    return res!.send(buffer);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get()
  findAll(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) {
      throw new BadRequestException('Empleado invalido');
    }
    return this.service.findAll(user, { from, to, userId: parsedUserId, status }, query, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'employee-payments') }))
  create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CreateEmployeePaymentDto & { concepto?: string; status?: string },
    @UploadedFiles() files: any[],
  ) {
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.create(user, body, evidenceUrls, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id/pagado')
  markPagado(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.markPagado(+id, user?.id, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'employee-payments') }))
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: UpdateEmployeePaymentDto,
    @UploadedFiles() files: any[],
  ) {
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.update(+id, body, evidenceUrls.length ? evidenceUrls : undefined, user?.id, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.remove(+id, user?.id, companyId);
  }
}
