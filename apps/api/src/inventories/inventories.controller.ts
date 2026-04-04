import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { InventoriesService } from './inventories.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';

@Controller('inventories')
@UseGuards(RbacGuard)
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Get()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  findAll(
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.inventoriesService.list({
      clientId: clientId ? Number(clientId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      status: status ? String(status).toUpperCase() : undefined,
    }, query);
  }

  @Get('activity/:activityId')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_CREATE] })
  getByActivity(@Param('activityId', ParseIntPipe) activityId: number) {
    return this.inventoriesService.getByActivity(activityId);
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
    @Body() body: any,
  ) {
    return this.inventoriesService.syncByActivity(activityId, body, user?.id);
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.inventoriesService.detail(id);
  }

  @Patch(':id/status')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status?: string }) {
    return this.inventoriesService.updateStatus(id, body.status || 'PENDING');
  }

  @Get(':id/report')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async report(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.inventoriesService.generateReport(id);
    if (!result) return res.status(404).send('Inventario no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario-${id}.pdf`);
    return res.send(result.pdf);
  }
}
