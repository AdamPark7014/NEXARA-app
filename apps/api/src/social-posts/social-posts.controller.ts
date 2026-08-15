import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { SocialPostsService, CreateSocialPostDto, UpdateSocialPostDto } from './social-posts.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';

@Controller('social-posts')
@UseGuards(AuthGuard('jwt'), StaffOnlyGuard)
export class SocialPostsController {
  constructor(private readonly svc: SocialPostsService) {}

  @Post()
  create(
    @Body() body: CreateSocialPostDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.create(body, user.id, companyId);
  }

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
    @Query('estado') estado?: string,
  ) {
    return this.svc.findAll(query, estado, companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.findOne(id, companyId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSocialPostDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.update(id, body, companyId);
  }

  @Patch(':id/estado')
  setEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.setEstado(id, estado, companyId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.remove(id, companyId);
  }
}
