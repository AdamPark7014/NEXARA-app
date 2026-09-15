import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityTeamService, type AssigneeRole } from '../activities/activity-team.service.js';
import { ActivityEvidenceService } from '../activities/evidence/activity-evidence.service.js';
import { evidenceProgressPct } from '../activities/evidence/evidence-flow.helpers.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CEO_EMAIL = 'gerencia@nexara.com.mx';

/** Dos personas sumadas con menos de 5 s de diferencia están en el mismo nivel de la cadena. */
const MISMO_MOMENTO_MS = 5_000;

/** Encargados de área: se auto-asignan y ordenan su cola (con justificación). */
export const AREA_MANAGER_EMAILS = new Set<string>([
  'developer@nexara.com.mx',
  'operaciones@nexara.com.mx',
  'direccion.operaciones@nexara.com.mx',
  'jose.ramirez@nexara.com.mx',
  'infraestructura@nexara.com.mx',
  'daniela.hernandez@nexara.com.mx',
  'soluciones@nexara.com.mx',
]);

/** A quién puede pasar cada encargado un despacho (espejo de dispatchPoolEmails en web). */
const DISPATCH_POOLS: Record<string, string[]> = {
  'direccion.operaciones@nexara.com.mx': ['jose.ramirez@nexara.com.mx'],
  'jose.ramirez@nexara.com.mx': ['soporte@nexara.com.mx', 'alejandro.gonzalez@nexara.com.mx'],
  'operaciones@nexara.com.mx': [
    'joan.sanchez@nexara.com.mx',
    'israel.ramos@nexara.com.mx',
    'juan.gonzalez@nexara.com.mx',
  ],
  'infraestructura@nexara.com.mx': [
    'joan.sanchez@nexara.com.mx',
    'israel.ramos@nexara.com.mx',
    'juan.gonzalez@nexara.com.mx',
  ],
};

export type DispatchMyActivityDto = { userIds: number[]; indicaciones?: string };

export type ReprogramarDespachoDto = { fecha: string; motivo?: string };

/** Revisión de evidencia desde la cadena de mando. */
export type RevisarEvidenciaDto = {
  decision: 'aprobar' | 'devolver';
  /** Pasos a corregir (devolución parcial). */
  pasos?: string[];
  /** Devolver todo: rehace sus evidencias desde cero. */
  todo?: boolean;
  observaciones: string;
  /** Eficiencia de quien la realizó, 1–5. */
  calificacion: number;
};

/** Quien consulta evidencias del equipo (rol y permisos deciden el alcance). */
export type TeamEvidenceViewer = {
  id: number;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
};

export type MyActivitiesViewer = { id: number; email?: string | null };

export type MyActivityItem = {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion: string | null;
  estatus: string;
  prioridad: string | null;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  assignmentCharge: string | null;
  fechaInicio: Date | null;
  fechaMaxima: Date | null;
  fechaAsignacion: Date;
  fechaFinalizacion: Date | null;
  tiempoEstimadoMin: number | null;
  tiempoMaximoMin: number | null;
  rol: string;
  /** Indicaciones personales de esta persona en la actividad. */
  indicaciones: string | null;
  asignadaPor: { id: number; nombre: string } | null;
  autoAsignada: boolean;
  proyecto: string | null;
  cliente: string | null;
  evidenceStatus: string | null;
  orden: number | null;
  ordenJustificacion: string | null;
  ordenActualizadoAt: Date | null;
  /** En despacho, este usuario solo reparte (no sube evidencia). */
  despachador: boolean;
  /** Despachador que todavía no la pasa a nadie. */
  porRepartir: boolean;
  /** Registro de despacho: a quién se pasó después de este usuario. */
  pasadaA: Array<{
    nombre: string;
    rol: string;
    at: Date;
    por: string | null;
    evidenceStatus: string | null;
  }>;
  /** Última reprogramación de día/hora (quién, cuándo, de → a). */
  ultimaReprogramacion: {
    at: Date;
    por: string | null;
    de: Date | null;
    a: Date;
    motivo: string | null;
  } | null;
};

export type MyActivitiesResponse = {
  canReorder: boolean;
  canSelfAssign: boolean;
  open: MyActivityItem[];
  /** Despachadas por este usuario: ya hizo su parte, da seguimiento. */
  seguimiento: MyActivityItem[];
  doneToday: MyActivityItem[];
};

