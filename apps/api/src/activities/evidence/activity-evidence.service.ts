import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { Prisma, type ActivityEvidence } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { saveBase64Photo } from '../../common/file-upload.util';
import { ActivitiesService } from '../activities.service.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import { ActivityGeofenceService } from '../geofence/activity-geofence.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import {
  clampEvidencePhotoRequired,
  requiresServiceSheetPdf,
  nextEvidenceStep,
  isPdfUrl,
  evidenceProgressPct,
  evidenceStepsForKind,
  type EvidenceStep,
} from './evidence-flow.helpers.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

type ActivityEvidenceStatus = EvidenceStep;

const EVIDENCE_STEP_ORDER: ActivityEvidenceStatus[] = [
  'ENTRY_PHOTO',
  'EVIDENCE_PHOTOS',
  'SERVICE_SHEET_PDF',
  'SERVICE_SHEET_DATA',
  'EXIT_PHOTO',
];

type PhotoGeo = { latitude: number; longitude: number; capturedAt: string | null };

/**
 * Ubicación por foto de evidencia enviada por el cliente: se alinea al número de fotos y
 * descarta coordenadas inválidas (null en su lugar). undefined si no mandó nada útil.
 */
function sanitizePhotoGeo(raw: unknown, count: number): Array<PhotoGeo | null> | undefined {
  if (!Array.isArray(raw) || count <= 0) return undefined;
  const out: Array<PhotoGeo | null> = [];
  for (let i = 0; i < count; i++) {
    const g = raw[i] as { latitude?: unknown; longitude?: unknown; capturedAt?: unknown } | null;
    const lat = Number(g?.latitude);
    const lng = Number(g?.longitude);
    const valid =
      g != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);
    out.push(
      valid
        ? {
            latitude: lat,
            longitude: lng,
            capturedAt: typeof g?.capturedAt === 'string' ? g.capturedAt.slice(0, 40) : null,
          }
        : null,
    );
  }
  return out.some(Boolean) ? out : undefined;
}

