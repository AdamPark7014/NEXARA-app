import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { CreateOperationalProjectDto, UpdateOperationalProjectDto, ProjectStatusChangeDto, AssignProjectEngineerDto, CreateProjectActivityDto } from './dto/create-operational-project.dto.js';
import { salesPatchFromOps, opsStatusToSales } from '../common/project-handoff.js';
import { resolveRequiredCompanyId, companyWhere, requireCompanyId, assertCompanyAccess } from '../common/tenant/tenant-scope.js';

const salesProjectInclude = {
  id: true,
  name: true,
  status: true,
} as const;

@Injectable()
export class OperationalProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  private get projectRepo() {
    return (this.prisma as any).operationalProject;
  }

  private get projectEngineerRepo() {
    return (this.prisma as any).projectEngineer;
  }

  /**
   * Espejo CRM ← OPS: si el proyecto de campo no tiene SalesProject,
   * crea SalesClient (si falta) + oportunidad WON + SalesProject y enlaza.
   * Así CRM y OPS muestran el mismo negocio.
   */
  async ensureCommercialMirror(operationalProjectId: number, actorId?: number, companyId?: number | null) {
    const tenantId = companyId != null ? requireCompanyId(companyId) : undefined;
    const op = await this.prisma.operationalProject.findFirst({
      where: {
        id: operationalProjectId,
        ...(tenantId != null ? companyWhere(tenantId) : {}),
      },
      include: {
        client: true,
        salesProject: { select: { id: true, name: true, status: true } },
      },
    });
    if (tenantId != null) {
      assertCompanyAccess(op, tenantId, 'Project');
    } else if (!op) {
      throw new NotFoundException('Project not found');
    }
    if (op.salesProjectId && op.salesProject) {
      return { operationalProject: op, salesProject: op.salesProject, created: false };
    }

    const serviceClient = op.client;
    if (!serviceClient) throw new BadRequestException('El proyecto OPS no tiene cliente de servicio');

    let salesClient = await this.prisma.salesClient.findFirst({
      where: { serviceClientId: serviceClient.id },
    });
    if (!salesClient) {
      salesClient = await this.prisma.salesClient.create({
        data: {
          name: serviceClient.name,
          legalName: serviceClient.name,
          billingEmail: serviceClient.contactEmail || null,
          billingPhone: serviceClient.contactPhone || null,
          ownerId: actorId || op.vendorId,
          serviceClientId: serviceClient.id,
          status: 'ACTIVE',
          notes: `Creado automáticamente desde proyecto OPS #${op.id}`,
          companyId: (op as any).companyId || (serviceClient as any).companyId || (
            await this.prisma.companyProfile.findFirst({
              where: { isPrimary: true, isActive: true },
              select: { id: true },
              orderBy: { id: 'asc' },
            })
          )?.id!,
        },
      });
    }

    const mirrorCompanyId =
      tenantId ??
      (op as any).companyId ??
      (
        await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true, isActive: true },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      )?.id;
    if (!mirrorCompanyId) throw new BadRequestException('No hay empresa configurada');

    const opportunity = await this.prisma.salesOpportunity.create({
      data: {
        title: op.title,
        description: op.description || op.scopeSummary || null,
        stage: 'WON',
        value: 0,
        probability: 100,
        closedAt: new Date(),
        clientId: salesClient.id,
        ownerId: actorId || op.vendorId,
        companyId: mirrorCompanyId,
      },
    });

    const salesStatus = opsStatusToSales(op.status);
    const salesProject = await this.prisma.salesProject.create({
      data: {
        opportunityId: opportunity.id,
        name: op.title,
        projectType: op.projectType,
        scopeSummary: op.scopeSummary,
        siteCount: op.siteCount,
        status: salesStatus,
        startDate: op.startDate,
        endDate: op.endDate,
        companyId: mirrorCompanyId,
      },
    });

    const linked = await this.prisma.operationalProject.update({
      where: { id: op.id },
      data: { salesProjectId: salesProject.id },
      include: {
        client: { select: { id: true, name: true } },
        vendor: { select: { id: true, nombre: true, email: true } },
        salesProject: { select: salesProjectInclude },
      },
    });

    return { operationalProject: linked, salesProject, created: true };
  }

  async linkOrphansToCrm(actorId?: number) {
    const orphans = await this.prisma.operationalProject.findMany({
      where: { deletedAt: null, salesProjectId: null },
      select: { id: true, title: true },
    });
    const results: Array<{ id: number; title: string; salesProjectId: number; created: boolean }> = [];
    for (const orphan of orphans) {
      const result = await this.ensureCommercialMirror(orphan.id, actorId);
      results.push({
        id: orphan.id,
        title: orphan.title,
        salesProjectId: result.salesProject.id,
        created: result.created,
      });
    }
    return { linked: results.length, results };
  }

  async create(createDto: CreateOperationalProjectDto, userId: number) {
    // Verify that the vendor exists and is the current user's own project
    const vendor = await this.prisma.user.findUnique({
      where: { id: createDto.vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    // Verify that the client exists
    const client = await this.prisma.serviceClient.findUnique({
      where: { id: createDto.clientId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Create the operational project
    const companyId = await resolveRequiredCompanyId(this.prisma, (client as any).companyId);
    const created = await this.projectRepo.create({
      data: {
        title: createDto.title,
        description: createDto.description,
        projectType: createDto.projectType ?? 'OTRO',
        scopeSummary: createDto.scopeSummary?.trim() || null,
        siteCount: createDto.siteCount ?? null,
        salesProjectId: createDto.salesProjectId ?? null,
        status: 'ACTIVE',
        vendorId: createDto.vendorId,
        clientId: createDto.clientId,
        startDate: new Date(createDto.startDate),
        endDate: createDto.endDate ? new Date(createDto.endDate) : null,
        companyId,
      },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
        salesProject: { select: salesProjectInclude },
        engineers: {
          select: {
            engineer: {
              select: { id: true, nombre: true, email: true },
            },
          },
        },
        activities: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
          },
        },
      },
    });

    // Si no vino ya enlazado desde CRM, crear espejo comercial automáticamente.
    if (!created.salesProjectId) {
      try {
        const mirror = await this.ensureCommercialMirror(created.id, userId);
        return { ...created, salesProjectId: mirror.salesProject.id, salesProject: mirror.salesProject };
      } catch {
        return created;
      }
    }

    return created;
  }

  async findAll(vendorId?: number, clientId?: number, status?: string, companyId?: number | null) {
    const where: any = { ...companyWhere(companyId ?? null) };
    if (vendorId) where.vendorId = vendorId;
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    return this.projectRepo.findMany({
      where,
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
        salesProject: { select: salesProjectInclude },
        engineers: {
          select: {
            id: true,
            engineer: {
              select: { id: true, nombre: true, email: true },
            },
          },
        },
        activities: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const project = await this.projectRepo.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: {
            id: true,
            name: true,
            salesClients: { select: { id: true, name: true }, take: 1, orderBy: { id: 'asc' } },
          },
        },
        salesProject: { select: salesProjectInclude },
        engineers: {
          select: {
            id: true,
            engineer: {
              select: { id: true, nombre: true, email: true },
            },
          },
        },
        activities: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
            activityType: true,
            ticketType: true,
          },
        },
      },
    });

    assertCompanyAccess(project, tenantId, 'Project');
    return project;
  }

  async update(id: number, updateDto: UpdateOperationalProjectDto, companyId?: number | null) {
    await this.findById(id, companyId);

    const updated = await this.projectRepo.update({
      where: { id },
      data: {
        ...(updateDto.title && { title: updateDto.title }),
        ...(updateDto.description && { description: updateDto.description }),
        ...(updateDto.endDate && { endDate: new Date(updateDto.endDate) }),
        ...(updateDto.actualEndDate && { actualEndDate: new Date(updateDto.actualEndDate) }),
      },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
        salesProject: { select: { id: true } },
        engineers: {
          select: {
            id: true,
            engineer: {
              select: { id: true, nombre: true, email: true },
            },
          },
        },
        activities: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
          },
        },
      },
    });

    // Propagar identidad al SalesProject vinculado.
    if (updated.salesProjectId) {
      await this.prisma.salesProject.update({
        where: { id: updated.salesProjectId },
        data: {
          ...(updateDto.title ? { name: updateDto.title } : {}),
          ...(updateDto.endDate ? { endDate: new Date(updateDto.endDate) } : {}),
        },
      }).catch(() => undefined);
    }

    return updated;
  }

  async changeStatus(id: number, statusDto: ProjectStatusChangeDto, companyId?: number | null) {
    await this.findById(id, companyId);
    const validStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];

    if (!validStatuses.includes(statusDto.status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const updated = await this.projectRepo.update({
      where: { id },
      data: {
        status: statusDto.status as any,
        ...(statusDto.status === 'COMPLETED' && { actualEndDate: new Date() }),
      },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
        salesProject: { select: { id: true } },
        engineers: {
          select: {
            id: true,
            engineer: {
              select: { id: true, nombre: true, email: true },
            },
          },
        },
        activities: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
          },
        },
      },
    });

    if (updated.salesProjectId) {
      const salesStatus = salesPatchFromOps({
        title: updated.title,
        projectType: updated.projectType,
        scopeSummary: updated.scopeSummary,
        siteCount: updated.siteCount,
        startDate: updated.startDate,
        endDate: updated.endDate,
        status: updated.status,
      }).status;
      await this.prisma.salesProject.update({
        where: { id: updated.salesProjectId },
        data: { status: salesStatus },
      }).catch(() => undefined);
    }

    return updated;
  }

  async assignEngineer(projectId: number, assignDto: AssignProjectEngineerDto, companyId?: number | null) {
    await this.findById(projectId, companyId);

    // Check if engineer already assigned
    const existing = await this.projectEngineerRepo.findUnique({
      where: {
        projectId_engineerId: {
          projectId,
          engineerId: assignDto.engineerId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Engineer already assigned to this project');
    }

    return this.projectEngineerRepo.create({
      data: {
        projectId,
        engineerId: assignDto.engineerId,
      },
      include: {
        engineer: {
          select: { id: true, nombre: true, email: true },
        },
        project: {
          select: { id: true, title: true },
        },
      },
    });
  }

  async removeEngineer(projectId: number, engineerId: number, companyId?: number | null) {
    await this.findById(projectId, companyId);

    const assignment = await this.projectEngineerRepo.findUnique({
      where: {
        projectId_engineerId: {
          projectId,
          engineerId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Engineer assignment not found');
    }

    return this.projectEngineerRepo.delete({
      where: {
        projectId_engineerId: {
          projectId,
          engineerId,
        },
      },
    });
  }

  async getProjectActivities(projectId: number, companyId?: number | null) {
    await this.findById(projectId, companyId);

    return this.prisma['activity'].findMany({
      where: { projectId } as any,
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        descripcion: true,
        estatus: true,
        ticketType: true,
        workType: true,
        responsable: {
          select: { id: true, nombre: true, email: true },
        },
        branchName: true,
        branchNumber: true,
        fechaInicio: true,
        fechaFinalizacion: true,
      },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  async getProjectEngineersActivityCount(projectId: number, companyId?: number | null) {
    await this.findById(projectId, companyId);

    const engineers = await this.projectEngineerRepo.findMany({
      where: { projectId },
      include: {
        engineer: {
          select: { id: true, nombre: true, email: true },
        },
      },
    });

    const engineerIds = engineers.map((e: any) => e.engineerId);

    const activities = await this.prisma['activity'].groupBy({
      by: ['responsableId'],
      where: {
        projectId,
        responsableId: { in: engineerIds },
      } as any,
      _count: {
        id: true,
      },
    });

    const activityMap = activities.reduce((acc: Record<number, number>, act: any) => {
      acc[act.responsableId] = act?._count?.id || 0;
      return acc;
    }, {} as Record<number, number>);

    return engineers.map((e: any) => ({
      engineer: e.engineer,
      activityCount: activityMap[e.engineerId] || 0,
    }));
  }

  async getProjectDuration(projectId: number, companyId?: number | null) {
    const project = await this.findById(projectId, companyId);

    const startDate = new Date(project.startDate);
    const endDate = project.actualEndDate ? new Date(project.actualEndDate) : project.endDate ? new Date(project.endDate) : new Date();

    const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      startDate,
      endDate,
      durationDays,
      isActive: project.status === 'ACTIVE',
    };
  }

  async createProjectActivity(projectId: number, dto: CreateProjectActivityDto, userId: number, companyId?: number | null) {
    const project = await this.findById(projectId, companyId);
    return this.activitiesService.create(
      {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        projectId,
        clientId: project.clientId,
        activityType: 'CLIENT',
        ticketType: 'INSTALACION',
        workType: 'ISSUE',
        branchName: dto.branchName,
        branchNumber: dto.branchNumber,
        creadoPorId: userId,
        responsableId: dto.responsableId,
      },
      (project as any).companyId,
    );
  }

  async createSiteActivities(projectId: number, userId: number, responsableId?: number, companyId?: number | null) {
    const project = await this.findById(projectId, companyId);
    const siteCount = project.siteCount ?? 0;
    if (siteCount < 1) {
      throw new BadRequestException('El proyecto no tiene sitios/sucursales definidos');
    }

    const assigneeId = responsableId ?? project.vendorId;
    const created = [];
    for (let i = 1; i <= siteCount; i += 1) {
      const activity = await this.activitiesService.create(
        {
          titulo: `${project.title} — Sucursal ${i}`,
          descripcion: project.scopeSummary || project.description || undefined,
          projectId,
          clientId: project.clientId,
          activityType: 'CLIENT',
          ticketType: 'INSTALACION',
          workType: 'ISSUE',
          branchName: `Sucursal ${i}`,
          branchNumber: String(i),
          creadoPorId: userId,
          responsableId: assigneeId,
        },
        (project as any).companyId,
      );
      created.push(activity);
    }
    return { count: created.length, activities: created };
  }
}
