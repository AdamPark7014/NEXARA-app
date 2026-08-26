import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { ActivitiesService } from './activities.service.js';
import { UsersService } from '../users/users.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { GetActivitiesQueryDto } from './dto/get-activities-query.dto.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';

@Controller('activities')
@UseGuards(UrlAccessGuard) // RBAC v2 — gate por URL/rol antes que RbacGuard legacy
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly usersService: UsersService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
  ) {}

  // Exportar actividades (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    res: Response,
  ) {
    let result: any;
    if (user.isSuperAdmin) {
      result = await this.activitiesService.findAll();
    } else if (this.hasTeamActivitiesScope(user)) {
      const scopeUsers = await this.usersService.findUsersForConsoleActivityScope();
      const allowedUserIds = scopeUsers.map((u: { id: number }) => u.id);
      result = await this.activitiesService.findByAllowedUsers(allowedUserIds);
    } else {
      result = await this.activitiesService.findByResponsible(user.id);
    }
    const data: any[] = Array.isArray(result) ? result : (result?.data ?? []);
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'activities');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('actividades.xlsx');
      return res.send(Buffer.from(buffer));
    }
    throw new BadRequestException('Solo se permite format=xlsx. CSV/JSON están deshabilitados.');
  }

  // Importar actividades desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      return await this.excelImport.importExcel('activity', file.buffer, companyId);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Archivo inválido o error de importación',
      );
    }
  }

  @Get('next-an')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  async getNextAn(@CurrentCompanyId() companyId: number | null) {
    const next = await this.activitiesService.getNextAnNumber(companyId);
    return { next };
  }

  @Get('detailed')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  findAllDetailed() {
    return this.activitiesService.findAllDetailed();
  }

  // CEO y Supervisor pueden crear/editar actividades
  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  async create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() createActivityDto: CreateActivityDto,
  ) {
    if (!user.isSuperAdmin && createActivityDto.creadoPorId !== user.id) {
      throw new ForbiddenException(
        'Solo puedes asignar actividades creadas por ti',
      );
    }

    const targetUser = await this.usersService.findOne(createActivityDto.responsableId, companyId);
    if (!targetUser) {
      throw new ForbiddenException('Usuario responsable no encontrado');
    }
    if (!user.isSuperAdmin && targetUser.departmentId !== user.departmentId) {
      throw new ForbiddenException('Solo puedes asignar a tu propio departamento');
    }
    return this.activitiesService.create(createActivityDto, companyId);
  }

  @Get('summary')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  summary(@CurrentCompanyId() companyId: number | null) {
    return this.activitiesService.getSummary(companyId);
  }

  @Get('dispatch-board')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  async dispatchBoard(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (user.isSuperAdmin) {
      return this.activitiesService.getDispatchBoard(companyId);
    }
    if (this.hasTeamActivitiesScope(user)) {
      const scopeUsers = await this.usersService.findUsersForConsoleActivityScope();
      const allowedUserIds = scopeUsers.map((u: { id: number }) => u.id);
      return this.activitiesService.getDispatchBoard(companyId, allowedUserIds);
    }
    return this.activitiesService.getDispatchBoard(companyId, [user.id]);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  async findAll(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query() query: GetActivitiesQueryDto,
  ) {
    const { scope } = query;

    if (scope === 'mine') {
      return this.activitiesService.findByResponsible(user.id, companyId);
    }

    if (user.isSuperAdmin) {
      return this.activitiesService.findAll(query, companyId);
    } else if (this.hasTeamActivitiesScope(user)) {
      const scopeUsers = await this.usersService.findUsersForConsoleActivityScope();
      const allowedUserIds = scopeUsers.map((u: { id: number }) => u.id);
      return this.activitiesService.findByAllowedUsers(allowedUserIds, companyId);
    } else {
      return this.activitiesService.findByResponsible(user.id, companyId);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  findOne(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.activitiesService.findOne(+id, companyId);
  }

  @Get(':id/report')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async report(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const result = await this.activitiesService.generateTicketReport(+id, companyId);
    if (!result) return res.status(404).send('Ticket no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ticket-${id}.pdf`);
    return res.send(result.pdf);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const actor = user?.id ? { id: user.id, nombre: user.nombre } : undefined;
    return this.activitiesService.update(+id, updateActivityDto, actor, companyId);
  }

  /** Ingeniero de campo: actualizar estatus de su propia OT (iniciar/finalizar). */
  @Patch(':id/execute')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACTIVITIES_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.EVIDENCES_CREATE,
    ],
  })
  async executeOwn(
    @Param('id') id: string,
    @Body() body: { estatus?: string; fechaInicio?: string; fechaFinalizacion?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const activity = await this.activitiesService.findOne(+id, companyId);
    if (!activity) throw new ForbiddenException('Actividad no encontrada');
    if (!user?.isSuperAdmin && activity.responsableId !== user.id) {
      throw new ForbiddenException('Solo puedes actualizar actividades asignadas a ti');
    }
    const allowed: UpdateActivityDto = {};
    if (body.estatus) allowed.estatus = body.estatus;
    if (body.fechaInicio) allowed.fechaInicio = body.fechaInicio;
    if (body.fechaFinalizacion) allowed.fechaFinalizacion = body.fechaFinalizacion;
    const actor = user?.id ? { id: user.id, nombre: user.nombre } : undefined;
    return this.activitiesService.update(+id, allowed, actor, companyId);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  remove(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.activitiesService.remove(+id, companyId);
  }

  /**
   * Determina si el usuario tiene scope de equipo para actividades.
   * Cubre tanto el modelo legacy (CONSOLE_ADMIN) como v2 (roleKey de manager).
   */
  private isOpsManager(user: any): boolean {
    if (!user) return false;
    if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) return true;
    const V2_OPS_MANAGER_ROLES = new Set([
      'ceo', 'dir_admin', 'dir_operaciones', 'arquitecto',
      'coord_operaciones', 'coord_admin',
    ]);
    return Boolean(user.roleKey && V2_OPS_MANAGER_ROLES.has(user.roleKey));
  }

  /** Vista de OT del equipo: managers OPS + ingeniero de soporte/NOC. */
  private hasTeamActivitiesScope(user: any): boolean {
    if (this.isOpsManager(user)) return true;
    return user?.roleKey === 'ing_soporte';
  }
}
