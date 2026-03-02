import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards, BadRequestException, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ClientTicketStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientPortalGuard } from './client-portal.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { InventoriesService } from '../inventories/inventories.service.js';

@Controller('client-portal')
@UseGuards(ClientPortalGuard)
export class ClientPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceClientsService: ServiceClientsService,
    private readonly activitiesService: ActivitiesService,
    private readonly inventoriesService: InventoriesService,
  ) {}

  @Get('profile')
  async profile(@CurrentUser() user: any) {
    return this.prisma['serviceClient'].findUnique({
      where: { id: user.clientId },
      include: { branches: true },
    });
  }

  @Put('profile')
  async updateProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.prisma['serviceClient'].update({
      where: { id: user.clientId },
      data: {
        contactName: body.contactName?.trim() || null,
        contactEmail: body.contactEmail?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        country: body.country?.trim() || null,
      },
    });
  }

  @Get('branches')
  async branches(@CurrentUser() user: any) {
    return this.prisma['serviceClientBranch'].findMany({
      where: { clientId: user.clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('branches')
  async createBranch(@CurrentUser() user: any, @Body() body: any) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Nombre de sucursal requerido');
    const branchNumber = body.branchNumber?.trim();
    if (!branchNumber) throw new BadRequestException('Numero de sucursal requerido');
    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;
    const portalEmail = body.portalEmail?.trim().toLowerCase();
    const portalPassword = String(body.portalPassword || '').trim();
    if (!portalEmail) throw new BadRequestException('Usuario de sucursal requerido');
    if (!portalPassword) throw new BadRequestException('Password de sucursal requerido');

    const existingBranchNumber = await this.prisma['serviceClientBranch'].findFirst({
      where: { clientId: user.clientId, branchNumber },
    });
    if (existingBranchNumber) throw new BadRequestException('La sucursal ya existe');

    const existingBranch = await this.prisma['serviceClientBranch'].findFirst({
      where: { portalEmail },
    });
    if (existingBranch) throw new BadRequestException('El usuario de sucursal ya existe');

    const portalPasswordHash = await bcrypt.hash(portalPassword, 10);
    return this.prisma['serviceClientBranch'].create({
      data: {
        clientId: user.clientId,
        name,
        branchNumber,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        country: body.country?.trim() || null,
        placeId: body.placeId?.trim() || null,
        latitud: Number.isFinite(latitud) ? latitud : undefined,
        longitud: Number.isFinite(longitud) ? longitud : undefined,
        portalEmail: portalEmail || null,
        portalPasswordHash,
        logoUrl: body.logoUrl?.trim() || null,
        isActive: body.isActive !== false,
      },
    });
  }

  @Put('branches/:id')
  async updateBranch(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    const branch = await this.prisma['serviceClientBranch'].findFirst({
      where: { id, clientId: user.clientId },
    });
    if (!branch) throw new BadRequestException('Sucursal no encontrada');
    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;
    const branchNumberInput = body.branchNumber?.trim();
    const branchNumber = branchNumberInput || branch.branchNumber;
    if (!branchNumber) throw new BadRequestException('Numero de sucursal requerido');
    const portalEmailInput = body.portalEmail?.trim().toLowerCase();
    const portalEmail = portalEmailInput || branch.portalEmail;
    if (!portalEmail) throw new BadRequestException('Usuario de sucursal requerido');
    if (branchNumberInput && branchNumberInput !== branch.branchNumber) {
      const existingBranchNumber = await this.prisma['serviceClientBranch'].findFirst({
        where: { clientId: user.clientId, branchNumber: branchNumberInput },
      });
      if (existingBranchNumber) throw new BadRequestException('La sucursal ya existe');
    }
    if (portalEmailInput && portalEmailInput !== branch.portalEmail) {
      const existingBranch = await this.prisma['serviceClientBranch'].findFirst({
        where: { portalEmail: portalEmailInput },
      });
      if (existingBranch) throw new BadRequestException('El usuario de sucursal ya existe');
    }

    const portalPassword = body.portalPassword ? String(body.portalPassword).trim() : '';
    if (!portalPassword && !branch.portalPasswordHash) {
      throw new BadRequestException('Password de sucursal requerido');
    }
    const portalPasswordHash = portalPassword
      ? await bcrypt.hash(portalPassword, 10)
      : undefined;

    const data: Record<string, any> = {
      name: body.name?.trim() || branch.name,
      branchNumber,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      country: body.country?.trim() || null,
      placeId: body.placeId?.trim() || null,
      latitud: Number.isFinite(latitud) ? latitud : undefined,
      longitud: Number.isFinite(longitud) ? longitud : undefined,
      portalEmail,
      logoUrl: body.logoUrl !== undefined ? (body.logoUrl?.trim() || null) : undefined,
      isActive: body.isActive !== undefined ? body.isActive : undefined,
    };
    if (portalPasswordHash) data.portalPasswordHash = portalPasswordHash;
    return this.prisma['serviceClientBranch'].update({
      where: { id },
      data,
    });
  }

  @Delete('branches/:id')
  async deleteBranch(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const branch = await this.prisma['serviceClientBranch'].findFirst({
      where: { id, clientId: user.clientId },
    });
    if (!branch) throw new BadRequestException('Sucursal no encontrada');
    return this.prisma['serviceClientBranch'].delete({ where: { id } });
  }

  @Get('requests')
  async requests(@CurrentUser() user: any) {
    return this.prisma['clientTicketRequest'].findMany({
      where: { clientId: user.clientId },
      include: { branch: true, activity: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Put('requests/:id/close')
  async closeRequest(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const request = await this.prisma['clientTicketRequest'].findFirst({
      where: { id, clientId: user.clientId },
    });
    if (!request) throw new BadRequestException('Solicitud no encontrada');
    return this.prisma['clientTicketRequest'].update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  @Put('requests/:id/decision')
  async decideRequest(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision?: string },
  ) {
    const request = await this.prisma['clientTicketRequest'].findFirst({
      where: { id, clientId: user.clientId },
    });
    if (!request) throw new BadRequestException('Solicitud no encontrada');
    const decision = String(body.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision invalida');
    }
    const decisionStatus = decision as ClientTicketStatus;
    return this.prisma['clientTicketRequest'].update({
      where: { id },
      data: { status: decisionStatus },
    });
  }

  @Get('feedback/pending')
  async pendingFeedback(@CurrentUser() user: any) {
    return this.prisma['activity'].findMany({
      where: {
        clientId: user.clientId,
        estatus: 'Finalizada',
        clientFeedback: null,
      },
      include: { responsable: true },
      orderBy: { fechaFinalizacion: 'desc' },
    });
  }

  @Post('feedback')
  async createFeedback(@CurrentUser() user: any, @Body() body: any) {
    const activityId = Number(body.activityId);
    if (!activityId || Number.isNaN(activityId)) {
      throw new BadRequestException('activityId requerido');
    }

    const activity = await this.prisma['activity'].findFirst({
      where: { id: activityId, clientId: user.clientId, estatus: 'Finalizada' },
    });
    if (!activity) throw new BadRequestException('Actividad no encontrada');

    const rating = body.rating ? Number(body.rating) : undefined;
    const payload = {
      activityId,
      clientId: user.clientId,
      rating: Number.isFinite(rating) ? rating : null,
      wasOnTime: body.wasOnTime ?? null,
      wasFriendly: body.wasFriendly ?? null,
      wasSolved: body.wasSolved ?? null,
      comments: body.comments?.trim() || null,
    };

    const feedback = await this.prisma['clientActivityFeedback'].create({ data: payload });
    await this.prisma['activity'].update({
      where: { id: activityId },
      data: { clientSurveyCompletedAt: new Date() },
    });
    return feedback;
  }

  @Post('requests')
  async createRequest(@CurrentUser() user: any, @Body() body: any) {
    const description = body.description?.trim();
    if (!description) throw new BadRequestException('Descripcion requerida');

    const branchId = body.branchId ? Number(body.branchId) : undefined;
    let branchData: any = null;
    if (branchId) {
      branchData = await this.prisma['serviceClientBranch'].findFirst({
        where: { id: branchId, clientId: user.clientId },
      });
      if (!branchData) throw new BadRequestException('Sucursal no encontrada');
    }

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

    return this.prisma['clientTicketRequest'].create({
      data: {
        clientId: user.clientId,
        branchId: branchData?.id || null,
        branchName: branchData?.name || body.branchName?.trim() || null,
        branchNumber: branchData?.branchNumber || body.branchNumber?.trim() || null,
        address: branchData?.address || body.address?.trim() || null,
        city: branchData?.city || body.city?.trim() || null,
        state: branchData?.state || body.state?.trim() || null,
        country: branchData?.country || body.country?.trim() || null,
        description,
        requestType,
        urgency,
        dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
        placeId: body.placeId?.trim() || branchData?.placeId || null,
        latitud: Number.isFinite(latitud) ? latitud : branchData?.latitud,
        longitud: Number.isFinite(longitud) ? longitud : branchData?.longitud,
      },
    });
  }

  @Get('tickets')
  async tickets(@CurrentUser() user: any) {
    return this.prisma['activity'].findMany({
      where: { clientId: user.clientId },
      include: { responsable: true, evidencias: true, serviceSheet: true },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  @Get('tickets/:id')
  async ticket(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.prisma['activity'].findFirst({
      where: { id, clientId: user.clientId },
      include: { responsable: true, evidencias: true, serviceSheet: true },
    });
  }

  @Get('tickets/:id/report')
  async ticketReport(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const activity = await this.prisma['activity'].findFirst({
      where: { id, clientId: user.clientId },
      select: { id: true },
    });
    if (!activity) {
      res.status(404).send('Ticket no encontrado');
      return;
    }

    const result = await this.activitiesService.generateTicketReport(activity.id);
    if (!result) {
      res.status(404).send('Ticket no encontrado');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ticket-${id}.pdf`);
    res.send(result.pdf);
  }

  @Get('inventories')
  async inventories(@CurrentUser() user: any, @Query('branchId') branchId?: string) {
    return this.inventoriesService.list({
      clientId: user.clientId,
      branchId: branchId ? Number(branchId) : undefined,
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
    const branchId = body?.branchId ? Number(body.branchId) : undefined;
    if (!branchId || Number.isNaN(branchId)) {
      throw new BadRequestException('branchId requerido');
    }

    return this.inventoriesService.syncManualSnapshot(
      {
        clientId: user.clientId,
        branchId,
        createdByType: 'CLIENT',
      },
      body || {},
      user.clientId,
    );
  }

  @Put('inventories/:id/decision')
  async decideInventory(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision?: string },
  ) {
    const detail = await this.inventoriesService.detail(id);
    if (detail.clientId !== user.clientId) {
      throw new BadRequestException('Inventario no pertenece al cliente');
    }
    const decision = String(body?.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision invalida');
    }
    return this.inventoriesService.updateStatus(id, decision);
  }

  @Get('inventories/:id')
  async inventoryDetail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const detail = await this.inventoriesService.detail(id);
    if (detail.clientId !== user.clientId) {
      throw new BadRequestException('Inventario no pertenece al cliente');
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
    if (detail.clientId !== user.clientId) {
      throw new BadRequestException('Inventario no pertenece al cliente');
    }
    const result = await this.inventoriesService.generateReport(id);
    if (!result) return res.status(404).send('Inventario no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario-${id}.pdf`);
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
    const { pdf } = await this.serviceClientsService.generateReport(user.clientId, range);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-tickets.pdf');
    res.send(pdf);
  }
}