export type ReorderMyActivitiesDto = {
  activityIds: number[];
  movedActivityId: number;
  justificacion: string;
};

const norm = (email?: string | null) => (email || '').trim().toLowerCase();

const isClosed = (estatus: string) =>
  /finalizada|completada|cancelada|aprobada/.test((estatus || '').toLowerCase());

/** Alta/Urgente primero, luego Media (o sin prioridad), luego Baja. */
const priorityRank = (p?: string | null) => {
  const v = (p || '').toLowerCase();
  if (v === 'alta' || v === 'urgente') return 0;
  if (v === 'baja') return 2;
  return 1;
};

/** null/undefined al final. */
const nullsLast = (a: number | null | undefined, b: number | null | undefined) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

@Injectable()
export class MyActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly team: ActivityTeamService,
    private readonly evidence: ActivityEvidenceService,
  ) {}

  /**
   * Quien reparte un despacho lo pasa a su gente sin ACTIVITIES_MANAGE (Antonio es
   * ingeniero de soporte). Solo si es LEAD activo de ese despacho y solo hacia su
   * grupo; la API decide el rol y addMember deja registro y avisos.
   */
  async dispatch(
    viewer: MyActivitiesViewer,
    companyId: number | null,
    activityId: number,
    dto: DispatchMyActivityDto,
  ) {
    const ids = Array.isArray(dto?.userIds) ? [...new Set(dto.userIds.map(Number))] : [];
    if (ids.length === 0 || ids.length > 10 || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new BadRequestException('Elige al menos a una persona de tu equipo');
    }

    const lead = await this.prisma.activityAssignee.findFirst({
      where: {
        activityId,
        userId: viewer.id,
        retiradoAt: null,
        rol: 'LEAD',
        ...(companyId != null ? { companyId } : {}),
        activity: { deletedAt: null, assignmentCharge: 'despacho' },
      },
      select: { id: true },
    });
    if (!lead) throw new ForbiddenException('Solo quien reparte este despacho puede asignarlo');

    const pool = new Set(DISPATCH_POOLS[norm(viewer.email)] ?? []);
    const targets = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, email: true },
    });
    if (targets.length !== ids.length || targets.some((t) => !pool.has(norm(t.email)))) {
      throw new ForbiddenException('Solo puedes pasarla a gente de tu equipo');
    }

    const notas = typeof dto?.indicaciones === 'string' ? dto.indicaciones.trim().slice(0, 500) : '';
    for (const t of targets) {
      // Si quien recibe también reparte (Luis → Antonio) entra como LEAD; si no, la ejecuta.
      const rol: AssigneeRole = DISPATCH_POOLS[norm(t.email)] ? 'LEAD' : 'TECNICO';
      await this.team.addMember(
        activityId,
        { userId: t.id, rol, ...(notas ? { indicaciones: notas } : {}) },
        companyId,
        viewer.id,
      );
    }
    return { ok: true, asignados: targets.length };
  }

  /** Quien reparte un despacho cambia su día y hora (queda en el registro de la actividad). */
  async reprogram(
    viewer: MyActivitiesViewer,
    companyId: number | null,
    activityId: number,
    dto: ReprogramarDespachoDto,
  ) {
    const nueva = new Date(String(dto?.fecha ?? ''));
    if (Number.isNaN(nueva.getTime())) {
      throw new BadRequestException('Indica un día y una hora válidos');
    }
    if (nueva.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('La nueva fecha no puede quedar en el pasado');
    }
    const motivo = typeof dto?.motivo === 'string' ? dto.motivo.trim().slice(0, 500) : '';

    const lead = await this.prisma.activityAssignee.findFirst({
      where: {
        activityId,
        userId: viewer.id,
        retiradoAt: null,
        rol: 'LEAD',
        ...(companyId != null ? { companyId } : {}),
        activity: { deletedAt: null, assignmentCharge: 'despacho' },
      },
      select: { activity: { select: { estatus: true } } },
    });
    if (!lead) throw new ForbiddenException('Solo quien reparte este despacho puede reprogramarlo');
    if (isClosed(lead.activity.estatus)) {
      throw new BadRequestException('La actividad ya está cerrada');
    }

    return this.team.reschedule(activityId, nueva, motivo || null, companyId, viewer.id);
  }

  /**
   * Evidencias del equipo de una actividad, por persona y en orden de la cadena (aunque esté cerrada).
   * Christian, revisores y el responsable ven a todos; cada encargado ve a quienes la recibieron
   * después de él (Antonio → su ingeniero); el resto solo lo suyo.
   */
  async teamEvidence(viewer: TeamEvidenceViewer, companyId: number | null, activityId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...(companyId != null ? { companyId } : {}) },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        coreKind: true,
        assignmentCharge: true,
        responsableId: true,
        creadoPorId: true,
        fechaAsignacion: true,
        evidencePhotoRequired: true,
        fechaFinalizacion: true,
        creador: { select: { id: true, nombre: true, puesto: true, avatarUrl: true } },
        responsable: { select: { id: true, nombre: true, puesto: true, avatarUrl: true } },
        assignees: {
          select: {
            userId: true,
            rol: true,
            asignadoAt: true,
            asignadoPorId: true,
            retiradoAt: true,
            indicaciones: true,
            user: { select: { id: true, nombre: true, puesto: true, avatarUrl: true } },
            asignadoPor: { select: { nombre: true } },
          },
          orderBy: { asignadoAt: 'asc' },
        },
        activityEvidences: {
          select: {
            userId: true,
            status: true,
            completedAt: true,
            entryPhotoUrl: true,
            entryLatitude: true,
            entryLongitude: true,
            entryPhotoUploadedAt: true,
            evidencePhotos: true,
            evidencePhotosGeo: true,
            evidencePhotosUploadedAt: true,
            serviceSheetPdfUrl: true,
            serviceSheetUploadedAt: true,
            serviceSheetData: true,
            serviceSheetCompletedAt: true,
            exitPhotoUrl: true,
            exitLatitude: true,
            exitLongitude: true,
            exitPhotoUploadedAt: true,
            reviewStatus: true,
            reviewNotes: true,
            reviewedAt: true,
            reviewedBy: { select: { nombre: true } },
            rejectedStep: true,
            rejectedSteps: true,
            eficienciaScore: true,
            correctionSubmittedAt: true,
          },
        },
        evidenceReviews: {
          select: {
            id: true,
            evidenceUserId: true,
            decision: true,
            steps: true,
            notes: true,
            score: true,
            snapshot: true,
            createdAt: true,
            reviewer: { select: { nombre: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    const despacho = activity.assignmentCharge === 'despacho';
    type Eslabon = (typeof activity.assignees)[number];
    // El responsable es parte de la cadena aunque no tenga fila de equipo (reparte o ejecuta).
    const cadena: Eslabon[] = activity.assignees.some((m) => m.userId === activity.responsableId)
      ? activity.assignees
      : [
          {
            userId: activity.responsableId,
            rol: 'LEAD' as Eslabon['rol'],
            asignadoAt: activity.fechaAsignacion,
            asignadoPorId: activity.creadoPorId,
            retiradoAt: null,
            indicaciones: null,
            user: activity.responsable,
            asignadoPor: activity.creador ? { nombre: activity.creador.nombre } : null,
          },
          ...activity.assignees,
        ];

    const email = norm(viewer.email);
    const perms = new Set((viewer.permissions ?? []).map(String));
    const todo =
      Boolean(viewer.isSuperAdmin) ||
      viewer.roleKey === 'ceo' ||
      email === CEO_EMAIL ||
      email === 'developer@nexara.com.mx' ||
      perms.has('console.admin') ||
      perms.has('evidences.review');
    const esResponsable = activity.responsableId === viewer.id;
    // Quien la creó ve todo, pero solo lectura (salvo que además sea superior de alguien).
    const esCreador = activity.creadoPorId === viewer.id;
    const mine =
      cadena.find((m) => m.userId === viewer.id && !m.retiradoAt) ??
      cadena.find((m) => m.userId === viewer.id);
    const soyEncargado = Boolean(mine && !mine.retiradoAt && String(mine.rol) === 'LEAD');
    // Jefes por organigrama (managerId hacia arriba): el jefe de alguien también lo revisa.
    const jefesDe = await this.managerChains(cadena.map((m) => m.userId));

    /** Soy encargado por encima de `m`: la recibió después que yo (o a la vez, si `m` no es encargado). */
    const encimaDe = (m: Eslabon) => {
      if (!soyEncargado || !mine) return false;
      const diff = m.asignadoAt.getTime() - mine.asignadoAt.getTime();
      return diff > MISMO_MOMENTO_MS || (Math.abs(diff) <= MISMO_MOMENTO_MS && String(m.rol) !== 'LEAD');
    };
    const reparteM = (m: Eslabon) => despacho && String(m.rol) === 'LEAD';
    const puedeRevisar = (m: Eslabon) =>
      m.userId !== viewer.id &&
      !reparteM(m) &&
      (todo || esResponsable || Boolean(jefesDe.get(m.userId)?.has(viewer.id)) || encimaDe(m));
    const puedeVer = (m: Eslabon) =>
      m.userId === viewer.id ||
      todo ||
      esResponsable ||
      esCreador ||
      puedeRevisar(m) ||
      (soyEncargado &&
        mine != null &&
        m.asignadoAt.getTime() >= mine.asignadoAt.getTime() - MISMO_MOMENTO_MS);

    const visibles = cadena.filter(puedeVer);
    if (!visibles.length && !todo && !esResponsable && !esCreador) {
      throw new ForbiddenException('No participas en esta actividad');
    }

    const evidenciaDe = new Map(activity.activityEvidences.map((e) => [e.userId, e]));
    const revisionesDe = new Map<number, typeof activity.evidenceReviews>();
    for (const r of activity.evidenceReviews) {
      const list = revisionesDe.get(r.evidenceUserId) ?? [];
      list.push(r);
      revisionesDe.set(r.evidenceUserId, list);
    }
    const textos = (v: unknown) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    const num = (v: unknown) => (v == null ? null : Number(v));

    const members = visibles.map((m) => {
      const e = evidenciaDe.get(m.userId) ?? null;
      return {
        userId: m.userId,
        nombre: m.user?.nombre ?? '—',
        puesto: m.user?.puesto ?? null,
        avatarUrl: m.user?.avatarUrl ?? null,
        rol: String(m.rol),
        reparte: despacho && String(m.rol) === 'LEAD',
        asignadoAt: m.asignadoAt,
        asignadoPor: m.asignadoPor?.nombre ?? null,
        retiradoAt: m.retiradoAt,
        indicaciones: m.indicaciones,
        pasoA: activity.assignees
          .filter((o) => o.asignadoPorId === m.userId && o.userId !== m.userId)
          .map((o) => ({ nombre: o.user?.nombre ?? '—', at: o.asignadoAt })),
        progressPct: e ? evidenceProgressPct(e.status, activity.coreKind) : 0,
        /** Puedo aprobarla o devolverla (ya la envió y soy su superior en la cadena). */
        puedoRevisar: puedeRevisar(m) && e?.status === 'COMPLETED',
        rejectedSteps: e ? (textos(e.rejectedSteps).length ? textos(e.rejectedSteps) : e.rejectedStep ? [e.rejectedStep] : []) : [],
        eficienciaScore: e?.eficienciaScore ?? null,
        revisiones: (revisionesDe.get(m.userId) ?? []).map((r) => ({
          id: r.id,
          decision: r.decision,
          pasos: textos(r.steps),
          observaciones: r.notes,
          calificacion: r.score,
          at: r.createdAt,
          revisor: r.reviewer?.nombre ?? null,
          // Copia de lo devuelto: permite ver lo que había aunque lo rehaga desde cero.
          snapshot: r.decision === 'APROBADA' ? null : r.snapshot,
        })),
        evidence: e
          ? {
              status: e.status,
              completedAt: e.completedAt,
              entryPhotoUrl: e.entryPhotoUrl,
              entryLatitude: num(e.entryLatitude),
              entryLongitude: num(e.entryLongitude),
              entryPhotoUploadedAt: e.entryPhotoUploadedAt,
              evidencePhotos: e.evidencePhotos ?? [],
              evidencePhotosGeo: Array.isArray(e.evidencePhotosGeo) ? e.evidencePhotosGeo : null,
              evidencePhotosUploadedAt: e.evidencePhotosUploadedAt,
              serviceSheetPdfUrl: e.serviceSheetPdfUrl,
              serviceSheetUploadedAt: e.serviceSheetUploadedAt,
              serviceSheetData: e.serviceSheetData,
              serviceSheetCompletedAt: e.serviceSheetCompletedAt,
              exitPhotoUrl: e.exitPhotoUrl,
              exitLatitude: num(e.exitLatitude),
              exitLongitude: num(e.exitLongitude),
              exitPhotoUploadedAt: e.exitPhotoUploadedAt,
              reviewStatus: e.reviewStatus,
              reviewNotes: e.reviewNotes,
              reviewedAt: e.reviewedAt,
              reviewedBy: e.reviewedBy?.nombre ?? null,
              /** Cuándo envió la corrección de lo que se le devolvió. */
              correctionSubmittedAt: e.correctionSubmittedAt,
            }
          : null,
      };
    });

    return {
      activity: {
        id: activity.id,
        anNumber: activity.anNumber,
        titulo: activity.titulo,
        estatus: activity.estatus,
        coreKind: activity.coreKind,
        assignmentCharge: activity.assignmentCharge,
        evidencePhotoRequired: activity.evidencePhotoRequired,
        fechaFinalizacion: activity.fechaFinalizacion,
      },
      alcance: todo || esResponsable || esCreador ? 'todo' : visibles.length > 1 ? 'equipo' : 'propio',
      creador: activity.creador?.nombre ?? null,
      responsable: activity.responsable?.nombre ?? null,
      /** No puedo revisar a nadie de lo que veo (p. ej. quien la creó). */
      soloLectura: !visibles.some((m) => puedeRevisar(m)),
      resumen: {
        ejecutores: members.filter((m) => !m.reparte).length,
        terminaron: members.filter((m) => !m.reparte && m.evidence?.status === 'COMPLETED').length,
        aprobadas: members.filter((m) => !m.reparte && m.evidence?.reviewStatus === 'APPROVED').length,
        porRevisarMias: members.filter(
          (m) => m.puedoRevisar && m.evidence?.reviewStatus !== 'APPROVED' && m.evidence?.reviewStatus !== 'REJECTED',
        ).length,
      },
      members,
    };
  }

  /**
   * Aprobar o devolver (algunos pasos o todo) la evidencia de alguien de la cadena.
   * Observaciones y calificación de eficiencia (1–5) son obligatorias. Devuelve la vista actualizada.
   */
  async reviewTeamEvidence(
    viewer: TeamEvidenceViewer,
    companyId: number | null,
    activityId: number,
    evidenceUserId: number,
    dto: RevisarEvidenciaDto,
  ) {
    const decision = dto?.decision;
    if (decision !== 'aprobar' && decision !== 'devolver') {
      throw new BadRequestException('Indica si apruebas o devuelves la evidencia');
    }
    const observaciones = String(dto.observaciones ?? '').trim();
    if (observaciones.length < 5) {
      throw new BadRequestException(
        decision === 'aprobar' ? 'Escribe por qué la apruebas' : 'Escribe qué debe corregir y por qué',
      );
    }
    const calificacion = Number(dto.calificacion);
    if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
      throw new BadRequestException('Califica su eficiencia de 1 a 5 estrellas');
    }
    const todo = decision === 'devolver' && Boolean(dto.todo);
    const pasos = Array.isArray(dto.pasos) ? dto.pasos.map(String) : [];
    if (decision === 'devolver' && !todo && pasos.length === 0) {
      throw new BadRequestException('Elige qué pasos debe corregir o devuelve toda la actividad');
    }

    const vista = await this.teamEvidence(viewer, companyId, activityId);
    const m = vista.members.find((x) => x.userId === evidenceUserId);
    if (!m) throw new NotFoundException('Esa persona no está en esta actividad');
    if (!m.evidence || m.evidence.status !== 'COMPLETED') {
      throw new BadRequestException('Solo se revisa la evidencia que ya se envió');
    }
    if (!m.puedoRevisar) {
      throw new ForbiddenException('Solo sus superiores en esta actividad pueden revisar esta evidencia');
    }

    await this.evidence.reviewEvidence({
      activityId,
      evidenceUserId,
      reviewerId: viewer.id,
      decision,
      pasos,
      todo,
      observaciones,
      calificacion,
      companyId,
    });
    return this.teamEvidence(viewer, companyId, activityId);
  }

  /** Jefes (managerId hacia arriba) de cada usuario. */
  private async managerChains(userIds: number[]): Promise<Map<number, Set<number>>> {
    const out = new Map<number, Set<number>>();
    if (!userIds.length) return out;
    const users = await this.prisma.user.findMany({ select: { id: true, managerId: true } });
    const jefeDe = new Map(users.map((u) => [u.id, u.managerId]));
    for (const id of userIds) {
      const jefes = new Set<number>();
      let cur = jefeDe.get(id) ?? null;
      while (cur != null && cur !== id && !jefes.has(cur)) {
        jefes.add(cur);
        cur = jefeDe.get(cur) ?? null;
      }
      out.set(id, jefes);
    }
    return out;
  }

  isAreaManager(email?: string | null): boolean {
    return AREA_MANAGER_EMAILS.has(norm(email));
  }

  /**
   * Encargado de área: crea una actividad solo para sí mismo (ejecución directa).
   * No pasa por ACTIVITIES_MANAGE porque responsable y creador se fuerzan al viewer.
   */
  async selfCreate(viewer: MyActivitiesViewer, companyId: number | null, dto: CreateActivityDto) {
    this.assertNotCeo(viewer);
    if (!this.isAreaManager(viewer.email)) {
      throw new ForbiddenException('Solo los encargados de área pueden auto-asignarse actividades');
    }
    return this.activities.create(
      {
        ...dto,
        responsableId: viewer.id,
        creadoPorId: viewer.id,
        assignmentCharge: 'ejecucion',
      } as CreateActivityDto,
      companyId,
    );
  }

  private assertNotCeo(viewer: MyActivitiesViewer): void {
    if (norm(viewer.email) === CEO_EMAIL) {
      throw new ForbiddenException('Mis actividades no aplica a dirección general');
    }
  }

  async list(viewer: MyActivitiesViewer, companyId: number | null): Promise<MyActivitiesResponse> {
    this.assertNotCeo(viewer);
    const rows = await this.prisma.activityAssignee.findMany({
      where: {
        userId: viewer.id,
        retiradoAt: null,
        ...(companyId != null ? { companyId } : {}),
        activity: { deletedAt: null },
      },
      select: {
        rol: true,
        asignadoAt: true,
        indicaciones: true,
        ordenEjecucion: true,
        ordenJustificacion: true,
        ordenActualizadoAt: true,
        activity: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            descripcion: true,
            estatus: true,
            prioridad: true,
            coreKind: true,
            ticketTypeCustom: true,
            assignmentCharge: true,
            fechaInicio: true,
            fechaMaxima: true,
            fechaAsignacion: true,
            fechaFinalizacion: true,
            tiempoEstimadoMin: true,
            tiempoMaximoMin: true,
            creadoPorId: true,
            creador: { select: { id: true, nombre: true } },
            project: { select: { title: true } },
            client: { select: { name: true } },
            activityEvidences: { select: { userId: true, status: true } },
            scheduleChanges: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                createdAt: true,
                fechaAnterior: true,
                fechaNueva: true,
                motivo: true,
                cambiadoPor: { select: { nombre: true } },
              },
            },
            assignees: {
              where: { retiradoAt: null },
              select: {
                userId: true,
                rol: true,
                asignadoAt: true,
                user: { select: { nombre: true } },
                asignadoPor: { select: { nombre: true } },
              },
              orderBy: { asignadoAt: 'asc' },
            },
          },
        },
      },
      take: 300,
    });

    const dayStart = new Date(`${new Date().toLocaleDateString('sv-SE')}T00:00:00`);
    const items: MyActivityItem[] = rows.map((row) => {
      const a = row.activity;
      const despachador = a.assignmentCharge === 'despacho' && String(row.rol) === 'LEAD';
      const statusByUser = new Map(a.activityEvidences.map((e) => [e.userId, e.status]));
      const pasadaA = a.assignees
        .filter((m) => m.userId !== viewer.id && m.asignadoAt.getTime() > row.asignadoAt.getTime())
        .map((m) => ({
          nombre: m.user?.nombre ?? '—',
          rol: String(m.rol),
          at: m.asignadoAt,
          por: m.asignadoPor?.nombre ?? null,
          evidenceStatus: statusByUser.get(m.userId) ?? null,
        }));
      return {
        id: a.id,
        anNumber: a.anNumber,
        titulo: a.titulo,
        descripcion: a.descripcion,
        estatus: a.estatus,
        prioridad: a.prioridad,
        coreKind: a.coreKind,
        ticketTypeCustom: a.ticketTypeCustom,
        assignmentCharge: a.assignmentCharge,
        fechaInicio: a.fechaInicio,
        fechaMaxima: a.fechaMaxima,
        fechaAsignacion: a.fechaAsignacion,
        fechaFinalizacion: a.fechaFinalizacion,
        tiempoEstimadoMin: a.tiempoEstimadoMin,
        tiempoMaximoMin: a.tiempoMaximoMin,
        rol: String(row.rol),
        indicaciones: row.indicaciones,
        asignadaPor: a.creador ? { id: a.creador.id, nombre: a.creador.nombre } : null,
        autoAsignada: a.creadoPorId === viewer.id,
        proyecto: a.project?.title ?? null,
        cliente: a.client?.name ?? null,
        evidenceStatus: statusByUser.get(viewer.id) ?? null,
        orden: row.ordenEjecucion,
        ordenJustificacion: row.ordenJustificacion,
        ordenActualizadoAt: row.ordenActualizadoAt,
        despachador,
        porRepartir: despachador && pasadaA.length === 0,
        pasadaA,
        ultimaReprogramacion: a.scheduleChanges[0]
          ? {
              at: a.scheduleChanges[0].createdAt,
              por: a.scheduleChanges[0].cambiadoPor?.nombre ?? null,
              de: a.scheduleChanges[0].fechaAnterior,
              a: a.scheduleChanges[0].fechaNueva,
              motivo: a.scheduleChanges[0].motivo,
            }
          : null,
      };
    });

    // Lo ya repartido sale de «Por hacer» y queda en seguimiento.
    const repartida = (item: MyActivityItem) => item.despachador && item.pasadaA.length > 0;
    const open = items.filter((item) => !isClosed(item.estatus) && !repartida(item));
    const seguimiento = items
      .filter((item) => !isClosed(item.estatus) && repartida(item))
      .sort((a, b) => a.fechaAsignacion.getTime() - b.fechaAsignacion.getTime());
    // Orden personal → prioridad → fecha programada → fecha de asignación.
    open.sort(
      (a, b) =>
        nullsLast(a.orden, b.orden) ||
        priorityRank(a.prioridad) - priorityRank(b.prioridad) ||
        nullsLast(a.fechaInicio?.getTime(), b.fechaInicio?.getTime()) ||
        a.fechaAsignacion.getTime() - b.fechaAsignacion.getTime(),
    );

    const doneToday = items
      .filter(
        (item) =>
          isClosed(item.estatus) &&
          item.fechaFinalizacion != null &&
          item.fechaFinalizacion.getTime() >= dayStart.getTime(),
      )
      .sort((a, b) => (b.fechaFinalizacion?.getTime() ?? 0) - (a.fechaFinalizacion?.getTime() ?? 0));

    const manager = this.isAreaManager(viewer.email);
    return { canReorder: manager, canSelfAssign: manager, open, seguimiento, doneToday };
  }

  async reorder(
    viewer: MyActivitiesViewer,
    companyId: number | null,
    dto: ReorderMyActivitiesDto,
  ): Promise<MyActivitiesResponse> {
    this.assertNotCeo(viewer);
    if (!this.isAreaManager(viewer.email)) {
      throw new ForbiddenException('Solo los encargados de área ordenan su cola');
    }

    const justificacion = String(dto?.justificacion ?? '').trim();
    if (justificacion.length < 10) {
      throw new BadRequestException('Explica por qué la harás en ese lugar (mínimo 10 caracteres)');
    }
    if (justificacion.length > 500) {
      throw new BadRequestException('La justificación no puede pasar de 500 caracteres');
    }

    const ids = Array.isArray(dto?.activityIds) ? dto.activityIds.map(Number) : [];
    const moved = Number(dto?.movedActivityId);
    if (
      ids.length === 0 ||
      ids.some((n) => !Number.isInteger(n) || n <= 0) ||
      new Set(ids).size !== ids.length ||
      !ids.includes(moved)
    ) {
      throw new BadRequestException('Orden inválido');
    }

    const owned = await this.prisma.activityAssignee.findMany({
      where: {
        userId: viewer.id,
        retiradoAt: null,
        activityId: { in: ids },
        ...(companyId != null ? { companyId } : {}),
        activity: { deletedAt: null },
      },
      select: { activityId: true },
    });
    if (owned.length !== ids.length) {
      throw new BadRequestException('Solo puedes ordenar tus propias actividades abiertas');
    }

    await this.prisma.$transaction(
      ids.map((activityId, index) =>
        this.prisma.activityAssignee.update({
          where: { activityId_userId: { activityId, userId: viewer.id } },
          data: {
            ordenEjecucion: index + 1,
            ...(activityId === moved
              ? { ordenJustificacion: justificacion, ordenActualizadoAt: new Date() }
              : {}),
          },
        }),
      ),
    );

    return this.list(viewer, companyId);
  }
}
