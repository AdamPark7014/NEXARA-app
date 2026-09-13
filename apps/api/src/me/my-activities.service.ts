import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CEO_EMAIL = 'gerencia@nexara.com.mx';

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
};

export type MyActivitiesResponse = {
  canReorder: boolean;
  canSelfAssign: boolean;
  open: MyActivityItem[];
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
  ) {}

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
            activityEvidences: { where: { userId: viewer.id }, select: { status: true }, take: 1 },
          },
        },
      },
      take: 300,
    });

    const dayStart = new Date(`${new Date().toLocaleDateString('sv-SE')}T00:00:00`);
    const items: MyActivityItem[] = rows.map((row) => {
      const a = row.activity;
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
        evidenceStatus: a.activityEvidences[0]?.status ?? null,
        orden: row.ordenEjecucion,
        ordenJustificacion: row.ordenJustificacion,
        ordenActualizadoAt: row.ordenActualizadoAt,
      };
    });

    const open = items.filter((item) => !isClosed(item.estatus));
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
    return { canReorder: manager, canSelfAssign: manager, open, doneToday };
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
