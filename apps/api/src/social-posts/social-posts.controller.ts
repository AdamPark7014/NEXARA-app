import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { SocialPostsService, CreateSocialPostDto, UpdateSocialPostDto } from './social-posts.service.js';

@Controller('social-posts')
@UseGuards(AuthGuard('jwt'))
export class SocialPostsController {
  constructor(private readonly svc: SocialPostsService) {}

  @Post()
  create(@Body() body: CreateSocialPostDto, @CurrentUser() user: any) {
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
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSocialPostDto) {
    return this.svc.update(id, body);
  }

  @Patch(':id/estado')
  setEstado(@Param('id', ParseIntPipe) id: number, @Body('estado') estado: string) {
    return this.svc.setEstado(id, estado);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
