import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { generateTicketReportPdf } from './ticket-report-pdf.js';
import fs from 'fs/promises';
import path from 'path';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  // Dummy implementation to avoid controller errors
  toCSV(_data: any[]): string {
    return '';
  }

  importMany(_json: any[]): void {
    throw new Error('importMany no implementado en ActivitiesService');
  }


  private async generateNextAnNumber(): Promise<string> {
    const activities = await this.prisma['activity'].findMany({
      select: { anNumber: true },
    });

    let maxNumber = 0;
    let prefix = 'AN-';
    let padLength = 4;

    for (const activity of activities) {
      if (!activity.anNumber) continue;
      const match = activity.anNumber.match(/^(.*?)(\d+)$/);
      if (!match) continue;
      const numeric = Number(match[2]);
      if (Number.isNaN(numeric)) continue;
      if (numeric >= maxNumber) {
        maxNumber = numeric;
        prefix = match[1] || 'AN-';
        padLength = match[2].length || padLength;
      }
    }

    const next = maxNumber + 1;
    return `${prefix}${String(next).padStart(padLength, '0')}`;
  }

  async getNextAnNumber(): Promise<string> {
    return this.generateNextAnNumber();
  }

  async create(createActivityDto: CreateActivityDto) {
    const trimmed = createActivityDto.anNumber?.trim();
    const anNumber = trimmed ? trimmed : await this.generateNextAnNumber();
    
    const activity = await this.prisma['activity'].create({
      data: { ...createActivityDto, anNumber },
      include: { responsable: { select: { nombre: true, id: true } }, creador: { select: { nombre: true } } },
    });

    // Notify the assigned user about new activity
    if (activity.responsableId && activity.responsable) {
      await this.notificationHierarchy.notifyActivityAssigned(
        activity.responsableId,
        activity.id,
        activity.anNumber || 'Nueva actividad',
        activity.creador?.nombre || 'Sistema',
      );
    }

    return activity;
  }

  async findAll(query?: PaginationQueryDto) {
    const where: any = {};
    if (query?.search) {
      where.OR = [
        { titulo: { contains: query.search, mode: 'insensitive' } },
        { anNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const include = {
      creador: true,
      responsable: true,
      client: true,
      serviceSheet: true,
      activityEvidence: {
        include: {
          reviewedBy: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      },
    };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['activity'].findMany({ where, include, skip: query.skip, take: query.take, orderBy: { fechaAsignacion: 'desc' } }),
        this.prisma['activity'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['activity'].findMany({ where, include });
  }

  async findAllDetailed() {
    return this.prisma['activity'].findMany({
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        prioridad: true,
        ticketType: true,
        fechaAsignacion: true,
        fechaInicio: true,
        fechaFinalizacion: true,
        branchName: true,
        branchCity: true,
        branchState: true,
        client: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        responsable: {
          select: {
            nombre: true,
          },
        },
        evidencias: {
          select: {
            id: true,
            archivoUrl: true,
            tipoEvidencia: true,
            calificacionEficiencia: true,
            latitud: true,
            longitud: true,
          },
        },
        serviceSheet: {
          select: {
            pdfUrl: true,
          },
        },
        clientFeedback: {
          select: {
            rating: true,
            wasOnTime: true,
            wasFriendly: true,
            wasSolved: true,
            comments: true,
            createdAt: true,
          },
        },
      },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  async findByDepartment(departmentId: number) {
    // Busca actividades donde el responsable es de ese departamento
    return this.prisma['activity'].findMany({
      where: { responsable: { departmentId } },
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        activityEvidence: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });
  }

  async findByResponsible(userId: number) {
    return this.prisma['activity'].findMany({
      where: { responsableId: userId },
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        activityEvidence: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });
  }

  async findByAllowedUsers(userIds: number[]) {
    // Actividades cuyo responsable está en la lista (p. ej. alcance de consola para admin)
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['activity'].findMany({
      where: { responsableId: { in: userIds } },
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        activityEvidence: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: number) {
    return this.prisma['activity'].findUnique({
      where: { id },
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        activityEvidence: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });
  }

  async generateTicketReport(activityId: number) {
    const activity = await this.prisma['activity'].findUnique({
      where: { id: activityId },
      include: {
        client: true,
        responsable: true,
        serviceSheet: true,
        evidencias: true,
        activityEvidence: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        inventorySnapshot: {
          include: {
            items: {
              orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    if (!activity) return null;

    const normalizeReportUploadUrl = (value?: string | null) => {
      if (!value) return '';
      const raw = value.trim();
      if (!raw) return '';
      if (/^https?:\/\//i.test(raw)) {
        try {
          const parsed = new URL(raw);
          return parsed.pathname || '';
        } catch {
          return raw;
        }
      }

      const normalized = raw
        .replace(/\\+/g, '/')
        .replace(/^\/api(?=\/uploads\/)/i, '')
        .replace(/^\/?uploads\//i, '')
        .replace(/^\/?activities\//i, 'activities/')
        .replace(/^\/+/, '');

      if (!normalized) return '';
      return `/uploads/${normalized}`.replace(/\/uploads\/+/, '/uploads/');
    };

    const flowEvidence = activity.activityEvidence;
    const flowItems = [
      flowEvidence?.entryPhotoUrl
        ? {
            archivoUrl: normalizeReportUploadUrl(flowEvidence.entryPhotoUrl),
            tipoEvidencia: 'Foto llegada',
            latitud: flowEvidence.entryLatitude == null ? null : Number(flowEvidence.entryLatitude),
            longitud: flowEvidence.entryLongitude == null ? null : Number(flowEvidence.entryLongitude),
          }
        : null,
      ...((flowEvidence?.evidencePhotos || []).map((url, index) => ({
        archivoUrl: normalizeReportUploadUrl(url),
        tipoEvidencia: `Evidencia ${index + 1}`,
        latitud: null,
        longitud: null,
      }))),
      flowEvidence?.serviceSheetPdfUrl
        ? {
            archivoUrl: normalizeReportUploadUrl(flowEvidence.serviceSheetPdfUrl),
            tipoEvidencia: 'PDF hoja de servicio',
            latitud: null,
            longitud: null,
          }
        : null,
      flowEvidence?.exitPhotoUrl
        ? {
            archivoUrl: normalizeReportUploadUrl(flowEvidence.exitPhotoUrl),
            tipoEvidencia: 'Foto salida',
            latitud: flowEvidence.exitLatitude == null ? null : Number(flowEvidence.exitLatitude),
            longitud: flowEvidence.exitLongitude == null ? null : Number(flowEvidence.exitLongitude),
          }
        : null,
    ].filter((item): item is { archivoUrl: string; tipoEvidencia: string; latitud: number | null; longitud: number | null } => {
      return Boolean(item && item.archivoUrl);
    });

    const legacyItems = (activity.evidencias || []).map((evidence) => ({
      archivoUrl: normalizeReportUploadUrl(evidence.archivoUrl),
      tipoEvidencia: evidence.tipoEvidencia,
      latitud: evidence.latitud === null || evidence.latitud === undefined ? null : Number(evidence.latitud),
      longitud: evidence.longitud === null || evidence.longitud === undefined ? null : Number(evidence.longitud),
    })).filter((item) => Boolean(item.archivoUrl));

    const dedupeEvidences = (
      items: Array<{ archivoUrl: string; tipoEvidencia: string; latitud: number | null; longitud: number | null }>,
    ) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.archivoUrl.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const mergedEvidences = dedupeEvidences([...flowItems, ...legacyItems]);

    const serviceSheetData = flowEvidence?.serviceSheetData && typeof flowEvidence.serviceSheetData === 'object'
      ? flowEvidence.serviceSheetData as Record<string, any>
      : null;

    const pdf = await generateTicketReportPdf({
      anNumber: activity.anNumber,
      titulo: activity.titulo,
      estatus: activity.estatus,
      clientName: activity.client?.name,
      clientLogoUrl: activity.client?.logoUrl,
      branchName: activity.branchName,
      branchNumber: activity.branchNumber,
      branchCity: activity.branchCity,
      branchState: activity.branchState,
      branchAddress: activity.branchAddress,
      workType: activity.workType,
      ticketType: activity.ticketType,
      prioridad: activity.prioridad,
      dueAt: activity.fechaEntregaEsperada,
      startedAt: activity.fechaInicio,
      finishedAt: activity.fechaFinalizacion,
      responsableName: activity.responsable?.nombre || null,
      technicianName: serviceSheetData?.technicianName || activity.responsable?.nombre || null,
      serviceDate: serviceSheetData?.serviceDate || null,
      clientCompany: serviceSheetData?.clientCompany || activity.client?.name || null,
      clientPhone: serviceSheetData?.clientPhone || null,
      managerName: serviceSheetData?.managerName || activity.serviceSheet?.managerName || null,
      managerRole: serviceSheetData?.managerRole || activity.serviceSheet?.managerRole || null,
      managerSignature: serviceSheetData?.managerSignature || null,
      materialsUsed: serviceSheetData?.materialsUsed || null,
      hoursWorked: serviceSheetData?.hoursWorked || null,
      workSummary: serviceSheetData?.workSummary || activity.serviceSheet?.workSummary || null,
      observations: serviceSheetData?.observations || activity.serviceSheet?.observations || null,
      inventorySnapshot: activity.inventorySnapshot
        ? {
            status: activity.inventorySnapshot.status,
            previousCount: activity.inventorySnapshot.previousCount,
            currentCount: activity.inventorySnapshot.currentCount,
            deltaCount: activity.inventorySnapshot.deltaCount,
            completedAt: activity.inventorySnapshot.completedAt,
            items: (activity.inventorySnapshot.items || []).map((item) => ({
              groupName: item.groupName,
              sectionName: item.sectionName,
              equipmentName: item.equipmentName,
              serialBefore: item.serialBefore,
              serialAfter: item.serialAfter,
              modelBefore: item.modelBefore,
              modelAfter: item.modelAfter,
              itemStatus: item.itemStatus,
              compareState: item.compareState,
              maintenanceComments: item.maintenanceComments,
            })),
          }
        : null,
      evidences: mergedEvidences,
    });

    const dir = path.resolve(process.cwd(), 'uploads', 'ticket-reports');
    const filename = `reporte-ticket-${activityId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);

    const reportUrl = `/uploads/ticket-reports/${filename}`;
    await this.prisma['activity'].update({
      where: { id: activityId },
      data: { ticketReportUrl: reportUrl, ticketReportGeneratedAt: new Date() },
    });

    return { pdf, reportUrl };
  }

  async update(id: number, updateActivityDto: UpdateActivityDto) {
    const updatedActivity = await this.prisma['activity'].update({
      where: { id },
      data: updateActivityDto,
      include: { responsable: { select: { nombre: true, id: true } } },
    });

    return updatedActivity;
  }

  async remove(id: number) {
    return this.prisma['activity'].delete({ where: { id } });
  }
}
