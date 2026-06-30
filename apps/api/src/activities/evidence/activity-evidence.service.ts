import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { saveBase64Photo } from '../../common/file-upload.util';
import { ActivitiesService } from '../activities.service.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

type ActivityEvidenceStatus = 'ENTRY_PHOTO' | 'EVIDENCE_PHOTOS' | 'SERVICE_SHEET_PDF' | 'SERVICE_SHEET_DATA' | 'EXIT_PHOTO' | 'COMPLETED';

const EVIDENCE_STEP_ORDER: ActivityEvidenceStatus[] = [
  'ENTRY_PHOTO',
  'EVIDENCE_PHOTOS',
  'SERVICE_SHEET_PDF',
  'SERVICE_SHEET_DATA',
  'EXIT_PHOTO',
];

@Injectable()
export class ActivityEvidenceService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  private async notifyEvidenceReadyForReview(activityId: number) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        include: { responsable: { select: { id: true, nombre: true } } },
      });
      if (!activity?.responsable) return;
      await this.notificationHierarchy.notifyEvidenceSubmitted(
        activity.responsableId,
        activityId,
        activity.titulo || '',
        activity.responsable.nombre || 'Usuario',
        activity.anNumber,
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
      serviceSheetData: null,
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

  /**
   * Obtener o crear el registro de evidencias de una actividad
   */
  async getOrCreateActivityEvidence(activityId: number) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, estatus: true },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    if (activity.estatus === 'Aprobada') {
      throw new ForbiddenException('La actividad ya fue aprobada y no permite nuevas evidencias');
    }

    let evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
    });

    if (evidence?.reviewStatus === 'APPROVED') {
      throw new ForbiddenException('La evidencia ya fue aprobada y no puede modificarse');
    }

    if (evidence?.status === 'COMPLETED' && evidence?.reviewStatus !== 'REJECTED') {
      throw new ForbiddenException('La evidencia está en revisión y no puede modificarse');
    }

    if (!evidence) {
      evidence = await this.prisma.activityEvidence.create({
        data: {
          activityId,
          status: 'ENTRY_PHOTO',
        },
      });
    }

    return evidence;
  }

  /**
   * Guardar foto de entrada
   */
  async saveEntryPhoto(
    activityId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'ENTRY_PHOTO') {
      throw new BadRequestException('Ya se ha guardado la foto de entrada');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        entryPhotoUrl: photoUrl,
        entryLatitude: latitude,
        entryLongitude: longitude,
        entryPhotoUploadedAt: new Date(),
        status: 'EVIDENCE_PHOTOS',
      },
    });
  }

  /**
   * Guardar fotos de evidencia (4-8 fotos)
   */
  async saveEvidencePhotos(activityId: number, photoUrls: string[]) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { workType: true },
    });
    const isInventoryFlow = activity?.workType === 'PREVENTIVE_INVENTORY';

    if (evidence.status !== 'EVIDENCE_PHOTOS') {
      throw new BadRequestException('No estás en el paso correcto para guardar evidencias');
    }

    if (isInventoryFlow) {
      if (photoUrls.length < 1) {
        throw new BadRequestException('Para mantenimiento e inventario se requiere al menos 1 evidencia visual');
      }
    } else {
      if (photoUrls.length < 4) {
        throw new BadRequestException('Mínimo 4 fotos de evidencia son requeridas');
      }

      if (photoUrls.length > 8) {
        throw new BadRequestException('Máximo 8 fotos de evidencia permitidas');
      }
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: photoUrls,
        evidencePhotosUploadedAt: new Date(),
        status: 'SERVICE_SHEET_PDF',
      },
    });
  }

  /**
   * Guardar hoja de servicio PDF
   */
  async saveServiceSheetPdf(activityId: number, pdfUrl: string) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'SERVICE_SHEET_PDF') {
      throw new BadRequestException('No estás en el paso correcto para guardar la hoja de servicio');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        serviceSheetPdfUrl: pdfUrl,
        serviceSheetUploadedAt: new Date(),
        status: 'SERVICE_SHEET_DATA',
      },
    });
  }

  /**
   * Completar plantilla de hoja de servicio interna
   */
  async completeServiceSheetForm(activityId: number, data: any) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'SERVICE_SHEET_DATA') {
      throw new BadRequestException('No estás en el paso correcto para completar la plantilla');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        serviceSheetData: data,
        serviceSheetCompletedAt: new Date(),
        status: 'EXIT_PHOTO',
      },
    });
  }

  /**
   * Guardar foto de salida
   */
  async saveExitPhoto(
    activityId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'EXIT_PHOTO') {
      throw new BadRequestException('No estás en el paso correcto para guardar la foto de salida');
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('La ubicación GPS es obligatoria para la foto de salida');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        exitPhotoUrl: photoUrl,
        exitLatitude: latitude,
        exitLongitude: longitude,
        exitPhotoUploadedAt: new Date(),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Al completar el flujo, la actividad queda pendiente hasta revisión administrativa
    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        estatus: 'Pendiente',
        fechaFinalizacion: new Date(),
      },
    });

    void this.notifyEvidenceReadyForReview(activityId);

    return updated;
  }

  /**
   * Obtener evidencias de una actividad
   */
  async getActivityEvidence(
    activityId: number,
    requester?: { id: number; permissions?: string[]; isSuperAdmin?: boolean },
  ) {
    const evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
      include: {
        activity: true,
      },
    });

    if (!evidence) {
      throw new NotFoundException('Evidencias no encontradas');
    }

    if (requester?.id) {
      const isResponsible = evidence.activity.responsableId === requester.id;
      const canReview =
        Boolean(requester.isSuperAdmin) ||
        this.hasPermission(requester, PERMISSIONS.CONSOLE_ADMIN) ||
        this.hasPermission(requester, PERMISSIONS.EVIDENCES_REVIEW);
      if (!isResponsible && !canReview) {
        throw new ForbiddenException('No tienes acceso a las evidencias de esta actividad');
      }
    }

    return evidence;
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

    const evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
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

    if (evidence.activity.responsableId !== userId) {
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
  async updateEvidencePhoto(activityId: number, index: number, newPhotoUrl: string) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para actualizar');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    const updatedPhotos = [...evidence.evidencePhotos];
    updatedPhotos[index] = newPhotoUrl;

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }

  /**
   * Remover foto de evidencia
   */
  async removeEvidencePhoto(activityId: number, index: number) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para remover');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { workType: true },
    });
    const minPhotos = activity?.workType === 'PREVENTIVE_INVENTORY' ? 1 : 4;
    if (evidence.evidencePhotos.length <= minPhotos) {
      throw new BadRequestException(`Mínimo ${minPhotos} foto${minPhotos > 1 ? 's' : ''} de evidencia son requeridas`);
    }

    const updatedPhotos = evidence.evidencePhotos.filter((_: string, i: number) => i !== index);

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }

  /**
   * Aprobar evidencias (Admin)
   */
  async approveEvidence(activityId: number, reviewerId: number, notes?: string) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'COMPLETED') {
      throw new BadRequestException('Las evidencias deben estar completadas antes de aprobar');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        reviewStatus: 'APPROVED',
        reviewNotes: notes || null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    // Actualizar estatus de actividad
    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        estatus: 'Aprobada',
      },
    });

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
          'approved',
          reviewer.nombre,
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
    reviewerId: number,
    notes: string,
    options: {
      rejectedStep?: string;
      rejectedSteps?: string[];
      resetFullFlow?: boolean;
    },
  ) {
    const evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
    });

    if (!evidence || evidence.status !== 'COMPLETED') {
      throw new BadRequestException('Las evidencias deben estar completadas antes de rechazar');
    }

    const validSteps = [...EVIDENCE_STEP_ORDER];

    if (options.resetFullFlow) {
      const allSteps = [...EVIDENCE_STEP_ORDER];
      const updated = await this.prisma.activityEvidence.update({
        where: { activityId },
        data: {
          ...this.clearEvidenceData(),
          reviewStatus: 'REJECTED',
          rejectedStep: 'ENTRY_PHOTO',
          rejectedSteps: allSteps,
          reviewNotes: notes,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          status: 'ENTRY_PHOTO',
        },
      });

      await this.prisma.activity.update({
        where: { id: activityId },
        data: { estatus: 'En Proceso' },
      });

      await this.notifyReject(activityId, reviewerId, notes);
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

    const updated = await this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        reviewStatus: 'REJECTED',
        rejectedStep: firstStep,
        rejectedSteps: steps,
        reviewNotes: notes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        status: firstStep,
      },
    });

    await this.prisma.activity.update({
      where: { id: activityId },
      data: { estatus: 'Rechazada' },
    });

    await this.notifyReject(activityId, reviewerId, notes);
    return updated;
  }

  private async notifyReject(activityId: number, reviewerId: number, notes: string) {
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
        );
      }
    } catch {
      /* seguir */
    }
  }

  /**
   * Reenviar paso específico (Usuario corrige)
   */
  async resubmitStep(activityId: number, step: string, data: any) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

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
        const activity = await this.prisma.activity.findUnique({
          where: { id: activityId },
          select: { workType: true },
        });
        const isInventoryFlow = activity?.workType === 'PREVENTIVE_INVENTORY';

        if (isInventoryFlow) {
          if (!Array.isArray(data.photoUrls) || data.photoUrls.length < 1) {
            throw new BadRequestException('Requiere al menos 1 evidencia visual');
          }
        } else if (data.photoUrls.length < 4 || data.photoUrls.length > 8) {
          throw new BadRequestException('Requiere entre 4-8 fotos de evidencia');
        }
        updateData = {
          ...updateData,
          evidencePhotos: data.photoUrls,
          evidencePhotosUploadedAt: new Date(),
        };
        break;
      }

      case 'SERVICE_SHEET_PDF':
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
        if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
          throw new BadRequestException('La ubicación GPS es obligatoria para la foto de salida');
        }
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
      where: { activityId },
      data: updateData,
    });

    const activityStatus =
      transition.status === 'COMPLETED' ? 'Pendiente' : transition.reviewStatus === 'REJECTED' ? 'Rechazada' : 'Pendiente';

    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        estatus: activityStatus,
        ...(transition.status === 'COMPLETED' ? { fechaFinalizacion: new Date() } : {}),
      },
    });

    if (transition.status === 'COMPLETED') {
      void this.notifyEvidenceReadyForReview(activityId);
    }

    return updated;
  }
}
