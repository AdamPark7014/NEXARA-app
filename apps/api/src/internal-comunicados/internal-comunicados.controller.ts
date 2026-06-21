import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import {
  InternalComunicadosService,
  CreateComunicadoDto,
  UpdateComunicadoDto,
} from './internal-comunicados.service.js';

@Controller('internal-comunicados')
@UseGuards(AuthGuard('jwt'))
export class InternalComunicadosController {
  constructor(private readonly svc: InternalComunicadosService) {}

  @Post()
  create(@Body() body: CreateComunicadoDto, @CurrentUser() user: any) {
    return this.svc.create(body, user.id);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto, @Query('estado') estado?: string) {
    return this.svc.findAll(query, estado);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateComunicadoDto) {
    return this.svc.update(id, body);
  }

  @Patch(':id/enviar')
  enviar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.enviar(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
