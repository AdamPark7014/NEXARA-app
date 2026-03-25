import { Body, Controller, Get, Post, Put, UseGuards, UploadedFiles, UseInterceptors, BadRequestException, Query } from '@nestjs/common';
import { Param, ParseIntPipe, Res } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { BranchPortalGuard } from './branch-portal.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { InventoriesService } from '../inventories/inventories.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';

@Controller('branch-portal')
@UseGuards(BranchPortalGuard)
export class BranchPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoriesService: InventoriesService,
    private readonly activitiesService: ActivitiesService,
    private readonly serviceClientsService: ServiceClientsService,
  ) {}

  @Get('profile')
  async profile(@CurrentUser() user: any) {
    return this.prisma['serviceClientBranch'].findFirst({
      where: { id: user.branchId, clientId: user.clientId },
      include: { client: true },
    });
  }

  @Get('requests')
  async requests(@CurrentUser() user: any) {
    return this.prisma['clientTicketRequest'].findMany({
      where: { branchId: user.branchId, clientId: user.clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('tickets')
  async tickets(
    @CurrentUser() user: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const where: any = { clientId: user.clientId, branchId: user.branchId };

    if (start || end) {
      const dateFilter: any = {};
      if (start) {
        const startDate = new Date(start);
        if (!Number.isNaN(startDate.getTime())) {
          dateFilter.gte = startDate;
        }
      }
      if (end) {
        const endDate = new Date(end);
        if (!Number.isNaN(endDate.getTime())) {
          dateFilter.lte = endDate;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        where.fechaAsignacion = dateFilter;
      }
    }

    return this.prisma['activity'].findMany({
      where,
      include: { responsable: true, evidencias: true, serviceSheet: true },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  @Get('tickets/:id/report')
  async ticketReport(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const activity = await this.prisma['activity'].findFirst({
      where: { id, clientId: user.clientId, branchId: user.branchId },
      select: { id: true },
    });
    if (!activity) {
      return res.status(404).send('Ticket no encontrado');
    }

    const result = await this.activitiesService.generateTicketReport(activity.id);
    if (!result) {
      return res.status(404).send('Ticket no encontrado');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ticket-${id}.pdf`);
    return res.send(result.pdf);
  }

  @Get('report')
  async report(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    const { pdf } = await this.serviceClientsService.generateBranchReport(user.clientId, user.branchId, range);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-tickets-sucursal.pdf');
    return res.send(pdf);
  }

  @Get('inventories')
  async inventories(@CurrentUser() user: any) {
    return this.inventoriesService.list({
      clientId: user.clientId,
      branchId: user.branchId,
    });
  }

  @Post('inventories/upload')
  @UseInterceptors(FilesInterceptor('files', 30, { dest: 'apps/api/uploads/inventory-media' }))
  async uploadInventoryMedia(@UploadedFiles() files: any[]) {
    const urls = Array.isArray(files)
      ? files.map((file) => `/uploads/inventory-media/${file.filename}`)
      : [];
    return { urls };
  }

  @Post('inventories/sync')
  async syncInventory(@CurrentUser() user: any, @Body() body: any) {
    return this.inventoriesService.syncManualSnapshot(
      {
        clientId: user.clientId,
        branchId: user.branchId,
        createdByType: 'BRANCH',
      },
      body || {},
      user.branchId,
    );
  }

  @Put('inventories/:id/status')
  async updateInventoryStatus(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: string },
  ) {
    const detail = await this.inventoriesService.detail(id);
    if (detail.clientId !== user.clientId || detail.branchId !== user.branchId) {
      throw new BadRequestException('Inventario no pertenece a la sucursal');
    }
    return this.inventoriesService.updateStatus(id, body?.status || 'PENDING');
  }

  @Get('inventories/:id')
  async inventoryDetail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const detail = await this.inventoriesService.detail(id);
    if (detail.clientId !== user.clientId || detail.branchId !== user.branchId) {
      throw new BadRequestException('Inventario no pertenece a la sucursal');
    }
    return detail;
  }

  @Get('inventories/:id/report')
  async inventoryReport(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const detail = await this.inventoriesService.detail(id);
    if (detail.clientId !== user.clientId || detail.branchId !== user.branchId) {
      throw new BadRequestException('Inventario no pertenece a la sucursal');
    }
    const result = await this.inventoriesService.generateReport(id);
    if (!result) return res.status(404).send('Inventario no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario-${id}.pdf`);
    return res.send(result.pdf);
  }

  @Post('requests')
  @UseInterceptors(FilesInterceptor('files', 10, { dest: 'apps/api/uploads/client-requests' }))
  async createRequest(
    @CurrentUser() user: any,
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    const description = body.description?.trim();
    if (!description) throw new BadRequestException('Descripción requerida');

    const branch = await this.prisma['serviceClientBranch'].findFirst({
      where: { id: user.branchId, clientId: user.clientId, isActive: true },
    });
    if (!branch) throw new BadRequestException('Sucursal no encontrada');

    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;

    const urgencyRaw = String(body.urgency || '').toUpperCase();
    const urgency = urgencyRaw === 'ALTA' || urgencyRaw === 'HIGH'
      ? 'HIGH'
      : urgencyRaw === 'BAJA' || urgencyRaw === 'LOW'
        ? 'LOW'
        : 'MEDIUM';

    const dueAt = body.dueAt ? new Date(body.dueAt) : undefined;
    const requestTypeRaw = String(body.requestType || '').toUpperCase();
    const requestType = requestTypeRaw === 'PREVENTIVE_INVENTORY' ? 'PREVENTIVE_INVENTORY' : 'ISSUE';

    const evidenceUrls = Array.isArray(files)
      ? files.map((file) => `/uploads/client-requests/${file.filename}`)
      : [];

    return this.prisma['clientTicketRequest'].create({
      data: {
        clientId: user.clientId,
        branchId: branch.id,
        branchName: branch.name,
        branchNumber: branch.branchNumber,
        address: branch.address,
        city: branch.city,
        state: branch.state,
        country: branch.country,
        description,
        requestType,
        urgency,
        dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
        placeId: body.placeId?.trim() || branch.placeId || null,
        latitud: Number.isFinite(latitud) ? latitud : branch.latitud,
        longitud: Number.isFinite(longitud) ? longitud : branch.longitud,
        evidenceUrls,
      },
    });
  }
}