@Injectable()
export class ActivityEvidenceService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationHierarchy: NotificationHierarchyService,
    @Optional() private geofence?: ActivityGeofenceService,
  ) {}

  private async notifyEvidenceReadyForReview(
    activityId: number,
    submitterId?: number | null,
    /** Reenvío de lo que se le devolvió: el aviso lo dice para que la revisen de nuevo. */
    correccion = false,
  ) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        include: { responsable: { select: { id: true, nombre: true } } },
      });
      if (!activity?.responsable) return;
      // Autor real = quien subió la evidencia (antes se reportaba al responsable).
      const submitter = submitterId
        ? await this.prisma.user.findUnique({
            where: { id: submitterId },
            select: { id: true, nombre: true },
          })
        : null;
      // También revisan los encargados de la cadena (LEAD) y el jefe directo de quien la subió.
      const leads = await this.prisma.activityAssignee.findMany({
        where: { activityId, retiradoAt: null, rol: 'LEAD' },
        select: { userId: true },
      });
      const jefe = submitter
        ? await this.prisma.user.findUnique({ where: { id: submitter.id }, select: { managerId: true } })
        : null;
      await this.notificationHierarchy.notifyEvidenceSubmitted(
        submitter?.id ?? activity.responsableId,
        activityId,
        activity.titulo || '',
        submitter?.nombre || activity.responsable.nombre || 'Usuario',
        activity.anNumber,
        activity.responsableId,
        [...leads.map((l) => l.userId), ...(jefe?.managerId ? [jefe.managerId] : [])],
        correccion,
      );
    } catch {
      /* no bloquear flujo de evidencias */
    }
  }

  private mapReviewStatus(reviewStatus: string | null | undefined) {
    if (reviewStatus === 'APPROVED') return 'Aprobada';
    if (reviewStatus === 'REJECTED') return 'Rechazada';
    return 'Pendiente';
  }

  private parseRejectedSteps(evidence: { rejectedSteps?: unknown; rejectedStep?: string | null }): string[] {
    if (Array.isArray(evidence.rejectedSteps) && evidence.rejectedSteps.length > 0) {
      return evidence.rejectedSteps.filter((step): step is string => typeof step === 'string');
    }
    if (evidence.rejectedStep) return [evidence.rejectedStep];
    return [];
  }

  private firstRejectedStep(steps: string[]): ActivityEvidenceStatus {
    const found = EVIDENCE_STEP_ORDER.find((step) => steps.includes(step));
    return (found || steps[0]) as ActivityEvidenceStatus;
  }

  private nextAfterCorrection(
    completedStep: string,
    remainingSteps: string[],
  ): Pick<
    {
      status: ActivityEvidenceStatus | 'COMPLETED';
      reviewStatus: string;
      rejectedSteps: string[] | null;
      rejectedStep: string | null;
    },
    'status' | 'reviewStatus' | 'rejectedSteps' | 'rejectedStep'
  > {
    if (remainingSteps.length === 0) {
      return {
        status: 'COMPLETED',
        reviewStatus: 'PENDING',
        rejectedSteps: null,
        rejectedStep: null,
      };
    }
    const next = this.firstRejectedStep(remainingSteps);
    return {
      status: next,
      reviewStatus: 'REJECTED',
      rejectedSteps: remainingSteps,
      rejectedStep: next,
    };
  }

  private clearEvidenceData() {
    return {
      entryPhotoUrl: null,
      entryLatitude: null,
      entryLongitude: null,
      entryPhotoUploadedAt: null,
      evidencePhotos: [],
      evidencePhotosUploadedAt: null,
      serviceSheetPdfUrl: null,
      serviceSheetUploadedAt: null,
      serviceSheetData: Prisma.DbNull,
      serviceSheetCompletedAt: null,
      exitPhotoUrl: null,
      exitLatitude: null,
      exitLongitude: null,
      exitPhotoUploadedAt: null,
      completedAt: null,
    };
  }

  private mapReviewComment(reviewStatus: string | null | undefined, reviewNotes?: string | null) {
    if (reviewStatus === 'APPROVED') {
      return reviewNotes || 'Evidencia aprobada por administración';
    }
    if (reviewStatus === 'REJECTED') {
      return reviewNotes || 'Evidencia desaprobada. Vuelva a adjuntar sus evidencias';
    }
    return 'Pendiente de revisión por administración';
  }

  private normalizeUploadUrl(url?: string | null) {
    if (!url) return '';
    if (url.startsWith('http')) return url;

    const sanitized = url
      .replace(/\\+/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/api(?=\/uploads\/)/i, '')
      .replace(/^\/?uploads\//i, '')
      .replace(/^\/+/, '');

    return `/uploads/${sanitized}`.replace(/\/uploads\/+/i, '/uploads/');
  }

  private hasPermission(user: { permissions?: string[]; isSuperAdmin?: boolean } | null | undefined, permission: string) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return Boolean(user.permissions?.includes(permission));
  }

  private async getAccessibleResponsibleIds(currentUser: {
    id: number;
    departmentId: number;
    permissions?: string[];
    isSuperAdmin?: boolean;
  }) {
    if (currentUser.isSuperAdmin) {
      const users = await this.prisma.user.findMany({
        where: {
          email: {
            notIn: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'],
          },
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

      if (this.hasPermission(currentUser, PERMISSIONS.CONSOLE_ADMIN)) {
        const users = await this.prisma.user.findMany({
          where: {
            email: { notIn: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] },
          },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

    if (!this.hasPermission(currentUser, PERMISSIONS.EVIDENCES_REVIEW)) {
      return [currentUser.id];
    }

    const users = await this.prisma.user.findMany({
      where: {
        departmentId: currentUser.departmentId,
        role: {
          accesoEvidencias: true,
        },
      },
      select: { id: true },
    });

    return [currentUser.id, ...users.map((u) => u.id)];
  }

  private mapEvidenceHistoryRow(evidence: any) {
    const entryPhotoUrl = this.normalizeUploadUrl(evidence.entryPhotoUrl);
    const exitPhotoUrl = this.normalizeUploadUrl(evidence.exitPhotoUrl);
    const serviceSheetPdfUrl = this.normalizeUploadUrl(evidence.serviceSheetPdfUrl);
    const evidencePhotoUrls = (evidence.evidencePhotos || []).map((photoUrl: string) => this.normalizeUploadUrl(photoUrl));

    return {
      id: evidence.id,
      tipoEvidencia: 'Flujo de actividad',
      archivoUrl:
        serviceSheetPdfUrl ||
        exitPhotoUrl ||
        entryPhotoUrl ||
        evidencePhotoUrls[0] ||
        '',
      archivos: [
        ...(entryPhotoUrl ? [{ label: 'Entrada', type: 'image', url: entryPhotoUrl }] : []),
        ...evidencePhotoUrls.map((url: string, index: number) => ({
          label: `Evidencia ${index + 1}`,
          type: 'image',
          url,
        })),
        ...(serviceSheetPdfUrl ? [{ label: 'PDF', type: 'pdf', url: serviceSheetPdfUrl }] : []),
        ...(exitPhotoUrl ? [{ label: 'Salida', type: 'image', url: exitPhotoUrl }] : []),
      ],
      aprobada: evidence.reviewStatus === 'APPROVED',
      estatus: this.mapReviewStatus(evidence.reviewStatus),
      comentarios: this.mapReviewComment(evidence.reviewStatus, evidence.reviewNotes),
      observacionesRevision: evidence.reviewStatus === 'REJECTED' ? evidence.reviewNotes : null,
      calificacionEficiencia: null,
      fechaEvidencia: evidence.completedAt || evidence.updatedAt || evidence.createdAt,
      revisadoEn: evidence.reviewedAt,
      entryPhotoUrl,
      entryPhotoUploadedAt: evidence.entryPhotoUploadedAt,
      entryLatitude: evidence.entryLatitude != null ? Number(evidence.entryLatitude) : null,
      entryLongitude: evidence.entryLongitude != null ? Number(evidence.entryLongitude) : null,
      evidencePhotos: evidencePhotoUrls,
      evidencePhotosUploadedAt: evidence.evidencePhotosUploadedAt,
      serviceSheetPdfUrl,
      serviceSheetUploadedAt: evidence.serviceSheetUploadedAt,
      serviceSheetData: evidence.serviceSheetData,
      serviceSheetCompletedAt: evidence.serviceSheetCompletedAt,
      exitPhotoUrl,
      exitPhotoUploadedAt: evidence.exitPhotoUploadedAt,
      exitLatitude: evidence.exitLatitude != null ? Number(evidence.exitLatitude) : null,
      exitLongitude: evidence.exitLongitude != null ? Number(evidence.exitLongitude) : null,
      completedAt: evidence.completedAt,
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
      latitud:
        evidence.exitLatitude != null
          ? Number(evidence.exitLatitude)
          : evidence.entryLatitude != null
            ? Number(evidence.entryLatitude)
            : null,
      longitud:
        evidence.exitLongitude != null
          ? Number(evidence.exitLongitude)
          : evidence.entryLongitude != null
            ? Number(evidence.entryLongitude)
            : null,
      actividad: {
        id: evidence.activity.id,
        anNumber: evidence.activity.anNumber,
        titulo: evidence.activity.titulo,
        indicaciones: evidence.activity.indicaciones,
        branchName: evidence.activity.branchName,
        branchCity: evidence.activity.branchCity,
        branchState: evidence.activity.branchState,
        branchAddress: evidence.activity.branchAddress,
        creador: evidence.activity.creador,
        responsable: evidence.activity.responsable,
      },
      user: evidence.activity.responsable,
      aprobadoPor: evidence.reviewedBy,
    };
  }

  private ensureActorUserId(user: any): number {
    const id = Number(user?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Usuario no autenticado');
    }
    return id;
  }

  private async loadActivityForTenant(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      select: {
        id: true,
        estatus: true,
        companyId: true,
        workType: true,
        coreKind: true,
        evidencePhotoRequired: true,
        responsableId: true,
        indicaciones: true,
      },
    });
    assertCompanyAccess(activity, tenantId, 'Actividad');
    return activity!;
  }

  /**
   * Obtener o crear el registro de evidencias de una actividad (por usuario)
   */
  async getOrCreateActivityEvidence(activityId: number, userId: number, companyId?: number | null) {
    const activity = await this.loadActivityForTenant(activityId, companyId);

    if (activity.estatus === 'Aprobada') {
      throw new ForbiddenException('La actividad ya fue aprobada y no permite nuevas evidencias');
    }

    let evidence = await this.prisma.activityEvidence.findFirst({
      where: { activityId, userId, ...companyWhere(activity.companyId) },
    });

    if (evidence?.reviewStatus === 'APPROVED') {
      throw new ForbiddenException('La evidencia ya fue aprobada y no puede modificarse');
    }

    if (evidence?.status === 'COMPLETED' && evidence?.reviewStatus !== 'REJECTED') {
      throw new ForbiddenException('La evidencia está en revisión y no puede modificarse');
    }

    if (!evidence) {
      // En despacho, el LEAD solo reparte: la evidencia la sube quien la ejecuta.
      const reparte = await this.prisma.activityAssignee.findFirst({
        where: {
          activityId,
          userId,
          retiradoAt: null,
          rol: 'LEAD',
          activity: { assignmentCharge: 'despacho' },
        },
        select: { id: true },
      });
      if (reparte) {
        throw new ForbiddenException(
          'En despacho solo repartes la actividad: la evidencia la sube quien la ejecuta',
        );
      }
      evidence = await this.prisma.activityEvidence.create({
        data: {
          activityId,
          userId,
          companyId: activity.companyId,
          status: 'ENTRY_PHOTO',
        },
      });
    }

    return evidence;
  }

  /**
   * Quienes deben subir evidencia: assignees activos + responsable.
   * En despacho, quien reparte (LEAD, incluido el responsable) no ejecuta: no se le exige evidencia.
   */
  private async requiredExecutorIds(activityId: number): Promise<number[]> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { responsableId: true, assignmentCharge: true },
    });
    if (!activity) return [];
    const assignees = await this.prisma.activityAssignee.findMany({
      where: { activityId, retiradoAt: null },
      select: { userId: true, rol: true },
    });
    const reparten = new Set<number>(
      activity.assignmentCharge === 'despacho'
        ? [activity.responsableId, ...assignees.filter((a) => a.rol === 'LEAD').map((a) => a.userId)]
        : [],
    );
    return Array.from(
      new Set([...assignees.map((a) => a.userId), activity.responsableId].filter(Boolean)),
    ).filter((id) => !reparten.has(id));
  }

  /**
   * Cuando todo el equipo completó su evidencia la actividad pasa a Por Validar (antes se cerraba sola).
   * Queda 100 % finalizada al aprobarse: ver finalizeIfAllApproved.
   */
  private async maybeFinalizeActivity(
    activityId: number,
    companyId?: number | null,
    lastUserId?: number | null,
  ) {
    const activity = await this.loadActivityForTenant(activityId, companyId);
    const meta = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { titulo: true, anNumber: true },
    });
    const requiredUserIds = await this.requiredExecutorIds(activityId);
    if (requiredUserIds.length === 0) return;

    const completed = await this.prisma.activityEvidence.findMany({
      where: {
        activityId,
        userId: { in: requiredUserIds },
        status: 'COMPLETED',
        ...companyWhere(activity.companyId),
      },
      select: { userId: true },
    });
    const completedIds = new Set(completed.map((e) => e.userId));
    if (!requiredUserIds.every((id) => completedIds.has(id))) return;

    // Todo el equipo terminó: queda Por Validar hasta que un superior la apruebe.
    await this.prisma.activity.update({
      where: { id: activityId },
      data: { estatus: 'Por Validar' },
    });

    // Luis (responsable) y Christian se enteran de que ya pueden revisarla.
    void this.notificationHierarchy.notifyActivityAutoCompleted(
      activityId,
      // El aviso nombra la actividad por su título, nunca por el folio.
      meta?.titulo || '',
      activity.responsableId,
      lastUserId ?? null,
    );
  }

  /**
   * Guardar foto de entrada
   */
  async saveEntryPhoto(
    activityId: number,
    userId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);

    if (evidence.status !== 'ENTRY_PHOTO') {
      throw new BadRequestException('Ya se ha guardado la foto de entrada');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        entryPhotoUrl: photoUrl,
        entryLatitude: latitude,
        entryLongitude: longitude,
        entryPhotoUploadedAt: new Date(),
        status: 'EVIDENCE_PHOTOS',
      },
    });
    this.avisarAvance({ activityId, actorId: userId, paso: 'inicio', at: updated.entryPhotoUploadedAt ?? undefined });
    return updated;
  }

  /** Avance en campo para responsable, encargados y jefes; un fallo del aviso nunca rompe el guardado. */
  private avisarAvance(params: Parameters<NotificationHierarchyService['notifyActivityProgress']>[0]) {
    try {
      void Promise.resolve(this.notificationHierarchy.notifyActivityProgress(params)).catch(() => undefined);
    } catch {
      /* sin aviso */
    }
  }

  /**
   * Guardar fotos de evidencia (N fotos según evidencePhotoRequired)
   */
  async saveEvidencePhotos(
    activityId: number,
    userId: number,
    photoUrls: string[],
    companyId?: number | null,
    /** Ubicación donde se tomó cada foto (opcional; clientes viejos no la mandan). */
    photoGeo?: unknown,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);
    const activity = await this.loadActivityForTenant(activityId, companyId);
    const isInventoryFlow = activity?.workType === 'PREVENTIVE_INVENTORY';
    const required = clampEvidencePhotoRequired(activity.evidencePhotoRequired);

    if (evidence.status !== 'EVIDENCE_PHOTOS') {
      throw new BadRequestException('No estás en el paso correcto para guardar evidencias');
    }

    if (isInventoryFlow) {
      if (photoUrls.length < 1) {
        throw new BadRequestException('Para mantenimiento e inventario se requiere al menos 1 evidencia visual');
      }
    } else if (photoUrls.length < required) {
      // Al menos las requeridas: mandar de más no debe bloquear el paso.
      throw new BadRequestException(`Se requieren al menos ${required} fotos de evidencia`);
    }

    const geo = sanitizePhotoGeo(photoGeo, photoUrls.length);
    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        evidencePhotos: photoUrls,
        evidencePhotosUploadedAt: new Date(),
        ...(geo ? { evidencePhotosGeo: geo } : {}),
        status: nextEvidenceStep('EVIDENCE_PHOTOS', activity.coreKind),
      },
    });
    this.avisarAvance({ activityId, actorId: userId, paso: 'evidencias', fotos: photoUrls.length });
    return updated;
  }

  /**
   * Guardar hoja de servicio PDF
   */
  async saveServiceSheetPdf(
    activityId: number,
    userId: number,
    pdfUrl: string,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);
    const activity = await this.loadActivityForTenant(activityId, companyId);

    if (evidence.status !== 'SERVICE_SHEET_PDF') {
      throw new BadRequestException('No estás en el paso correcto para guardar la hoja de servicio');
    }

    if (!isPdfUrl(pdfUrl)) {
      throw new BadRequestException('La hoja de servicio debe ser un PDF');
    }

    if (!requiresServiceSheetPdf(activity.coreKind)) {
      throw new BadRequestException('Este tipo de actividad no requiere hoja de servicio PDF');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        serviceSheetPdfUrl: pdfUrl,
        serviceSheetUploadedAt: new Date(),
        status: nextEvidenceStep('SERVICE_SHEET_PDF', activity.coreKind),
      },
    });
    this.avisarAvance({ activityId, actorId: userId, paso: 'hoja' });
    return updated;
  }

  /**
   * Completar plantilla de hoja de servicio interna
   */
  async completeServiceSheetForm(
    activityId: number,
    userId: number,
    data: any,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);
    const activity = await this.loadActivityForTenant(activityId, companyId);

    if (evidence.status !== 'SERVICE_SHEET_DATA') {
      throw new BadRequestException('No estás en el paso correcto para completar la plantilla');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        serviceSheetData: data,
        serviceSheetCompletedAt: new Date(),
        status: nextEvidenceStep('SERVICE_SHEET_DATA', activity.coreKind),
      },
    });
    this.avisarAvance({ activityId, actorId: userId, paso: 'formulario' });
    return updated;
  }

  /**
   * Guardar foto de salida
   */
  async saveExitPhoto(
    activityId: number,
    userId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);

    if (evidence.status !== 'EXIT_PHOTO') {
      throw new BadRequestException('No estás en el paso correcto para guardar la foto de salida');
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
      throw new BadRequestException('La ubicación GPS es obligatoria para la foto de salida');
    }
    // Geocerca: la salida solo se registra a menos de 100 m de donde inició.
    await this.geofence?.validarSalida(activityId, userId, latitude, longitude);

    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        exitPhotoUrl: photoUrl,
        exitLatitude: latitude,
        exitLongitude: longitude,
        exitPhotoUploadedAt: new Date(),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await this.maybeFinalizeActivity(activityId, companyId, updated.userId);
    void this.notifyEvidenceReadyForReview(activityId, updated.userId);

    return updated;
  }

  /**
   * Obtener evidencias de una actividad (del usuario actor)
   */
  async getActivityEvidence(
    activityId: number,
    requester?: { id: number; permissions?: string[]; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const userId = this.ensureActorUserId(requester);
    const evidence = await this.prisma.activityEvidence.findFirst({
      where: { activityId, userId, ...companyWhere(companyId ?? null) },
      include: {
        activity: {
          select: {
            id: true,
            indicaciones: true,
            coreKind: true,
            evidencePhotoRequired: true,
            responsableId: true,
            companyId: true,
            estatus: true,
            assignees: {
              where: { userId, retiradoAt: null },
              select: { userId: true, indicaciones: true, rol: true },
            },
          },
        },
      },
    });

    if (!evidence) {
      throw new NotFoundException('Evidencias no encontradas');
    }

    assertCompanyAccess(evidence, companyId, 'Evidencia');

    const isOwner = evidence.userId === userId;
    const isResponsible = evidence.activity.responsableId === userId;
    const canReview =
      Boolean(requester?.isSuperAdmin) ||
      this.hasPermission(requester, PERMISSIONS.CONSOLE_ADMIN) ||
      this.hasPermission(requester, PERMISSIONS.EVIDENCES_REVIEW);
    if (!isOwner && !isResponsible && !canReview) {
      throw new ForbiddenException('No tienes acceso a las evidencias de esta actividad');
    }

    const coreKind = evidence.activity.coreKind;
    return {
      ...evidence,
      assigneeIndicaciones: evidence.activity.assignees[0]?.indicaciones ?? null,
      stepsForKind: evidenceStepsForKind(coreKind),
      progressPct: evidenceProgressPct(evidence.status, coreKind),
    };
  }

  /**
   * Historial propio para la vista "Mis Evidencias"
   */
  async getOwnEvidenceHistory(userId: number) {
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }

    const evidences = await this.prisma.activityEvidence.findMany({
      where: {
        activity: {
          responsableId: userId,
        },
      },
      include: {
        activity: {
          include: {
            creador: {
              select: { nombre: true },
            },
            responsable: {
              select: { nombre: true },
            },
          },
        },
        reviewedBy: {
          select: { nombre: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return evidences.map((evidence) => this.mapEvidenceHistoryRow(evidence));
  }

  async getReviewEvidenceHistory(currentUser: {
    id: number;
    departmentId: number;
    permissions?: string[];
    isSuperAdmin?: boolean;
  }) {
    if (!currentUser?.id) {
      throw new BadRequestException('Usuario no autenticado');
    }

    const responsibleIds = await this.getAccessibleResponsibleIds(currentUser);

    const evidences = await this.prisma.activityEvidence.findMany({
      where: {
        activity: {
          responsableId: { in: responsibleIds },
        },
      },
      include: {
        activity: {
          include: {
            creador: {
              select: { nombre: true },
            },
            responsable: {
              select: { nombre: true },
            },
          },
        },
        reviewedBy: {
          select: { nombre: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return evidences.map((evidence) => this.mapEvidenceHistoryRow(evidence));
  }

  async generateOwnTicketReport(activityId: number, userId: number) {
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }

    const evidence = await this.prisma.activityEvidence.findFirst({
      where: { activityId, userId },
      include: {
        activity: {
          select: {
            responsableId: true,
          },
        },
      },
    });

    if (!evidence) {
      throw new NotFoundException('No se encontró evidencia para esta actividad');
    }

    if (evidence.userId !== userId && evidence.activity.responsableId !== userId) {
      throw new ForbiddenException('No tienes permisos para descargar este reporte');
    }

    const result = await this.activitiesService.generateTicketReport(activityId);
    if (!result) {
      throw new NotFoundException('No se pudo generar el reporte del ticket');
    }

    return result;
  }

  async generateOwnHistorySummaryReport(userId: number, from?: string, to?: string) {
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }

    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;

    if (start && Number.isNaN(start.getTime())) {
      throw new BadRequestException('Fecha inicial inválida');
    }
    if (end && Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fecha final inválida');
    }

    const evidences = await this.prisma.activityEvidence.findMany({
      where: {
        activity: {
          responsableId: userId,
        },
        ...(start || end
          ? {
              updatedAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
      include: {
        activity: {
          select: {
            anNumber: true,
            titulo: true,
            branchName: true,
            branchCity: true,
            branchState: true,
            estatus: true,
            prioridad: true,
            responsable: {
              select: {
                nombre: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const formatDateTime = (value?: Date | null) => {
      if (!value) return '-';
      return value.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const truncate = (text: string, max = 40) => {
      if (!text) return '-';
      return text.length > max ? `${text.slice(0, max - 1)}...` : text;
    };

    const normalizeUploadUrl = (value?: string | null) => {
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

      return normalized ? `/uploads/${normalized}`.replace(/\/uploads\/+/, '/uploads/') : '';
    };

    const resolveUploadPath = (fileUrl?: string | null) => {
      if (!fileUrl) return null;
      const raw = fileUrl.trim();
      if (!raw) return null;

      const sanitized = raw.replace(/\\+/g, '/').replace(/[?#].*$/, '').trim();
      if (!sanitized) return null;

      const resolveExisting = (relativePath: string) => {
        const cleaned = relativePath.replace(/^\/+/, '');
        const candidates = [
          path.resolve(process.cwd(), 'uploads', cleaned),
          path.resolve(process.cwd(), '..', 'uploads', cleaned),
          path.resolve(process.cwd(), '..', '..', 'uploads', cleaned),
          path.resolve(process.cwd(), 'apps', 'api', 'uploads', cleaned),
          path.resolve(__dirname, '..', '..', '..', 'uploads', cleaned),
          path.resolve(__dirname, '..', '..', '..', '..', 'uploads', cleaned),
        ];

        for (const candidate of candidates) {
          try {
            if (fs.existsSync(candidate)) return candidate;
          } catch {
            // Continue trying next candidate.
          }
        }
        return null;
      };

      if (sanitized.startsWith('/uploads/')) return resolveExisting(sanitized.replace(/^\/uploads\//, ''));
      if (sanitized.startsWith('/activities/')) return resolveExisting(sanitized.replace(/^\//, ''));
      if (sanitized.startsWith('activities/')) return resolveExisting(sanitized);
      if (sanitized.startsWith('/api/uploads/')) return resolveExisting(sanitized.replace(/^\/api\/uploads\//, ''));

      if (/^https?:\/\//i.test(sanitized)) {
        try {
          const parsed = new URL(sanitized);
          if (parsed.pathname.startsWith('/uploads/')) return resolveExisting(parsed.pathname.replace(/^\/uploads\//, ''));
          if (parsed.pathname.startsWith('/activities/')) return resolveExisting(parsed.pathname.replace(/^\//, ''));
        } catch {
          return null;
        }
      }

      return null;
    };

    const approvedCount = evidences.filter((item) => item.reviewStatus === 'APPROVED').length;
    const rejectedCount = evidences.filter((item) => item.reviewStatus === 'REJECTED').length;
    const pendingCount = evidences.length - approvedCount - rejectedCount;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 32 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error) => reject(error));

      const colors = {
        navy: '#0B1F3A',
        blue: '#1F6BBA',
        lightBlue: '#E3F2FD',
        softGray: '#F5F7FB',
        text: '#1F2A37',
        muted: '#5B6B7A',
        line: '#D9E2EC',
      };

      const loadLogo = (relativePath: string) => {
        try {
          if (fs.existsSync(relativePath)) {
            return fs.readFileSync(relativePath);
          }
        } catch {
          return null;
        }
        return null;
      };

      const left = doc.page.margins.left;
      const top = 140;
      const pageRight = doc.page.width - doc.page.margins.right;
      const pageWidth = doc.page.width;
      const rowHeight = 22;
      const col = {
        fecha: left,
        ticket: left + 104,
        actividad: left + 184,
        estatus: left + 372,
        archivos: left + 462,
      };

      const nexaraLogo = loadLogo(path.resolve(process.cwd(), '../web/public/logo-nexara.png'))
        || loadLogo(path.resolve(process.cwd(), '../../apps/web/public/logo-nexara.png'));

      const drawCorporateHeader = () => {
        doc.save();
        doc.rect(0, 0, pageWidth, 120).fill(colors.lightBlue);
        doc.rect(0, 0, pageWidth, 6).fill(colors.blue);
        doc.restore();

        const logoBox = { x: left, y: 22, w: 120, h: 64 };
        if (nexaraLogo) {
          doc.image(nexaraLogo, logoBox.x, logoBox.y, { fit: [logoBox.w, logoBox.h] });
        }

        const titleX = left + logoBox.w + 12;
        const rightWidth = 220;
        const infoX = pageRight - rightWidth;
        const titleWidth = Math.max(180, infoX - titleX - 12);

        doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(20).text('Reporte de Evidencias', titleX, 30, {
          width: titleWidth,
        });
        doc.fontSize(10).font('Helvetica').fillColor(colors.muted).text('Resumen ejecutivo de actividad', titleX, 56, {
          width: titleWidth,
        });

        doc.fillColor(colors.text).font('Helvetica').fontSize(9);
        doc.text(`Generado: ${formatDateTime(new Date())}`, infoX, 24, { width: rightWidth, align: 'right' });
        doc.text(`Rango: ${from || 'inicio'} a ${to || 'hoy'}`, infoX, 36, { width: rightWidth, align: 'right' });
        doc.text(`Tickets: ${evidences.length}`, infoX, 48, { width: rightWidth, align: 'right' });
        doc.text(`Aprobadas: ${approvedCount} · Rechazadas: ${rejectedCount} · Pendientes: ${pendingCount}`, infoX, 60, {
          width: rightWidth,
          align: 'right',
        });
      };

      const drawSectionTitle = (label: string) => {
        doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(12).text(label, left, doc.y);
        doc.moveDown(0.2);
      };

      const drawTableHeader = (y: number) => {
        doc.save();
        doc.rect(left, y, pageRight - left, rowHeight).fill(colors.navy);
        doc.restore();

        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
        doc.text('Fecha', col.fecha + 6, y + 7, { width: 92 });
        doc.text('Ticket', col.ticket + 6, y + 7, { width: 72 });
        doc.text('Actividad', col.actividad + 6, y + 7, { width: 180 });
        doc.text('Estatus', col.estatus + 6, y + 7, { width: 82 });
        doc.text('Archivos', col.archivos + 6, y + 7, { width: 64, align: 'center' });
      };

      const drawRow = (y: number, values: { fecha: string; ticket: string; actividad: string; estatus: string; archivos: string }, index: number) => {
        if (index % 2 === 1) {
          doc.save();
          doc.rect(left, y, pageRight - left, rowHeight).fill(colors.softGray);
          doc.restore();
        }

        doc.save();
        doc.rect(left, y, pageRight - left, rowHeight).stroke(colors.line);
        [col.ticket, col.actividad, col.estatus, col.archivos].forEach((x) => {
          doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke(colors.line);
        });
        doc.restore();

        doc.fillColor(colors.text).font('Helvetica').fontSize(8.8);
        doc.text(values.fecha, col.fecha + 5, y + 6, { width: 94 });
        doc.text(values.ticket, col.ticket + 5, y + 6, { width: 72 });
        doc.text(values.actividad, col.actividad + 5, y + 6, { width: 182 });
        doc.text(values.estatus, col.estatus + 5, y + 6, { width: 84 });
        doc.text(values.archivos, col.archivos + 5, y + 6, { width: 64, align: 'center' });
      };

      drawCorporateHeader();
      doc.y = top;

      drawSectionTitle('Resumen');
      const summaryY = doc.y;
      const summaryWidth = pageRight - left;
      const summaryPadding = 12;
      doc.save();
      doc.roundedRect(left, summaryY, summaryWidth, 70, 8).fill(colors.softGray);
      doc.restore();

      const summaryRows: Array<[string, string]> = [
        ['Tickets totales', String(evidences.length)],
        ['Aprobadas / Rechazadas', `${approvedCount} / ${rejectedCount}`],
        ['Pendientes', String(pendingCount)],
      ];

      let summaryCursorY = summaryY + summaryPadding;
      summaryRows.forEach(([label, value]) => {
        doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text(label, left + summaryPadding, summaryCursorY, {
          width: summaryWidth - summaryPadding * 2,
        });
        doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(11).text(value, left + summaryPadding, summaryCursorY, {
          width: summaryWidth - summaryPadding * 2,
          align: 'right',
        });
        summaryCursorY += 18;
      });

      doc.y = summaryY + 82;
      drawSectionTitle('Listado de tickets');

      let y = doc.y;
      drawTableHeader(y);
      y += rowHeight;

      evidences.forEach((evidence, evidenceIndex) => {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawCorporateHeader();
          doc.y = top;
          drawSectionTitle('Listado de tickets');
          y = doc.y;
          drawTableHeader(y);
          y += rowHeight;
        }

        const fileCount =
          (evidence.entryPhotoUrl ? 1 : 0) +
          (evidence.exitPhotoUrl ? 1 : 0) +
          (evidence.serviceSheetPdfUrl ? 1 : 0) +
          (evidence.evidencePhotos?.length || 0);

        drawRow(y, {
          fecha: formatDateTime(evidence.completedAt || evidence.updatedAt || evidence.createdAt),
          ticket: evidence.activity?.anNumber || `#${evidence.activityId}`,
          actividad: truncate(evidence.activity?.titulo || evidence.activity?.branchName || 'Sin título', 44),
          estatus: this.mapReviewStatus(evidence.reviewStatus),
          archivos: String(fileCount),
        }, evidenceIndex);

        y += rowHeight;
      });

      if (evidences.length > 0) {
        evidences.forEach((evidence, evidenceIndex) => {
          doc.addPage();
          drawCorporateHeader();
          doc.y = top;
          const pageLeft = doc.page.margins.left;
          const pageRightX = doc.page.width - doc.page.margins.right;

          const mediaItems: Array<{ label: string; type: 'image' | 'pdf'; url: string }> = [
            ...(evidence.entryPhotoUrl ? [{ label: 'Entrada', type: 'image' as const, url: normalizeUploadUrl(evidence.entryPhotoUrl) }] : []),
            ...((evidence.evidencePhotos || []).map((url, idx) => ({
              label: `Evidencia ${idx + 1}`,
              type: 'image' as const,
              url: normalizeUploadUrl(url),
            }))),
            ...(evidence.serviceSheetPdfUrl ? [{ label: 'Hoja de servicio', type: 'pdf' as const, url: normalizeUploadUrl(evidence.serviceSheetPdfUrl) }] : []),
            ...(evidence.exitPhotoUrl ? [{ label: 'Salida', type: 'image' as const, url: normalizeUploadUrl(evidence.exitPhotoUrl) }] : []),
          ].filter((item) => Boolean(item.url));

          drawSectionTitle('Detalle de evidencias');

          doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(15)
            .text(`Ticket ${evidence.activity?.anNumber || `#${evidence.activityId}`}`, pageLeft, doc.y);

          doc.fillColor(colors.muted).font('Helvetica').fontSize(9)
            .text(`Detalle ${evidenceIndex + 1} de ${evidences.length}  •  Fecha: ${formatDateTime(evidence.completedAt || evidence.updatedAt || evidence.createdAt)}`)
            .text(`Actividad: ${evidence.activity?.titulo || '-'}  •  Responsable: ${evidence.activity?.responsable?.nombre || '-'}`)
            .text(`Sucursal: ${[evidence.activity?.branchName, evidence.activity?.branchCity, evidence.activity?.branchState].filter(Boolean).join(', ') || '-'}`)
            .text(`Estatus: ${this.mapReviewStatus(evidence.reviewStatus)}  •  Prioridad: ${evidence.activity?.prioridad || '-'}`);

          doc.moveDown(0.8);
          doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(11).text('Evidencias visuales', pageLeft);

          let mediaY = doc.y + 8;
          const cardGap = 12;
          const cardWidth = Math.floor((pageRightX - pageLeft - cardGap) / 2);
          const cardHeight = 148;
          let colIndex = 0;

          mediaItems.forEach((media) => {
            if (mediaY + cardHeight + 26 > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
              drawCorporateHeader();
              doc.y = top;
              drawSectionTitle('Detalle de evidencias');
              doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(15)
                .text(`Ticket ${evidence.activity?.anNumber || `#${evidence.activityId}`}`, pageLeft, doc.y);
              doc.fillColor(colors.muted).font('Helvetica').fontSize(9)
                .text(`Detalle ${evidenceIndex + 1} de ${evidences.length}  •  Fecha: ${formatDateTime(evidence.completedAt || evidence.updatedAt || evidence.createdAt)}`)
                .text(`Actividad: ${evidence.activity?.titulo || '-'}  •  Responsable: ${evidence.activity?.responsable?.nombre || '-'}`)
                .text(`Sucursal: ${[evidence.activity?.branchName, evidence.activity?.branchCity, evidence.activity?.branchState].filter(Boolean).join(', ') || '-'}`)
                .text(`Estatus: ${this.mapReviewStatus(evidence.reviewStatus)}  •  Prioridad: ${evidence.activity?.prioridad || '-'}`);
              doc.moveDown(0.8);
              doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(11).text('Evidencias visuales', pageLeft);
              mediaY = doc.y + 8;
              colIndex = 0;
            }

            const x = colIndex === 0 ? pageLeft : pageLeft + cardWidth + cardGap;
            const mediaPath = resolveUploadPath(media.url);
            const isPdf = media.type === 'pdf' || media.url.toLowerCase().endsWith('.pdf');

            doc.save();
            doc.rect(x, mediaY, cardWidth, cardHeight).fill('#f1f5f9');
            doc.restore();

            if (mediaPath && !isPdf) {
              try {
                doc.image(mediaPath, x + 4, mediaY + 4, {
                  fit: [cardWidth - 8, cardHeight - 8],
                  align: 'center',
                  valign: 'center',
                });
              } catch {
                doc.fillColor(colors.muted).fontSize(9).text('No se pudo cargar', x, mediaY + cardHeight / 2 - 6, {
                  width: cardWidth,
                  align: 'center',
                });
              }
            } else {
              doc.fillColor(colors.muted).fontSize(9).text(isPdf ? 'PDF adjunto' : 'Sin evidencia', x, mediaY + cardHeight / 2 - 6, {
                width: cardWidth,
                align: 'center',
              });
            }

            doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(8.5)
              .text(media.label, x, mediaY + cardHeight + 6, { width: cardWidth });

            if (colIndex === 0) {
              colIndex = 1;
            } else {
              colIndex = 0;
              mediaY += cardHeight + 26;
            }
          });

          if (mediaItems.length === 0) {
            doc.fillColor(colors.muted).font('Helvetica').fontSize(10)
              .text('Este ticket no contiene archivos de evidencia en el rango seleccionado.', pageLeft, doc.y + 12);
          }
        });
      }

      if (evidences.length === 0) {
        doc.moveDown(2);
        doc.fillColor(colors.muted).font('Helvetica').fontSize(11).text('No se encontraron tickets en el rango seleccionado.');
      }

      doc.end();
    });
  }

  /**
   * Actualizar foto de evidencia (remover y reemplazar)
   */
  async updateEvidencePhoto(
    activityId: number,
    userId: number,
    index: number,
    newPhotoUrl: string,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para actualizar');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    const updatedPhotos = [...evidence.evidencePhotos];
    updatedPhotos[index] = newPhotoUrl;

    return this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }

  /**
   * Remover foto de evidencia
   */
  async removeEvidencePhoto(
    activityId: number,
    userId: number,
    index: number,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para remover');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    const activity = await this.loadActivityForTenant(activityId, companyId);
    const minPhotos =
      activity?.workType === 'PREVENTIVE_INVENTORY'
        ? 1
        : clampEvidencePhotoRequired(activity.evidencePhotoRequired);
    if (evidence.evidencePhotos.length <= minPhotos) {
      throw new BadRequestException(`Mínimo ${minPhotos} foto${minPhotos > 1 ? 's' : ''} de evidencia son requeridas`);
    }

    const updatedPhotos = evidence.evidencePhotos.filter((_: string, i: number) => i !== index);

    return this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }

  /**
   * Aprobar evidencias (Admin)
   */
  async approveEvidence(
    activityId: number,
    userId: number,
    reviewerId: number,
    notes?: string,
    companyId?: number | null,
    /** Eficiencia de quien la realizó (1–5). */
    score?: number | null,
  ) {
    // `isSuperAdmin` NO es columna de `User` —se calcula en el JWT
    // (`rbac.guard.ts`) o desde el correo (`platform-accounts.ts`)—, así que
    // pedirlo aquí no compilaba. El objeto solo se usa para comprobar que el
    // revisor existe: quién puede revisar ya lo exige `EVIDENCES_REVIEW` en el
    // controlador. Se selecciona solo lo que se lee.
    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { id: true },
    });
    // Bloquea un `reviewerId` inventado cuando se llama desde dentro del servidor.
    if (!reviewer) {
      throw new ForbiddenException('Revisor inválido');
    }

    const evidence = await this.prisma.activityEvidence.findFirst({
      where: { activityId, userId, ...companyWhere(companyId ?? null) },
    });
    if (!evidence) {
      throw new NotFoundException('Evidencias no encontradas');
    }

    if (evidence.status !== 'COMPLETED') {
      throw new BadRequestException('Las evidencias deben estar completadas antes de aprobar');
    }

    if (evidence.reviewStatus === 'APPROVED') {
      throw new BadRequestException('Esta evidencia ya fue aprobada');
    }

    await this.recordReview(evidence, reviewerId, 'APROBADA', null, notes, score);
    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        reviewStatus: 'APPROVED',
        reviewNotes: notes || null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectedStep: null,
        rejectedSteps: Prisma.DbNull,
        ...(score != null ? { eficienciaScore: score } : {}),
      },
    });

    // 100 % finalizada solo cuando la evidencia de todo el equipo está aprobada.
    const finalizada = await this.finalizeIfAllApproved(activityId);

    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { responsableId: true, titulo: true },
      });
      const reviewerUser = await this.prisma.user.findUnique({
        where: { id: reviewerId },
        select: { nombre: true },
      });
      if (activity && reviewerUser?.nombre) {
        await this.notificationHierarchy.notifyEvidenceReview(
          activity.responsableId,
          activityId,
          activity.titulo || '',
          'approved',
          reviewerUser.nombre,
          notes,
          [userId],
          reviewerId,
          { score, closed: finalizada },
        );
      }
    } catch {
      /* seguir */
    }

    return updated;
  }

  /**
   * Rechazar evidencias (Admin) - seleccionar paso(s) a corregir o reiniciar flujo
   */
  async rejectEvidence(
    activityId: number,
    userId: number,
    reviewerId: number,
    notes: string,
    options: {
      rejectedStep?: string;
      rejectedSteps?: string[];
      resetFullFlow?: boolean;
    },
    companyId?: number | null,
    /** Eficiencia de quien la realizó (1–5). */
    score?: number | null,
  ) {
    const activity = await this.loadActivityForTenant(activityId, companyId);
    // Solo los pasos que aplican a este tipo de actividad (una tarea no lleva hoja PDF).
    const kindSteps = EVIDENCE_STEP_ORDER.filter((s) =>
      (evidenceStepsForKind(activity.coreKind) as string[]).includes(s),
    );

    const evidence = await this.prisma.activityEvidence.findFirst({
      where: { activityId, userId, ...companyWhere(companyId ?? null) },
    });

    if (!evidence || evidence.status !== 'COMPLETED') {
      throw new BadRequestException('Las evidencias deben estar completadas antes de rechazar');
    }

    const validSteps = kindSteps.length ? kindSteps : [...EVIDENCE_STEP_ORDER];

    if (options.resetFullFlow) {
      // Rehacer desde cero: se vacía su evidencia (la copia queda en el registro de revisiones).
      const allSteps = [...validSteps];
      await this.recordReview(evidence, reviewerId, 'DEVUELTA_TODO', allSteps, notes, score);
      const updated = await this.prisma.activityEvidence.update({
        where: { id: evidence.id },
        data: {
          ...this.clearEvidenceData(),
          evidencePhotosGeo: Prisma.DbNull,
          reviewStatus: 'REJECTED',
          rejectedStep: allSteps[0],
          rejectedSteps: allSteps,
          reviewNotes: notes,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          status: allSteps[0],
          ...(score != null ? { eficienciaScore: score } : {}),
        },
      });

      await this.prisma.activity.update({
        where: { id: activityId },
        data: { estatus: 'En Proceso', fechaFinalizacion: null },
      });

      await this.notifyReject(activityId, reviewerId, notes, userId, { full: true, steps: allSteps, score });
      return updated;
    }

    const steps = options.rejectedSteps?.length
      ? options.rejectedSteps
      : options.rejectedStep
        ? [options.rejectedStep]
        : [];

    if (steps.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos un paso a rechazar');
    }

    for (const step of steps) {
      if (!validSteps.includes(step as ActivityEvidenceStatus)) {
        throw new BadRequestException('Paso inválido para rechazo');
      }
    }

    const firstStep = this.firstRejectedStep(steps);

    await this.recordReview(evidence, reviewerId, 'DEVUELTA_PASOS', steps, notes, score);
    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: {
        reviewStatus: 'REJECTED',
        rejectedStep: firstStep,
        rejectedSteps: steps,
        reviewNotes: notes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        status: firstStep,
        ...(score != null ? { eficienciaScore: score } : {}),
      },
    });

    // Vuelve a En Proceso (no «Rechazada», que cuenta como cerrada): corrige solo esos pasos.
    await this.prisma.activity.update({
      where: { id: activityId },
      data: { estatus: 'En Proceso', fechaFinalizacion: null },
    });

    await this.notifyReject(activityId, reviewerId, notes, userId, { steps, score });
    return updated;
  }

  private async notifyReject(
    activityId: number,
    reviewerId: number,
    notes: string,
    ownerId?: number,
    extra: { steps?: string[]; full?: boolean; score?: number | null } = {},
  ) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { responsableId: true, titulo: true },
      });
      const reviewer = await this.prisma.user.findUnique({
        where: { id: reviewerId },
        select: { nombre: true },
      });
      if (activity && reviewer?.nombre) {
        await this.notificationHierarchy.notifyEvidenceReview(
          activity.responsableId,
          activityId,
          activity.titulo || '',
          'rejected',
          reviewer.nombre,
          notes,
          ownerId ? [ownerId] : [],
          reviewerId,
          extra,
        );
      }
    } catch {
      /* seguir */
    }
  }

  /** Registro de la revisión con copia de lo revisado: sobrevive aunque la persona rehaga todo. */
  private async recordReview(
    evidence: ActivityEvidence,
    reviewerId: number,
    decision: 'APROBADA' | 'DEVUELTA_PASOS' | 'DEVUELTA_TODO',
    steps: string[] | null,
    notes: string | undefined,
    score: number | null | undefined,
  ) {
    const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    await this.prisma.activityEvidenceReview.create({
      data: {
        activityId: evidence.activityId,
        companyId: evidence.companyId,
        evidenceUserId: evidence.userId,
        reviewerId,
        decision,
        steps: steps ?? Prisma.DbNull,
        notes: (notes || '').trim() || 'Sin observaciones',
        score: score ?? null,
        snapshot: {
          entryPhotoUrl: evidence.entryPhotoUrl,
          entryLatitude: num(evidence.entryLatitude),
          entryLongitude: num(evidence.entryLongitude),
          entryPhotoUploadedAt: iso(evidence.entryPhotoUploadedAt),
          evidencePhotos: evidence.evidencePhotos,
          evidencePhotosGeo: (evidence.evidencePhotosGeo as Prisma.InputJsonValue) ?? null,
          evidencePhotosUploadedAt: iso(evidence.evidencePhotosUploadedAt),
          serviceSheetPdfUrl: evidence.serviceSheetPdfUrl,
          serviceSheetUploadedAt: iso(evidence.serviceSheetUploadedAt),
          serviceSheetData: (evidence.serviceSheetData as Prisma.InputJsonValue) ?? null,
          serviceSheetCompletedAt: iso(evidence.serviceSheetCompletedAt),
          exitPhotoUrl: evidence.exitPhotoUrl,
          exitLatitude: num(evidence.exitLatitude),
          exitLongitude: num(evidence.exitLongitude),
          exitPhotoUploadedAt: iso(evidence.exitPhotoUploadedAt),
          completedAt: iso(evidence.completedAt),
        },
      },
    });
  }

  /**
   * Una actividad queda 100 % finalizada cuando la evidencia de cada quien la ejecutó está aprobada.
   * Si falta alguien queda Por Validar (todos terminaron) o En Proceso (alguien sigue trabajando).
   * Guarda la eficiencia promedio del equipo (1–5 → 0–100) en la actividad.
   */
  private async finalizeIfAllApproved(activityId: number): Promise<boolean> {
    const required = await this.requiredExecutorIds(activityId);
    if (required.length === 0) return false;
    const rows = await this.prisma.activityEvidence.findMany({
      where: { activityId, userId: { in: required } },
      select: { status: true, reviewStatus: true, eficienciaScore: true },
    });
    const aprobadas = rows.filter((r) => r.reviewStatus === 'APPROVED');
    if (aprobadas.length < required.length) {
      const terminaron = rows.filter((r) => r.status === 'COMPLETED').length >= required.length;
      await this.prisma.activity.update({
        where: { id: activityId },
        data: { estatus: terminaron ? 'Por Validar' : 'En Proceso' },
      });
      return false;
    }
    const scores = aprobadas
      .map((r) => r.eficienciaScore)
      .filter((s): s is number => typeof s === 'number');
    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        estatus: 'Finalizada',
        fechaFinalizacion: new Date(),
        ...(scores.length
          ? { eficienciaScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20) }
          : {}),
      },
    });
    return true;
  }

  /**
   * Revisión desde la cadena de mando (Christian, responsable, encargados, jefe directo).
   * Quién puede revisar a quién lo decide MyActivitiesService; observaciones y calificación son obligatorias.
   */
  async reviewEvidence(params: {
    activityId: number;
    evidenceUserId: number;
    reviewerId: number;
    decision: 'aprobar' | 'devolver';
    pasos?: string[];
    todo?: boolean;
    observaciones: string;
    calificacion: number;
    companyId?: number | null;
  }) {
    const { activityId, evidenceUserId, reviewerId, observaciones, calificacion, companyId } = params;
    if (params.decision === 'aprobar') {
      return this.approveEvidence(activityId, evidenceUserId, reviewerId, observaciones, companyId, calificacion);
    }
    return this.rejectEvidence(
      activityId,
      evidenceUserId,
      reviewerId,
      observaciones,
      { rejectedSteps: params.todo ? undefined : params.pasos, resetFullFlow: Boolean(params.todo) },
      companyId,
      calificacion,
    );
  }

  /**
   * Reenviar paso específico (Usuario corrige)
   */
  async resubmitStep(
    activityId: number,
    userId: number,
    step: string,
    data: any,
    companyId?: number | null,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId, userId, companyId);

    if (evidence.reviewStatus !== 'REJECTED') {
      throw new BadRequestException('Solo puedes reenviar si fue rechazada');
    }

    const rejectedList = this.parseRejectedSteps(evidence);
    if (!rejectedList.includes(step)) {
      throw new BadRequestException(
        `Debes corregir uno de los pasos rechazados: ${rejectedList.join(', ')}`,
      );
    }

    const remainingAfter = rejectedList.filter((s) => s !== step);
    const transition = this.nextAfterCorrection(step, remainingAfter);

    let updateData: any = {
      correctionSubmittedAt: new Date(),
      ...transition,
    };

    switch (step) {
      case 'ENTRY_PHOTO':
        if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
          throw new BadRequestException('La ubicación GPS es obligatoria para la foto de entrada');
        }
        updateData = {
          ...updateData,
          entryPhotoUrl: data.photoUrl,
          entryLatitude: data.latitude,
          entryLongitude: data.longitude,
          entryPhotoUploadedAt: new Date(),
        };
        break;

      case 'EVIDENCE_PHOTOS': {
        const activity = await this.loadActivityForTenant(activityId, companyId);
        const isInventoryFlow = activity?.workType === 'PREVENTIVE_INVENTORY';
        const required = clampEvidencePhotoRequired(activity.evidencePhotoRequired);

        if (isInventoryFlow) {
          if (!Array.isArray(data.photoUrls) || data.photoUrls.length < 1) {
            throw new BadRequestException('Requiere al menos 1 evidencia visual');
          }
        } else if (!Array.isArray(data.photoUrls) || data.photoUrls.length < required) {
          throw new BadRequestException(`Se requieren al menos ${required} fotos de evidencia`);
        }
        {
          const geo = sanitizePhotoGeo(data.photoGeo, data.photoUrls.length);
          updateData = {
            ...updateData,
            evidencePhotos: data.photoUrls,
            evidencePhotosUploadedAt: new Date(),
            ...(geo ? { evidencePhotosGeo: geo } : {}),
          };
        }
        break;
      }

      case 'SERVICE_SHEET_PDF':
        if (!isPdfUrl(String(data.pdfUrl || ''))) {
          throw new BadRequestException('La hoja de servicio debe ser un PDF');
        }
        updateData = {
          ...updateData,
          serviceSheetPdfUrl: data.pdfUrl,
          serviceSheetUploadedAt: new Date(),
        };
        break;

      case 'SERVICE_SHEET_DATA':
        updateData = {
          ...updateData,
          serviceSheetData: data.formData,
          serviceSheetCompletedAt: new Date(),
        };
        break;

      case 'EXIT_PHOTO':
        if (
          !Number.isFinite(data.latitude) ||
          !Number.isFinite(data.longitude) ||
          (data.latitude === 0 && data.longitude === 0)
        ) {
          throw new BadRequestException('La ubicación GPS es obligatoria para la foto de salida');
        }
        await this.geofence?.validarSalida(activityId, userId, data.latitude, data.longitude);
        updateData = {
          ...updateData,
          exitPhotoUrl: data.photoUrl,
          exitLatitude: data.latitude,
          exitLongitude: data.longitude,
          exitPhotoUploadedAt: new Date(),
        };
        if (transition.status === 'COMPLETED') {
          updateData.completedAt = new Date();
        }
        break;

      default:
        throw new BadRequestException('Paso inválido');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { id: evidence.id },
      data: updateData,
    });

    if (transition.status === 'COMPLETED') {
      await this.maybeFinalizeActivity(activityId, companyId, updated.userId);
      // Corrigió todo lo devuelto: vuelve a «Por revisar» y sus superiores pueden aprobar o devolver otra vez.
      void this.notifyEvidenceReadyForReview(activityId, updated.userId, true);
    } else {
      await this.prisma.activity.update({
        where: { id: activityId },
        data: {
          estatus: 'En Proceso',
        },
      });
    }

    return updated;
  }
}
