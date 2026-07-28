import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UseGuards, BadRequestException, ConflictException, UploadedFile, UploadedFiles, UseInterceptors, Req } from '@nestjs/common';
import { ClientTicketStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientPortalGuard } from './client-portal.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { InventoriesService } from '../inventories/inventories.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { Request } from 'express';
import { getUploadSubdir } from '../common/upload-paths.js';

const ensureBranchUploadsDir = () => {
  const segments = __dirname.split(path.sep);
  const appsIndex = segments.lastIndexOf('apps');
  const projectRoot = appsIndex > 0
    ? (segments.slice(0, appsIndex).join(path.sep) || path.sep)
    : path.resolve(__dirname, '../../..');

  const baseUploads = path.join(projectRoot, 'uploads');
  const dir = path.join(baseUploads, 'branches');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const ensureClientUploadsDir = () => {
  const segments = __dirname.split(path.sep);
  const appsIndex = segments.lastIndexOf('apps');
  const projectRoot = appsIndex > 0
    ? (segments.slice(0, appsIndex).join(path.sep) || path.sep)
    : path.resolve(__dirname, '../../..');

  const baseUploads = path.join(projectRoot, 'uploads');
  const dir = path.join(baseUploads, 'clients');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

@Controller('client-portal')
@UseGuards(ClientPortalGuard)
export class ClientPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceClientsService: ServiceClientsService,
    private readonly activitiesService: ActivitiesService,
    private readonly inventoriesService: InventoriesService,
    private readonly accountingService: AccountingService,
    private readonly cotizacionesService: CotizacionesService,
  ) {}

  private normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return undefined;
  }

  private async resolveClientCompanyId(clientId: number): Promise<number | null> {
    const client = await this.prisma.serviceClient.findUnique({
      where: { id: clientId },
      select: { companyId: true },
    });
    return client?.companyId ?? null;
  }

  @Get('profile')
  async profile(@CurrentUser() user: any) {
    const client = await this.prisma['serviceClient'].findUnique({
      where: { id: user.clientId },
      include: { branches: true },
    });

    if (!client) return null;
    if (client.logoUrl) return client;

    const fallbackBranch = (client.branches || []).find((branch: any) => Boolean(branch?.logoUrl));
    return {
      ...client,
      logoUrl: fallbackBranch?.logoUrl || null,
    };
  }

  /**
   * Resumen 360° de servicios para el cliente:
   * - Proyectos activos
   * - Contratos de mantenimiento + próximas visitas
   * - OT recientes y SLA
   * - Tickets abiertos / cerrados (mes)
   * - Facturas (solo si el módulo está habilitado)
   */
  @Get('services-summary')
  async servicesSummary(@CurrentUser() user: any) {
    const clientId = user.clientId;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [
      projects,
      activeContracts,
      upcomingVisits,
      recentTickets,
      openTickets,
      branches,
      pendingFeedbacks,
    ] = await Promise.all([
      this.prisma['operationalProject'].findMany({
        where: { clientId, deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] as any } },
        select: {
          id: true,
          title: true,
          status: true,
          projectType: true,
          scopeSummary: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => []),
      (this.prisma as any).maintenanceContract.findMany({
        where: { clientId, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          contractNumber: true,
          title: true,
          frequency: true,
          slaResponseHours: true,
          slaResolutionHours: true,
          nextVisitDate: true,
          monthlyFee: true,
          currency: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { nextVisitDate: 'asc' },
      }).catch(() => []),
      (this.prisma as any).maintenanceContractVisit.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) },
          contract: { clientId, status: 'ACTIVE' },
        },
        include: {
          contract: { select: { id: true, contractNumber: true, title: true, branch: { select: { name: true } } } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 10,
      }).catch(() => []),
      this.prisma['activity'].findMany({
        where: { clientId, fechaAsignacion: { gte: since } },
        select: {
          id: true,
          anNumber: true,
          titulo: true,
          estatus: true,
          ticketType: true,
          branchName: true,
          fechaAsignacion: true,
          fechaFinalizacion: true,
          responsable: { select: { id: true, nombre: true } },
        },
        orderBy: { fechaAsignacion: 'desc' },
        take: 15,
      }).catch(() => []),
      this.prisma['activity'].count({
        where: { clientId, estatus: { in: ['Pendiente', 'En Proceso'] } },
      }).catch(() => 0),
      this.prisma['serviceClientBranch'].count({ where: { clientId, isActive: true } }).catch(() => 0),
      this.prisma['clientActivityFeedback']?.count({
        where: { clientId, rating: null },
      }).catch(() => 0),
    ]);

    const completedTickets = recentTickets.filter((t: any) => t.estatus === 'Finalizado').length;
    const completionRate = recentTickets.length > 0 ? +((completedTickets / recentTickets.length) * 100).toFixed(1) : 0;

    return {
      summary: {
        activeProjects: projects.length,
        activeContracts: activeContracts.length,
        upcomingVisits: upcomingVisits.length,
        openTickets,
        ticketsLast30Days: recentTickets.length,
        completionRate,
        branches,
        pendingFeedbacks: pendingFeedbacks || 0,
      },
      projects,
      contracts: activeContracts.map((c: any) => ({
        ...c,
        monthlyFee: Number(c.monthlyFee || 0),
      })),
      upcomingVisits,
      recentTickets,
    };
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

  @Patch('profile/logo')
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, ensureClientUploadsDir());
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const uniqueName = `client-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
        cb(null, uniqueName);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new BadRequestException('Solo se permiten imágenes'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async uploadClientLogo(@CurrentUser() user: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Archivo de logo requerido');
    const logoUrl = `/uploads/clients/${file.filename}`;
    return this.prisma['serviceClient'].update({
      where: { id: user.clientId },
      data: { logoUrl },
      select: { id: true, name: true, logoUrl: true },
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
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, ensureBranchUploadsDir());
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
      },
    }),
  }))
  async createBranch(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Nombre de sucursal requerido');
    const branchNumber = body.branchNumber?.trim();
    if (!branchNumber) throw new BadRequestException('Número de sucursal requerido');
    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;
    const portalEmail = body.portalEmail?.trim().toLowerCase();
    const portalPassword = String(body.portalPassword || '').trim();
    if (!portalEmail) throw new BadRequestException('Usuario de sucursal requerido');
    if (!portalPassword) throw new BadRequestException('Password de sucursal requerido');

    const companyId = await this.resolveClientCompanyId(user.clientId);
    if (!companyId) throw new BadRequestException('Cliente sin empresa asignada');

    const existingBranchNumber = await this.prisma['serviceClientBranch'].findFirst({
      where: { clientId: user.clientId, branchNumber, companyId },
    });
    if (existingBranchNumber) throw new BadRequestException('La sucursal ya existe');

    // portalEmail is unique per company — same-tenant + cross-kind within company.
    const sameTenantPortal = await this.prisma['serviceClientBranch'].findFirst({
      where: { portalEmail, companyId },
      select: { id: true },
    });
    if (sameTenantPortal) throw new ConflictException('El usuario de sucursal ya existe en esta empresa');
    const existingClientPortal = await this.prisma['serviceClient'].findFirst({
      where: { portalEmail, companyId },
      select: { id: true },
    });
    if (existingClientPortal) {
      throw new ConflictException('El usuario de sucursal ya está en uso por un cliente de esta empresa');
    }

    const portalPasswordHash = await bcrypt.hash(portalPassword, 10);
    const isActive = this.normalizeBoolean(body.isActive);
    const logoUrl = file ? `/uploads/branches/${file.filename}` : (body.logoUrl?.trim() || null);
    return this.prisma['serviceClientBranch'].create({
      data: {
        clientId: user.clientId,
        companyId,
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
        logoUrl,
        isActive: isActive ?? true,
      },
    });
  }

  @Put('branches/:id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, ensureBranchUploadsDir());
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
      },
    }),
  }))
  async updateBranch(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const branch = await this.prisma['serviceClientBranch'].findFirst({
      where: {
        id,
        clientId: user.clientId,
        ...(companyId ? { companyId } : {}),
      },
    });
    if (!branch) throw new BadRequestException('Sucursal no encontrada');
    const latitud = body.latitud ? Number(body.latitud) : undefined;
    const longitud = body.longitud ? Number(body.longitud) : undefined;
    const branchNumberInput = body.branchNumber?.trim();
    const branchNumber = branchNumberInput || branch.branchNumber;
    if (!branchNumber) throw new BadRequestException('Número de sucursal requerido');
    const portalEmailInput = body.portalEmail?.trim().toLowerCase();
    const portalEmail = portalEmailInput || branch.portalEmail;
    if (!portalEmail) throw new BadRequestException('Usuario de sucursal requerido');
    if (branchNumberInput && branchNumberInput !== branch.branchNumber) {
      const existingBranchNumber = await this.prisma['serviceClientBranch'].findFirst({
        where: {
          clientId: user.clientId,
          branchNumber: branchNumberInput,
          ...(companyId ? { companyId } : {}),
        },
      });
      if (existingBranchNumber) throw new BadRequestException('La sucursal ya existe');
    }
    // portalEmail is unique per company — same-tenant + cross-kind within company.
    if (portalEmailInput && portalEmailInput !== branch.portalEmail) {
      const sameTenantPortal = await this.prisma['serviceClientBranch'].findFirst({
        where: {
          portalEmail: portalEmailInput,
          ...(companyId ? { companyId } : {}),
          id: { not: branch.id },
        },
        select: { id: true },
      });
      if (sameTenantPortal) throw new ConflictException('El usuario de sucursal ya existe en esta empresa');
      const existingClientPortal = await this.prisma['serviceClient'].findFirst({
        where: {
          portalEmail: portalEmailInput,
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true },
      });
      if (existingClientPortal) {
        throw new ConflictException('El usuario de sucursal ya está en uso por un cliente de esta empresa');
      }
    }

    const portalPassword = body.portalPassword ? String(body.portalPassword).trim() : '';
    if (!portalPassword && !branch.portalPasswordHash) {
      throw new BadRequestException('Password de sucursal requerido');
    }
    const portalPasswordHash = portalPassword
      ? await bcrypt.hash(portalPassword, 10)
      : undefined;
    const isActive = this.normalizeBoolean(body.isActive);
    const nextLogoUrl = file
      ? `/uploads/branches/${file.filename}`
      : body.logoUrl !== undefined
        ? (body.logoUrl?.trim() || null)
        : undefined;

    // companyId is never taken from body — stamp from parent client if missing.
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
      logoUrl: nextLogoUrl,
      isActive,
    };
    if (portalPasswordHash) data.portalPasswordHash = portalPasswordHash;
    if (companyId && branch.companyId == null) data.companyId = companyId;
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
    const requests = await this.prisma['clientTicketRequest'].findMany({
      where: { clientId: user.clientId },
      include: { branch: true, activity: true },
      orderBy: { createdAt: 'desc' },
    });

    const isClosedActivityStatus = (status?: string | null) => {
      const value = String(status || '').toUpperCase();
      return (
        value.includes('FINAL') ||
        value.includes('CERR') ||
        value.includes('COMPLET') ||
        value.includes('APROBAD')
      );
    };

    const toCloseIds = requests
      .filter((request: any) => request.status !== 'CLOSED' && request.activityId && isClosedActivityStatus(request.activity?.estatus))
      .map((request: any) => request.id);

    if (toCloseIds.length) {
      await this.prisma['clientTicketRequest'].updateMany({
        where: { id: { in: toCloseIds } },
        data: { status: 'CLOSED' },
      });
    }

    return requests.map((request: any) => {
      if (toCloseIds.includes(request.id)) {
        return { ...request, status: 'CLOSED' };
      }
      return request;
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
    if (!description) throw new BadRequestException('Descripción requerida');

    const branchId = body.branchId ? Number(body.branchId) : undefined;
    let branchData: any = null;
    if (branchId) {
      branchData = await this.prisma['serviceClientBranch'].findFirst({
        where: { id: branchId, clientId: user.clientId },
      });
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

    const primaryCompany = await this.prisma.companyProfile.findFirst({
      where: { isPrimary: true, isActive: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!primaryCompany) throw new BadRequestException('No hay empresa configurada');

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
        companyId: primaryCompany.id,
      },
    });
  }

  @Get('projects')
  async projects(@CurrentUser() user: any) {
    const rows = await this.prisma.operationalProject.findMany({
      where: { clientId: user.clientId, status: { in: ['ACTIVE', 'ON_HOLD'] } },
      select: {
        id: true,
        title: true,
        status: true,
        projectType: true,
        siteCount: true,
        scopeSummary: true,
        startDate: true,
        endDate: true,
        _count: { select: { activities: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    const withProgress = await Promise.all(
      rows.map(async (p) => {
        const completed = await this.prisma.activity.count({
          where: {
            projectId: p.id,
            deletedAt: null,
            estatus: { contains: 'Finaliz', mode: 'insensitive' },
          },
        });
        const total = p._count.activities;
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          projectType: p.projectType,
          siteCount: p.siteCount,
          scopeSummary: p.scopeSummary,
          startDate: p.startDate,
          endDate: p.endDate,
          activityCount: total,
          completedActivities: completed,
          progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      }),
    );

    return withProgress;
  }

  @Get('tickets')
  async tickets(
    @CurrentUser() user: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('branchId') branchId?: string,
    @Query('projectId') projectId?: string,
  ) {
    const where: any = { clientId: user.clientId };

    if (projectId) {
      const parsedProjectId = Number(projectId);
      if (!Number.isNaN(parsedProjectId)) {
        where.projectId = parsedProjectId;
      }
    }

    if (branchId) {
      const parsedBranchId = Number(branchId);
      if (!Number.isNaN(parsedBranchId)) {
        where.branchId = parsedBranchId;
      }
    }

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
      include: {
        responsable: true,
        evidencias: true,
        serviceSheet: true,
        activityEvidence: true,
        project: { select: { id: true, title: true, status: true, projectType: true } },
      },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  @Get('tickets/:id')
  async ticket(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.prisma['activity'].findFirst({
      where: { id, clientId: user.clientId },
      include: { responsable: true, evidencias: true, serviceSheet: true, activityEvidence: true },
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
  async inventories(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('origin') origin?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const normalizedOrigin = String(origin || '').toUpperCase();
    const createdByType = ['CLIENT', 'BRANCH', 'CONSOLE'].includes(normalizedOrigin)
      ? (normalizedOrigin as 'CLIENT' | 'BRANCH' | 'CONSOLE')
      : undefined;
    const parsedFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const parsedTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    return this.inventoriesService.list({
      clientId: user.clientId,
      branchId: branchId ? Number(branchId) : undefined,
      status: status ? String(status).toUpperCase() : undefined,
      createdByType,
      from: parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : undefined,
      to: parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : undefined,
      search: search?.trim() || undefined,
    }, undefined, companyId);
  }

  @Post('inventories/upload')
  @UseInterceptors(FilesInterceptor('files', 30, { dest: getUploadSubdir(__dirname, 'inventory-media') }))
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
    const companyId = await this.resolveClientCompanyId(user.clientId);

    return this.inventoriesService.syncManualSnapshot(
      {
        clientId: user.clientId,
        branchId,
        createdByType: 'CLIENT',
      },
      body || {},
      user.clientId,
      companyId,
    );
  }

  @Put('inventories/:id/decision')
  async decideInventory(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision?: string },
  ) {
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const detail = await this.inventoriesService.detail(id, companyId);
    if (detail.clientId !== user.clientId) {
      throw new BadRequestException('Inventario no pertenece al cliente');
    }
    const decision = String(body?.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision invalida');
    }
    return this.inventoriesService.updateStatus(id, decision, companyId);
  }

  @Get('inventories/:id')
  async inventoryDetail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const detail = await this.inventoriesService.detail(id, companyId);
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
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const detail = await this.inventoriesService.detail(id, companyId);
    if (detail.clientId !== user.clientId) {
      throw new BadRequestException('Inventario no pertenece al cliente');
    }
    const result = await this.inventoriesService.generateReport(id, companyId);
    if (!result) return res.status(404).send('Inventario no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario-${id}.pdf`);
    return res.send(result.pdf);
  }

  // ── Facturas (CFDI) ──────────────────────────────────────────────
  @Get('invoices')
  async invoices(@CurrentUser() user: any) {
    return this.prisma.invoice.findMany({
      where: {
        type: 'ACCOUNTS_RECEIVABLE',
        isCancelled: false,
        client: { serviceClientId: user.clientId },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        cfdiUuid: true,
        pdfUrl: true,
        cfdiXml: true,
      },
      orderBy: { issueDate: 'desc' },
    });
  }

  private async findOwnInvoiceOrFail(user: any, id: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, type: 'ACCOUNTS_RECEIVABLE', client: { serviceClientId: user.clientId } },
      select: { id: true },
    });
    if (!invoice) throw new BadRequestException('Factura no encontrada');
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.findOwnInvoiceOrFail(user, id);
    const pdf = await this.accountingService.getInvoicePdf(id);
    res.redirect(pdf.url);
  }

  @Get('invoices/:id/xml')
  async invoiceXml(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.findOwnInvoiceOrFail(user, id);
    const xml = await this.accountingService.getInvoiceXml(id);
    res.setHeader('Content-Type', xml.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${xml.filename}"`);
    res.send(xml.body);
  }

  // ── Cotizaciones ─────────────────────────────────────────────────
  @Get('quotes')
  async quotes(@CurrentUser() user: any) {
    return this.prisma.cotizacion.findMany({
      where: { salesClient: { serviceClientId: user.clientId }, deletedAt: null },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        issueDate: true,
        validUntil: true,
        projectName: true,
        currency: true,
        total: true,
        sentAt: true,
        signedAt: true,
      },
      orderBy: { issueDate: 'desc' },
    });
  }

  @Get('quotes/:id/pdf')
  async quotePdf(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const quote = await this.prisma.cotizacion.findFirst({
      where: { id, salesClient: { serviceClientId: user.clientId }, deletedAt: null },
      select: { id: true, quoteNumber: true },
    });
    if (!quote) throw new BadRequestException('Cotización no encontrada');
    const pdf = await this.cotizacionesService.getPdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${quote.quoteNumber}.pdf`);
    res.send(pdf);
  }

  @Get('report')
  async report(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    const companyId = await this.resolveClientCompanyId(user.clientId);
    const { pdf } = await this.serviceClientsService.generateReport(user.clientId, range, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-tickets.pdf');
    res.send(pdf);
  }
}
