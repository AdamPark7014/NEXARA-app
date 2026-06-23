import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { CreateOperationalProjectDto, UpdateOperationalProjectDto, ProjectStatusChangeDto, AssignProjectEngineerDto, CreateProjectActivityDto } from './dto/create-operational-project.dto.js';

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
    return this.projectRepo.create({
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
      },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
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
  }

  async findAll(vendorId?: number, clientId?: number, status?: string) {
    const where: any = {};
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

  async findById(id: number) {
    const project = await this.projectRepo.findUnique({
      where: { id },
      include: {
        vendor: {
          select: { id: true, nombre: true, email: true },
        },
        client: {
          select: { id: true, name: true },
        },
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

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: number, updateDto: UpdateOperationalProjectDto) {
    const project = await this.findById(id);

    return this.projectRepo.update({
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
  }

  async changeStatus(id: number, statusDto: ProjectStatusChangeDto) {
    const project = await this.findById(id);
    const validStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];

    if (!validStatuses.includes(statusDto.status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    return this.projectRepo.update({
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
  }

  async assignEngineer(projectId: number, assignDto: AssignProjectEngineerDto) {
    const project = await this.findById(projectId);

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

  async removeEngineer(projectId: number, engineerId: number) {
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

  async getProjectActivities(projectId: number) {
    const project = await this.findById(projectId);

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

  async getProjectEngineersActivityCount(projectId: number) {
    const project = await this.findById(projectId);

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

  async getProjectDuration(projectId: number) {
    const project = await this.findById(projectId);

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

  async createProjectActivity(projectId: number, dto: CreateProjectActivityDto, userId: number) {
    const project = await this.findById(projectId);
    return this.activitiesService.create({
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
    });
  }

  async createSiteActivities(projectId: number, userId: number, responsableId?: number) {
    const project = await this.findById(projectId);
    const siteCount = project.siteCount ?? 0;
    if (siteCount < 1) {
      throw new BadRequestException('El proyecto no tiene sitios/sucursales definidos');
    }

    const assigneeId = responsableId ?? project.vendorId;
    const created = [];
    for (let i = 1; i <= siteCount; i += 1) {
      const activity = await this.activitiesService.create({
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
      });
      created.push(activity);
    }
    return { count: created.length, activities: created };
  }
}
