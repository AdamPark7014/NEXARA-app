import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CaseStudiesService, CreateCaseStudyDto, UpdateCaseStudyDto } from './case-studies.service.js';

@Controller('case-studies')
@UseGuards(AuthGuard('jwt'))
export class CaseStudiesController {
  constructor(private readonly svc: CaseStudiesService) {}

  @Post()
  create(@Body() body: CreateCaseStudyDto, @CurrentUser() user: any) {
    return this.svc.create(body, user.id);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCaseStudyDto) {
    return this.svc.update(id, body);
  }

  @Patch(':id/toggle-publicado')
  togglePublicado(@Param('id', ParseIntPipe) id: number) {
    return this.svc.togglePublicado(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
