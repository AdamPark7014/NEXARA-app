import { Controller, Post, Body, Req, UseGuards, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { AttendanceHybridService } from './attendance-hybrid.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { ExcelExportService } from '../common/excel-export.service.js';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly hybridService: AttendanceHybridService,
    private readonly excelExport: ExcelExportService,
  ) {}

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
  ) {
    const currentUser = req.user;
    return this.attendanceService.getHierarchyAttendanceRange(
      currentUser,
      from,
      to,
      departmentId ? parseInt(departmentId) : undefined,
      companyId,
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
}
