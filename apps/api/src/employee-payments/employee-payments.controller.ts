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
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto.js';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_PRE_NOMINA } from '../common/excel/reportes.js';
import { hojaDetalleDiario, hojaHorasPorDia } from './pre-nomina-dias.js';

@Controller('employee-payments')
export class EmployeePaymentsController {
  constructor(
    private readonly service: EmployeePaymentsService,
    private readonly excel: ExcelExportService,
    private readonly policy: ModulePolicyService,
  ) {}

  /**
   * Una empresa puede dejar «Pagos a personal» solo para ciertos roles (p. ej. la dirección) con la
   * política `rbac.module_roles`. Va dentro de cada endpoint y no en un guard porque la empresa
   * activa la resuelve el `TenantInterceptor`, que corre después de los guards.
   */
  private gate(user: any, companyId: number | null) {
    return this.policy.exigir('employee-payments', user, companyId);
  }

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
  async calculateFromAttendance(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    await this.gate(user, companyId);
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
  async preNomina(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    // Las horas siguen siendo de RH y contabilidad; los montos capturados, solo de quien ve Pagos.
    const verMontos = await this.policy.puedeUsar('employee-payments', user, companyId);
    return this.service.preNomina(this.viewer(user), this.rango(desde, hasta), companyId, { verMontos });
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
    const verMontos = await this.policy.puedeUsar('employee-payments', user, companyId);
    const datos = await this.service.preNomina(this.viewer(user), rango, companyId, { verMontos, conDias: true });
    const r = datos.resumen;
    const personasDias = datos.personasDias ?? [];
    const buffer = await this.excel.exportarReporte({
      titulo: 'Pre-nómina',
      subtitulo: `Del ${rango.desde} al ${rango.hasta}`,
      hoja: 'Pre-nómina',
      columnas: verMontos ? COLUMNAS_PRE_NOMINA : COLUMNAS_PRE_NOMINA.filter((c) => c.clave !== 'montoCapturado'),
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
        '«Horas por día» y «Detalle diario» desglosan cada jornada del periodo con las mismas horas.',
        ...datos.supuestos,
      ],
      hojasExtra: [hojaHorasPorDia(personasDias, rango), hojaDetalleDiario(personasDias, rango)],
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="pre-nomina-${rango.desde}-${rango.hasta}.xlsx"`);
    return res.send(buffer);
  }

  /**
   * Sugerencia de nómina (solo lectura): horas laboradas contra productivas, pago por hora y
   * monto sugerido por persona. Sin fechas usa el periodo de nómina vigente (`periodo=anterior`
   * para el que acaba de cerrar). Lleva montos, así que pide lo mismo que la lista de pagos.
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('sugerencia-nomina')
  async sugerenciaNomina(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('periodo') periodo?: string,
  ) {
    await this.gate(user, companyId);
    if (periodo && periodo !== 'vigente' && periodo !== 'anterior') {
      throw new BadRequestException('periodo debe ser "vigente" o "anterior"');
    }
    const rango = desde || hasta ? this.rango(desde, hasta) : null;
    return this.service.sugerenciaNomina(
      this.viewer(user),
      { ...(rango ?? {}), periodo: periodo as 'vigente' | 'anterior' | undefined },
      companyId,
    );
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
  async previewPeriod(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userIds') userIds?: string,
  ) {
    // Lleva sueldos y montos sugeridos: la misma política de módulo que el resto de Pagos.
    await this.gate(user, companyId);
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
  async createPrenominaBatch(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { from?: string; to?: string; userIds?: number[] },
  ) {
    // Crea pagos: si la empresa reservó «Pagos a personal», RH no los genera por esta puerta.
    await this.gate(user, companyId);
    if (!body?.from || !body?.to) throw new BadRequestException('from y to requeridos');
    return this.service.createBorradorBatch(user, body.from, body.to, companyId, body.userIds);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('analytics')
  async analytics(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    await this.gate(user, companyId);
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
    await this.gate(user, companyId);
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
  async findAll(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    await this.gate(user, companyId);
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
  async create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CreateEmployeePaymentDto & { concepto?: string; status?: string },
    @UploadedFiles() files: any[],
  ) {
    await this.gate(user, companyId);
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.create(user, body, evidenceUrls, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id/pagado')
  async markPagado(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    await this.gate(user, companyId);
    return this.service.markPagado(+id, user?.id, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'employee-payments') }))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: UpdateEmployeePaymentDto,
    @UploadedFiles() files: any[],
  ) {
    await this.gate(user, companyId);
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.update(+id, body, evidenceUrls.length ? evidenceUrls : undefined, user?.id, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    await this.gate(user, companyId);
    return this.service.remove(+id, user?.id, companyId);
  }
}
