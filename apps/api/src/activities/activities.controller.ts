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
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ActivitiesService } from './activities.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // Exportar actividades (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    res: Response,
  ) {
    let data;
    if (user.nivelAutoridad === 100) {
      data = await this.activitiesService.findAll();
    } else if (user.nivelAutoridad === 50) {
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
  @RBAC({ minLevel: 100 })
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

  // CEO y Supervisor pueden crear/editar actividades
  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  create(@CurrentUser() user: any, @Body() createActivityDto: CreateActivityDto) {
    // Solo pueden asignar actividades a su propio departamento si son supervisor
    if (
      user.nivelAutoridad === 50 &&
      createActivityDto.creadoPorId !== user.id
    ) {
      throw new ForbiddenException(
        'Solo puedes asignar actividades como supervisor de tu equipo',
      );
    }
    return this.activitiesService.create(createActivityDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  findAll(@CurrentUser() user: any) {
    // CEO ve todas, supervisor ve su departamento, staff solo las asignadas
    if (user.nivelAutoridad === 100) {
      return this.activitiesService.findAll();
    } else if (user.nivelAutoridad === 50) {
      return this.activitiesService.findByDepartment(user.departmentId);
    } else {
      return this.activitiesService.findByResponsible(user.id);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
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
  @RBAC({ minLevel: 100 })
  remove(@Param('id') id: string) {
    // Solo CEO puede borrar actividades
    return this.activitiesService.remove(+id);
  }
}
