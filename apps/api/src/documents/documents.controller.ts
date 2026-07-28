import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('documents')
@UseGuards(RbacGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  // Categories
  @Post('categories')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  createCategory(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createCategory(dto, companyId);
  }

  @Get('categories')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  listCategories(@CurrentCompanyId() companyId: number | null) {
    return this.svc.listCategories(companyId);
  }

  // Documents
  @Post()
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createDocument(dto, user.id, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('categoryId') catId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listDocuments(
      { categoryId: catId ? +catId : undefined, status, search },
      companyId,
    );
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getDocument(id, companyId);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.updateDocument(id, dto, companyId);
  }

  @Post(':id/versions')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  uploadVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.uploadNewVersion(id, dto, user.id, companyId);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_APPROVE] })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.approveDocument(id, user.id, companyId);
  }

  @Patch(':id/archive')
  @RBAC({ permissions: [PERMISSIONS.DOCUMENTS_MANAGE] })
  archive(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.archiveDocument(id, companyId);
  }
}
