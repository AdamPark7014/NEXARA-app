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
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ActivitiesService } from './activities.service.js';
import { UsersService } from '../users/users.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly usersService: UsersService,
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
    let data;
    if (user.isSuperAdmin) {
      data = await this.activitiesService.findAll();
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      data = await this.activitiesService.findByDepartment(user.departmentId);
    } else {
      data = await this.activitiesService.findByResponsible(user.id);
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
      const json = JSON.parse(file.buffer.toString());
      this.activitiesService.importMany(json);
      return { message: 'Importación no implementada', count: 0 };
    } catch (e) {
      throw new BadRequestException('Archivo inválido o error de importación');
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
  findAll(@CurrentUser() user: any) {
    if (user.isSuperAdmin) {
      return this.activitiesService.findAll();
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      return this.activitiesService.findByDepartment(user.departmentId);
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
    // user param removed
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
  ) {
    // Solo CEO o supervisor de su equipo
    return this.activitiesService.update(+id, updateActivityDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  remove(@Param('id') id: string) {
    // Solo CEO puede borrar actividades
    return this.activitiesService.remove(+id);
  }
}
