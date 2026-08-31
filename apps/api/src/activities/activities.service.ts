import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { generateTicketReportPdf } from './ticket-report-pdf.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import fs from 'fs/promises';
import path from 'path';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly domainEvents: DomainEventBusService,
  ) {}

  // Dummy implementation to avoid controller errors
  toCSV(_data: any[]): string {
    return '';
  }

  importMany(_json: any[]): void {
    throw new Error('importMany no implementado en ActivitiesService');
  }


  private async generateNextAnNumber(companyId: number): Promise<string> {
    const [latestNumericAn] = await this.prisma.$queryRaw<Array<{ anNumber: string }>>`
      SELECT "anNumber"
      FROM "Activity"
      WHERE "companyId" = ${companyId}
        AND "anNumber" ~ '\\d+$'
      ORDER BY CAST(substring("anNumber" FROM '(\\d+)$') AS INTEGER) DESC
      LIMIT 1
    `;

    if (!latestNumericAn?.anNumber) {
      return 'AN-0001';
    }

    const match = latestNumericAn.anNumber.match(/^(.*?)(\d+)$/);
    if (!match) {
      return 'AN-0001';
    }

    const prefix = match[1] || 'AN-';
    const currentNumber = Number(match[2]);
    const padLength = match[2].length || 4;

    if (Number.isNaN(currentNumber)) {
      return 'AN-0001';
    }

    const next = currentNumber + 1;
    return `${prefix}${String(next).padStart(padLength, '0')}`;
  }

  async getNextAnNumber(companyId?: number | null): Promise<string> {
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    return this.generateNextAnNumber(resolvedCompanyId);
  }

  async create(createActivityDto: CreateActivityDto, companyId?: number | null) {
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    const trimmed = createActivityDto.anNumber?.trim();
    const anNumber = trimmed ? trimmed : await this.generateNextAnNumber(resolvedCompanyId);

    const activity = await this.prisma['activity'].create({
      data: { ...createActivityDto, anNumber, companyId: resolvedCompanyId },
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

    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'ACTIVITY',
      entityId: activity.id,
      companyId: resolvedCompanyId,
      userId: createActivityDto.responsableId ?? undefined,
      payload: {
        estatus: activity.estatus,
        anNumber: activity.anNumber,
        titulo: activity.titulo,
        responsableId: activity.responsableId,
      },
    });

    return activity;
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const where: any = { ...companyWhere(companyId ?? null) };
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

  async findByResponsible(userId: number, companyId?: number | null) {
    return this.prisma['activity'].findMany({
      where: { responsableId: userId, ...companyWhere(companyId ?? null) },
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

  async findByAllowedUsers(userIds: number[], companyId?: number | null) {
    // Actividades cuyo responsable está en la lista (p. ej. alcance de consola para admin)
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['activity'].findMany({
      where: { responsableId: { in: userIds }, ...companyWhere(companyId ?? null) },
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

  async findOne(id: number, companyId?: number | null) {
    const activity = await this.prisma['activity'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        evidencias: { orderBy: { subidoEn: 'desc' } },
        assignees: {
          where: { retiradoAt: null },
          include: { user: { select: { id: true, nombre: true, email: true } } },
        },
        inventorySnapshot: {
          include: {
            items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
          },
        },
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
    assertCompanyAccess(activity, companyId, 'Actividad');
    return activity;
  }

  /** KPIs para la bandeja de actividades (OPS dashboard). */
  async getSummary(companyId?: number | null) {
    const scope = companyWhere(companyId ?? null);
    const now = new Date();
    const rows = await this.prisma.activity.findMany({
      where: { ...scope, deletedAt: null },
      select: { estatus: true, fechaMaxima: true, fechaEntregaEsperada: true },
    });

    const closed = new Set(['Finalizada', 'Finalizado', 'COMPLETADA', 'Cancelada', 'CANCELADA', 'Rechazada']);
    const inProgress = new Set(['En Proceso', 'EN_PROCESO', 'Por Validar', 'POR_VALIDAR']);

    let abiertas = 0;
    let enProceso = 0;
    let completadas = 0;
    let vencidas = 0;

    for (const row of rows) {
      const status = String(row.estatus ?? '');
      const due = row.fechaMaxima ?? row.fechaEntregaEsperada;
      const isClosed = closed.has(status);
      const isProgress = inProgress.has(status);

      if (isClosed) {
        completadas += 1;
      } else if (isProgress) {
        enProceso += 1;
      } else {
        abiertas += 1;
      }

      if (!isClosed && due && new Date(due).getTime() < now.getTime()) {
        vencidas += 1;
      }
    }

    return {
      abiertas,
      enProceso,
      completadas,
      vencidas,
      total: rows.length,
    };
  }

  /** Tablero de despacho — columnas por estatus + carga por técnico. */
  async getDispatchBoard(companyId?: number | null, allowedUserIds?: number[]) {
    const scope = companyWhere(companyId ?? null);
    const where: Record<string, unknown> = { ...scope, deletedAt: null };
    if (allowedUserIds?.length) {
      where.responsableId = { in: allowedUserIds };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const now = new Date();

    const closed = new Set(['Finalizada', 'Finalizado', 'COMPLETADA', 'Cancelada', 'CANCELADA', 'Rechazada']);
    const inProgress = new Set(['En Proceso', 'EN_PROCESO', 'EN_CURSO']);
    const porValidar = new Set(['Por Validar', 'POR_VALIDAR']);

    const rows = await this.prisma.activity.findMany({
      where,
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        prioridad: true,
        fechaAsignacion: true,
        fechaEntregaEsperada: true,
        fechaMaxima: true,
        fechaFinalizacion: true,
        branchName: true,
        branchCity: true,
        responsable: { select: { id: true, nombre: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ prioridad: 'desc' }, { fechaAsignacion: 'asc' }],
      take: 500,
    });

    type DispatchCard = {
      id: number;
      anNumber: string;
      titulo: string;
      estatus: string;
      prioridad: string | null;
      branchName: string | null;
      branchCity: string | null;
      fechaEntregaEsperada: string | null;
      overdue: boolean;
      responsable: { id: number; nombre: string } | null;
      client: { id: number; name: string } | null;
    };

    const columns: Record<string, DispatchCard[]> = {
      pendiente: [],
      en_curso: [],
      por_validar: [],
      completadas_hoy: [],
    };

    const techMap = new Map<
      number,
      { id: number; nombre: string; activas: number; enCurso: number; completadasHoy: number }
    >();

    for (const row of rows) {
      const status = String(row.estatus ?? '');
      const due = row.fechaMaxima ?? row.fechaEntregaEsperada;
      const isClosed = closed.has(status);
      const overdue = Boolean(!isClosed && due && new Date(due).getTime() < now.getTime());

      const card: DispatchCard = {
        id: row.id,
        anNumber: row.anNumber,
        titulo: row.titulo,
        estatus: status,
        prioridad: row.prioridad,
        branchName: row.branchName,
        branchCity: row.branchCity,
        fechaEntregaEsperada: row.fechaEntregaEsperada?.toISOString() ?? null,
        overdue,
        responsable: row.responsable,
        client: row.client,
      };

      if (isClosed) {
        if (row.fechaFinalizacion && row.fechaFinalizacion >= startOfToday) {
          columns.completadas_hoy.push(card);
        }
      } else if (porValidar.has(status)) {
        columns.por_validar.push(card);
      } else if (inProgress.has(status)) {
        columns.en_curso.push(card);
      } else {
        columns.pendiente.push(card);
      }

      const tech = row.responsable;
      if (!tech) continue;
      const cur = techMap.get(tech.id) ?? {
        id: tech.id,
        nombre: tech.nombre,
        activas: 0,
        enCurso: 0,
        completadasHoy: 0,
      };
      if (!isClosed) {
        cur.activas += 1;
        if (inProgress.has(status) || porValidar.has(status)) cur.enCurso += 1;
      } else if (row.fechaFinalizacion && row.fechaFinalizacion >= startOfToday) {
        cur.completadasHoy += 1;
      }
      techMap.set(tech.id, cur);
    }

    const fieldRoleKeys = ['ing_campo', 'ing_soporte', 'coord_operaciones', 'senior_engineer'];
    const tenantId = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
    const assignableUsers = tenantId
      ? await this.prisma.user.findMany({
          where: {
            isActive: true,
            companyMemberships: { some: { companyId: tenantId } },
            OR: [
              { roleKey: { in: fieldRoleKeys } },
              { role: { nombre: { contains: 'Campo', mode: 'insensitive' } } },
              { role: { nombre: { contains: 'Soporte', mode: 'insensitive' } } },
            ],
          },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
          take: 120,
        })
      : [];

    return {
      columns,
      technicians: Array.from(techMap.values()).sort((a, b) => b.activas - a.activas),
      assignableUsers,
      generatedAt: now.toISOString(),
    };
  }

  async generateTicketReport(activityId: number, companyId?: number | null) {
    const activity = await this.prisma['activity'].findFirst({
      where: { id: activityId, ...companyWhere(companyId ?? null) },
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
    assertCompanyAccess(activity, companyId, 'Actividad');

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

  async update(
    id: number,
    updateActivityDto: UpdateActivityDto,
    actor?: { id: number; nombre?: string },
    companyId?: number | null,
  ) {
    const prev = await this.prisma['activity'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      select: { estatus: true, responsableId: true, anNumber: true, titulo: true, companyId: true },
    });
    assertCompanyAccess(prev, companyId, 'Actividad');

    
    // Armor: gate de evidencias mínimas antes de Finalizada
    if (updateActivityDto.estatus !== undefined) {
      const next = String(updateActivityDto.estatus);
      const prevStatus = String(prev?.estatus || '');
      if (/finalizada|completada/i.test(next) && !/finalizada|completada/i.test(prevStatus)) {
        const evidences = await this.prisma['evidence'].findMany({
          where: {
            actividadId: id,
            ...(companyId != null ? companyWhere(companyId) : {}),
          },
          select: { tipoEvidencia: true },
        });
        const types = new Set(evidences.map((e: any) => String(e.tipoEvidencia || '')));
        const hasEntry = [...types].some((t) => /llegada|entrada|entry/i.test(t));
        const hasExit = [...types].some((t) => /salida|exit/i.test(t));
        const hasSheet = [...types].some((t) => /hoja|servicio|sheet/i.test(t));
        const missing: string[] = [];
        if (!hasEntry) missing.push('Foto de llegada/entrada');
        if (!hasExit && !hasSheet) missing.push('Foto de salida o Hoja de servicio');
        if (missing.length) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'No se puede finalizar: faltan evidencias mínimas',
            missingEvidence: missing,
            error: `Faltan: ${missing.join(', ')}`,
          });
        }
      }
    }

const updatedActivity = await this.prisma['activity'].update({
      where: { id },
      data: updateActivityDto,
      include: { responsable: { select: { nombre: true, id: true } } },
    });

    if (actor?.id && prev && updateActivityDto.estatus !== undefined) {
      const nextStatus = String(updateActivityDto.estatus);
      const prevStatus = String(prev.estatus || '');
      if (/finalizada|completada/i.test(nextStatus) && !/finalizada|completada/i.test(prevStatus)) {
        const label =
          (updatedActivity.anNumber && String(updatedActivity.anNumber).trim()) ||
          (updatedActivity.titulo && String(updatedActivity.titulo).trim()) ||
          `Actividad ${id}`;
        const actorName = String(actor.nombre || 'Usuario').trim() || 'Usuario';
        void this.notificationHierarchy
          .notifyActivityMarkedFinished(actor.id, id, label, actorName, updatedActivity.responsableId)
          .catch(() => undefined);
      }
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'ACTIVITY',
      entityId: id,
      companyId: prev?.companyId ?? updatedActivity.companyId,
      userId: actor?.id,
      payload: {
        estatus: updatedActivity.estatus,
        anNumber: updatedActivity.anNumber,
        titulo: updatedActivity.titulo,
        responsableId: updatedActivity.responsableId,
        prevEstatus: prev?.estatus,
      },
    });

    return updatedActivity;
  }

  async remove(id: number, companyId?: number | null) {
    const existing = await this.prisma['activity'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      select: { id: true, companyId: true },
    });
    assertCompanyAccess(existing, companyId, 'Actividad');
    return this.prisma['activity'].delete({ where: { id } });
  }
}
