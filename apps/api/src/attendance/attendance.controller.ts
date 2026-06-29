import { Controller, Post, Body, Req, UseGuards, Get, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Post()
  async register(@Body() dto: CreateAttendanceDto, @Req() req: any) {
    // req.user.id debe estar disponible si usas JWT
    return this.attendanceService.register(dto, req.user?.id, req);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('current')
  async current(@Req() req: any) {
    const day = await this.attendanceService.getCurrentDay(req.user?.id);
    return day ?? null;
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('history')
  async history(@Req() req: any, @Query('date') date?: string) {
    return this.attendanceService.getHistory(req.user?.id, date);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('day')
  async day(@Req() req: any, @Query('date') date?: string) {
    return this.attendanceService.getDaySummary(req.user?.id, date);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Get('range')
  async range(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.getRangeSummary(req.user?.id, from, to);
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
    );
  }
}
