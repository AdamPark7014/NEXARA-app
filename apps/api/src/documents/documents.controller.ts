import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('documents')
@UseGuards(RbacGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  // Categories
  @Post('categories')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  createCategory(@Body() dto: any) {
    return this.svc.createCategory(dto);
  }

  @Get('categories')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  listCategories() {
    return this.svc.listCategories();
  }

  // Documents
  @Post()
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createDocument(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  list(@Query('categoryId') catId?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.svc.listDocuments({ categoryId: catId ? +catId : undefined, status, search });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDocument(id);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateDocument(id, dto);
  }

  @Post(':id/versions')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  uploadVersion(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: any) {
    return this.svc.uploadNewVersion(id, dto, user.id);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_APPROVE] })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveDocument(id, user.id);
  }

  @Patch(':id/archive')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archiveDocument(id);
  }
}
