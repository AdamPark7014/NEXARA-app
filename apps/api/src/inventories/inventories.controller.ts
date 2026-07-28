import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { InventoriesService } from './inventories.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';

@Controller('inventories')
@UseGuards(RbacGuard)
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Get()
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.ASSETS_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.SUPPORT_VIEW,
    ],
  })
  findAll(
    @CurrentCompanyId() companyId: number | null,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('createdByType') createdByType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    const parsedFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const parsedTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    return this.inventoriesService.list({
      clientId: clientId ? Number(clientId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      status: status ? String(status).toUpperCase() : undefined,
      createdByType:
        createdByType && ['CLIENT', 'BRANCH', 'CONSOLE'].includes(String(createdByType).toUpperCase())
          ? (String(createdByType).toUpperCase() as 'CLIENT' | 'BRANCH' | 'CONSOLE')
          : undefined,
      from: parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : undefined,
      to: parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : undefined,
      search: search?.trim() || undefined,
    }, query, companyId);
  }

  @Get('activity/:activityId')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  getByActivity(
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.inventoriesService.getByActivity(activityId, companyId);
  }

  @Post('upload')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  @UseInterceptors(FilesInterceptor('files', 30, { dest: getUploadSubdir(__dirname, 'inventory-media') }))
  uploadMedia(@UploadedFiles() files: any[]) {
    const urls = Array.isArray(files)
      ? files.map((file) => `/uploads/inventory-media/${file.filename}`)
      : [];
    return { urls };
  }

  @Post('activity/:activityId/sync')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  syncByActivity(
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: any,
  ) {
    return this.inventoriesService.syncByActivity(activityId, body, user?.id, companyId);
  }

  @Post('sync')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.ASSETS_MANAGE,
    ],
  })
  syncManual(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { clientId?: number; branchId?: number; title?: string; notes?: string; items?: any[]; completed?: boolean },
  ) {
    const clientId = Number(body?.clientId);
    const branchId = Number(body?.branchId);
    if (!clientId || Number.isNaN(clientId) || !branchId || Number.isNaN(branchId)) {
      throw new BadRequestException('clientId y branchId son requeridos');
    }
    return this.inventoriesService.syncManualSnapshot(
      { clientId, branchId, createdByType: 'CONSOLE' },
      body || {},
      user?.id,
      companyId,
    );
  }

  @Get(':id')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.ASSETS_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.SUPPORT_VIEW,
    ],
  })
  detail(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.inventoriesService.detail(id, companyId);
  }

  @Patch(':id/status')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { status?: string },
  ) {
    return this.inventoriesService.updateStatus(id, body.status || 'PENDING', companyId);
  }

  @Get(':id/report')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async report(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const result = await this.inventoriesService.generateReport(id, companyId);
    if (!result) return res.status(404).send('Inventario no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario-${id}.pdf`);
    return res.send(result.pdf);
  }
}
