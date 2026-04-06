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
import { CurrentUser } from '../common/current-user.decorator.js';
import { ActivitiesService } from './activities.service.js';
import { UsersService } from '../users/users.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';

@Controller('activities')
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
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin: ve actividades de TODOS los usuarios no-admin + las propias
      const nonAdminUsers = await this.usersService.findNonAdminUsers();
      const allowedUserIds = [user.id, ...nonAdminUsers.map((u: { id: number }) => u.id)];
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
    if (format === 'csv') {
      const csv = this.activitiesService.toCSV(data);
      res.header('Content-Type', 'text/csv');
      res.attachment('actividades.csv');
      return res.send(csv);
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('actividades.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar actividades desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo requerido');
    }
    try {
      return await this.excelImport.importExcel('activity', file.buffer);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Archivo inválido o error de importación',
      );
    }
  }

  @Get('next-an')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  async getNextAn() {
    const next = await this.activitiesService.getNextAnNumber();
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
  async create(@CurrentUser() user: any, @Body() createActivityDto: CreateActivityDto) {
    if (!user.isSuperAdmin && createActivityDto.creadoPorId !== user.id) {
      throw new ForbiddenException(
        'Solo puedes asignar actividades creadas por ti',
      );
    }

    const targetUser = await this.usersService.findOne(createActivityDto.responsableId);
    if (!targetUser) {
      throw new ForbiddenException('Usuario responsable no encontrado');
    }
    if (!user.isSuperAdmin && targetUser.departmentId !== user.departmentId) {
      throw new ForbiddenException('Solo puedes asignar a tu propio departamento');
    }
    return this.activitiesService.create(createActivityDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_VIEW] })
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    if (user.isSuperAdmin) {
      return this.activitiesService.findAll(query);
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin: ve actividades de TODOS los usuarios no-admin + las propias
      const nonAdminUsers = await this.usersService.findNonAdminUsers();
      const allowedUserIds = [user.id, ...nonAdminUsers.map((u: { id: number }) => u.id)];
      return this.activitiesService.findByAllowedUsers(allowedUserIds);
    } else {
      return this.activitiesService.findByResponsible(user.id);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_VIEW] })
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(+id);
  }

  @Get(':id/report')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async report(@Param('id') id: string, @Res() res: Response) {
    const result = await this.activitiesService.generateTicketReport(+id);
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
  ) {
    return this.activitiesService.update(+id, updateActivityDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(+id);
  }
}
