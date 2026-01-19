import { Controller, Get, Post, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('gps')
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  create(@CurrentUser() user: any, @Body() createGpsDto: CreateGpsDto) { 
    // Staff solo puede registrar su propia ubicación
    if (user.nivelAutoridad === 10 && createGpsDto.usuarioId !== user.id) {
      throw new ForbiddenException('Solo puedes registrar tu propia ubicación');
    }
    return this.gpsService.create(createGpsDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  findAll(@CurrentUser() user: any) {
    // CEO ve todos, supervisor ve su departamento
    if (user.nivelAutoridad === 100) {
      return this.gpsService.findAll();
    } else {
      return this.gpsService.findByDepartment(user.departmentId);
    }
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 10 })
  findOne(@Param('id') id: string) {
    return this.gpsService.findOne(+id);
  }
}
