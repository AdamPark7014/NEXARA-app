import { Controller, Post, Body, Req, UseGuards, Get, Patch, Query, Res, Delete, Param, ParseIntPipe } from '@nestjs/common';
import type { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { AttendanceHybridService } from './attendance-hybrid.service';
import { AttendanceJustificationsService } from './attendance-justifications.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_ASISTENCIA_HIBRIDA } from '../common/excel/reportes.js';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly hybridService: AttendanceHybridService,
    private readonly excelExport: ExcelExportService,
    private readonly justifications: AttendanceJustificationsService,
  ) {}

  /** Justificar la falta de un día (solo Christian): { userId, fecha: AAAA-MM-DD, motivo }. No crea checadas. */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Post('justificaciones')
  justify(
    @Req() req: any,
    @Body() body: { userId?: number; fecha?: string; motivo?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.justifications.justify(this.actor(req), body, companyId);
  }

  /** Faltas justificadas de una persona (?userId&from&to); sin userId, las propias. */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('justificaciones')
  listJustifications(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.justifications.listForUser(this.actor(req), { userId, from, to }, companyId);
  }

  /** Quitar una falta justificada (solo Christian). */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  @Delete('justificaciones/:id')
  removeJustification(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.justifications.remove(this.actor(req), id, companyId);
  }

  private actor(req: any) {
    const u = req?.user ?? {};
    return {
      id: Number(u.id),
      email: u.email ?? null,
      roleKey: u.roleKey ?? null,
      isSuperAdmin: Boolean(u.isSuperAdmin),
      permissions: Array.isArray(u.permissions) ? u.permissions : [],
    };
  }

  /**
   * Corregir la hora de una checada: sólo dirección (CEO-equivalentes) y RH, con
   * motivo de al menos 10 caracteres. Queda el antes, el después y quién lo hizo.
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    // RH no tiene `attendance.manage` (su permiso es `hr.manage`); el servicio
    // vuelve a exigir que sea dirección o RH.
    anyPermissions: [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_MANAGE],
  })
  @Patch(':id/correccion')
  correccion(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { timestamp?: string; motivo?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.attendanceService.corregirChecada(this.actor(req), id, body, companyId);
  }

  /**
   * Uniforme en la entrada: { ok: true | false | null }. Lo marcan sus jefes (organigrama y
   * despacho), dirección y RH al revisar la foto; nadie el suyo. El servicio lo vuelve a exigir.
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.HR_MANAGE,
    ],
  })
  @Patch(':id/uniforme')
  uniforme(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ok?: boolean | null },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.attendanceService.marcarUniforme(this.actor(req), id, body, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Post()
  async register(
    @Body() dto: CreateAttendanceDto,
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // req.user.id debe estar disponible si usas JWT
    return this.attendanceService.register(dto, req.user?.id, req, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('current')
  async current(@Req() req: any, @CurrentCompanyId() companyId: number | null) {
    const day = await this.attendanceService.getCurrentDay(req.user?.id, companyId);
    return day ?? null;
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('history')
  async history(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getHistory(req.user?.id, date, companyId);
  }

  /** Fotos y checadas de un colaborador — bandeja RRHH / ficha de persona. */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  @Get('for-user')
  async forUser(
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    const id = parseInt(userId || '', 10);
    const take = limit ? parseInt(limit, 10) : 20;
    return this.attendanceService.getPunchesForUser(id, take, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('day')
  async day(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getDaySummary(req.user?.id, date, companyId);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('range')
  async range(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.getRangeSummary(req.user?.id, from, to, companyId);
  }

  /**
   * Endpoint para obtener estadisticas jerarquicas de asistencia
   * Solo usuarios nivel 40+ pueden acceder
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ATTENDANCE_MANAGE] })
  @Get('hierarchy/range')
  async hierarchyRange(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
    @Query('scope') scope?: string,
  ) {
    const currentUser = req.user;
    return this.attendanceService.getHierarchyAttendanceRange(
      currentUser,
      from,
      to,
      departmentId ? parseInt(departmentId) : undefined,
      companyId,
      scope === 'subtree' ? 'subtree' : undefined,
    );
  }

  /**
   * Contraste honest ERP checador ↔ accesos Integra ACS.
   * No escribe fichajes: solo vincula por employeeNumber ↔ personId/personCode.
   */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @Get('hybrid')
  async hybrid(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('date') date?: string,
    @Query('siteId') siteId?: string,
  ) {
    const canManage = Boolean(
      req.user?.isSuperAdmin ||
        req.user?.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE) ||
        req.user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN),
    );
    const day = date || new Date().toLocaleDateString('sv-SE');
    return this.hybridService.getHybridDay(req.user, day, companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      selfOnly: !canManage,
    });
  }

  /** Excel del contraste híbrido del día (ruta literal antes de params genéricos). */
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @Get('hybrid/export.xlsx')
  async hybridExport(
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('date') date?: string,
    @Query('siteId') siteId?: string,
    @Res() res?: Response,
  ) {
    const canManage = Boolean(
      req.user?.isSuperAdmin ||
        req.user?.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE) ||
        req.user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN),
    );
    const day = date || new Date().toLocaleDateString('sv-SE');
    const data = await this.hybridService.getHybridDay(req.user, day, companyId, {
      siteId: siteId ? parseInt(siteId, 10) : null,
      selfOnly: !canManage,
    });
    // Las columnas leen el item tal cual (`excel/reportes.ts`); solo se le añade el día.
    const rows = (data.items || []).map((item: any) => ({ ...item, fecha: data.date }));
    const resumen = data.summary ?? {};
    const buffer = await this.excelExport.exportarReporte({
      titulo: 'Asistencia híbrida · checador ERP ↔ accesos ACS',
      subtitulo: `Día ${day}`,
      hoja: 'Asistencia',
      columnas: COLUMNAS_ASISTENCIA_HIBRIDA,
      filas: rows,
      generadoPor: req.user?.nombre ?? null,
      filtros: [
        { etiqueta: 'Fecha', valor: day },
        { etiqueta: 'Sitio', valor: siteId ? `#${siteId}` : 'Todos' },
        { etiqueta: 'Alcance', valor: canManage ? 'Toda la empresa' : 'Solo mi registro' },
      ],
      notas: [
        `Vinculados: ${resumen.linked ?? 0} · Solo ERP: ${resumen.erpOnly ?? 0} · Solo ACS: ${resumen.acsOnly ?? 0} · Con alertas: ${resumen.withFlags ?? 0}`,
        'Las jornadas se miden en la zona horaria de la empresa; las duraciones están en formato [h]:mm.',
      ],
    });
    res!.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res!.header(
      'Content-Disposition',
      `attachment; filename="asistencia-hibrida-${day}.xlsx"`,
    );
    return res!.send(Buffer.from(buffer));
  }
}
