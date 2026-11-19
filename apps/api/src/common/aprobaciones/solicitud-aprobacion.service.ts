import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { EstadoSolicitudRh, NotificationType, TipoSolicitudRh, Prisma } from '@prisma/client';
import { AVISO_RH_DECISION, AVISO_RH_PENDIENTE } from './avisos-rh.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { esCuentaAvisoRh as esCuentaAviso } from './cuenta-aviso.js';
import { ROLES } from '../rbac/roles.v2.js';
import { WORKDAY_TIMEZONE } from '../time/workday.js';

export type CrearSolicitudRhInput = {
  companyId: number;
  tipo: TipoSolicitudRh;
  userId: number;
  solicitadoPorId: number;
  aprobadorActualId?: number | null;
  payload: Record<string, unknown>;
  leaveRequestId?: number | null;
  escaladoNivel?: number;
  aviso?: {
    title: string;
    message: string;
    type?: NotificationType;
    relatedUrl?: string;
  };
};

@Injectable()
export class SolicitudAprobacionService {
  private readonly logger = new Logger(SolicitudAprobacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async idsDireccion(companyId: number, excluirId?: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        roleKey: ROLES.CEO,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, email: true, puesto: true },
    });
    return rows.filter(esCuentaAviso).map((r) => r.id).filter((id) => id !== excluirId);
  }

  async idsRh(companyId: number, excluirId?: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        roleKey: ROLES.RH,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, email: true, puesto: true },
    });
    return rows.filter(esCuentaAviso).map((r) => r.id).filter((id) => id !== excluirId);
  }

  async supervisorGeneral(companyId: number): Promise<{ id: number; nombre: string } | null> {
    const rows = await this.prisma.user.findMany({
      where: {
        roleKey: ROLES.DIR_OPERACIONES,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, nombre: true, email: true, puesto: true },
      orderBy: { id: 'asc' },
    });
    const row = rows.find(esCuentaAviso);
    if (!row) return null;
    return { id: row.id, nombre: row.nombre };
  }

  async avisar(
    userIds: number[],
    payload: {
      type: NotificationType;
      title: string;
      message: string;
      triggerUserId: number;
      relatedEntityId: number;
      companyId: number;
      relatedUrl?: string;
      priority?: 'low' | 'normal' | 'high';
      dedupeSeconds?: number;
    },
  ) {
    if (!userIds.length) return;
    const destinatarios = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        companyMemberships: { some: { companyId: payload.companyId } },
      },
      select: { id: true, email: true, puesto: true },
    });
    for (const dest of destinatarios.filter(esCuentaAviso)) {
      await this.notifications
        .createNotification({
          userId: dest.id,
          type: payload.type,
          category: 'hr',
          title: payload.title,
          message: payload.message,
          triggerUserId: payload.triggerUserId,
          relatedEntityId: payload.relatedEntityId,
          entityType: 'SolicitudAprobacionRh',
          relatedUrl: payload.relatedUrl ?? '/erp/approvals',
          priority: payload.priority ?? 'high',
          companyId: payload.companyId,
          dedupeSeconds: payload.dedupeSeconds ?? 0,
        })
        .catch((error) =>
          this.logger.warn(`No se pudo completar un aviso de aprobación RH (${payload.type}): ${String(error?.message ?? error)}`),
        );
    }
  }

  async crear(input: CrearSolicitudRhInput, tx?: Prisma.TransactionClient): Promise<Prisma.SolicitudAprobacionRhGetPayload<{ include: { user: { select: { id: true; nombre: true; email: true } }; solicitadoPor: { select: { id: true; nombre: true } } } }>> {
    const db = tx ?? this.prisma;
    const companyId = Number(input.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('Selecciona una empresa válida.');
    }
    const userId = Number(input.userId);
    const solicitadoPorId = Number(input.solicitadoPorId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new BadRequestException('Indica a qué persona aplica la solicitud.');
    }
    if (!Number.isSafeInteger(solicitadoPorId) || solicitadoPorId <= 0) {
      throw new BadRequestException('Sesión inválida.');
    }
    if (!['CAMBIO_PUESTO', 'CAMBIO_JEFE', 'AJUSTE_SUELDO', 'VACACIONES', 'PERMISO'].includes(input.tipo)) throw new BadRequestException('Indica un tipo de solicitud válido.');
    if (!input.payload || typeof input.payload !== 'object') {
      throw new BadRequestException('Falta el detalle de la solicitud.');
    }

    if (tx) {
      // Serializa solicitudes de la misma persona, también entre instancias de la API.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${companyId}::int, ${userId}::int)`;
    for (const id of [userId, solicitadoPorId, input.aprobadorActualId].filter((id): id is number => id != null)) {
      const miembro = await db.user.findFirst({where: {id, isActive: true, companyMemberships: {some: {companyId}}}, select: {id: true}});
      if (!miembro) throw new BadRequestException('Todas las personas deben estar activas en la empresa seleccionada.');
    }
    const pendiente = await db.solicitudAprobacionRh.findFirst({
      where: { companyId, userId, tipo: input.tipo, estado: 'PENDIENTE', ...(input.leaveRequestId ? { leaveRequestId: input.leaveRequestId } : {}) },
      select: { id: true },
    });
    if (pendiente) {
      throw new BadRequestException('Ya hay una solicitud pendiente del mismo tipo para esa persona.');
    }

    const created = await db.solicitudAprobacionRh.create({
      data: {
        companyId,
        tipo: input.tipo,
        userId,
        solicitadoPorId,
        aprobadorActualId: input.aprobadorActualId ?? null,
        estado: 'PENDIENTE',
        payload: input.payload as object,
        leaveRequestId: input.leaveRequestId ?? null,
        escaladoNivel: input.escaladoNivel ?? 0,
      },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
      },
    });

    await db.empleadoEvento.create({data: {companyId, userId, actorId: solicitadoPorId, tipo: 'OTRO', detalle: {solicitudId: created.id, tipo: input.tipo, estado: 'PENDIENTE'}}});
    return created;

    }
    const created = await this.prisma.$transaction((transaction) => this.crear(input, transaction));

    await this.audit
      .log(
        {
          entityType: 'SolicitudAprobacionRh',
          entityId: created.id,
          action: 'RH_SOLICITUD_CREADA',
          changes: { tipo: input.tipo, userId, estado: 'PENDIENTE' },
          companyId,
        },
        solicitadoPorId,
      )
      .catch(() => this.logger.warn('No se pudo registrar la auditoría de la solicitud RH.'));

    const destinatarios = input.aprobadorActualId
      ? [input.aprobadorActualId]
      : await this.idsDireccion(companyId, solicitadoPorId);
    if (input.aviso) {
      await this.avisar(destinatarios.filter((id) => id !== solicitadoPorId), {
        type: input.aviso.type ?? AVISO_RH_PENDIENTE[input.tipo],
        title: input.aviso.title,
        message: input.aviso.message,
        triggerUserId: solicitadoPorId,
        relatedEntityId: created.id,
        companyId,
        relatedUrl: input.aviso.relatedUrl,
      });
    }

    return created;
  }

  async decidir(
    id: number,
    companyId: number,
    actorId: number,
    estado: Extract<EstadoSolicitudRh, 'APROBADA' | 'RECHAZADA'>,
    motivoRechazo?: string,
  ) {
    if (estado === 'RECHAZADA') {
      const motivo = String(motivoRechazo ?? '').trim();
      if (motivo.length < 3) throw new BadRequestException('Escribe el motivo del rechazo.');
    }

    let actual: any;
    const updated = await this.prisma.$transaction(async (tx) => {
    const actor = await tx.user.findFirst({where: {id: actorId, isActive: true, companyMemberships: {some: {companyId}}}, select: {id: true, roleKey: true}});
    if (!actor) throw new ForbiddenException('Tu usuario no pertenece a esta empresa.');
    actual = await tx.solicitudAprobacionRh.findFirst({
      where: { id, companyId },
      include: {
        user: { select: { id: true, nombre: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
      },
    });
    if (!actual) throw new NotFoundException('No encontramos esa solicitud.');
    const direccion = actor.roleKey === ROLES.CEO || actor.roleKey === ROLES.SUPER_ADMIN;
    const permiso = actual.tipo === 'VACACIONES' || actual.tipo === 'PERMISO';
    if (!direccion && (!permiso || actual.aprobadorActualId !== actorId)) throw new ForbiddenException('No te corresponde decidir esta solicitud.');
    if (actual.estado !== 'PENDIENTE') {
      throw new BadRequestException('La solicitud ya cambió de estado. Actualiza la lista.');
    }

    const cambio = await tx.solicitudAprobacionRh.updateMany({
      where: { id, companyId, estado: 'PENDIENTE' },
      data: {
        estado,
        decididoPorId: actorId,
        decididoAt: new Date(),
        motivoRechazo: estado === 'RECHAZADA' ? String(motivoRechazo ?? '').trim() : null,
      },
    });
    if (cambio.count !== 1) {
      throw new BadRequestException('La solicitud ya cambió de estado. Actualiza la lista.');
    }

    const target = await tx.user.findFirst({where: {id: actual.userId, companyMemberships: {some: {companyId}}}, select: {id: true}});
    if (!target) throw new BadRequestException('La persona ya no pertenece a esta empresa.');
    const payload = (actual.payload ?? {}) as Record<string, any>;
    if (permiso && actual.leaveRequestId) {
      const result = await tx.leaveRequest.updateMany({
        where: {id: actual.leaveRequestId, companyId, userId: actual.userId, status: 'PENDING'},
        data: {status: estado === 'APROBADA' ? 'APPROVED' : 'REJECTED', approvedById: actorId, approvedAt: new Date(), rejectionReason: estado === 'RECHAZADA' ? String(motivoRechazo).trim() : null},
      });
      if (result.count !== 1) throw new BadRequestException('El permiso ya cambió de estado. Actualiza la lista.');
    } else if (estado === 'APROBADA') {
      if (actual.tipo === 'CAMBIO_PUESTO') {
        await tx.user.update({where: {id: actual.userId}, data: {puesto: String(payload.puestoNuevo)}});
      } else if (actual.tipo === 'CAMBIO_JEFE') {
        const jefe = await tx.user.findFirst({where: {id: Number(payload.managerIdNuevo), isActive: true, companyMemberships: {some: {companyId}}}, select: {id: true, managerId: true}});
        if (!jefe || jefe.id === actual.userId) throw new BadRequestException('El nuevo jefe no es válido en esta empresa.');
        const vistos = new Set<number>([actual.userId]);
        let siguiente: number | null = jefe.id;
        while (siguiente != null) {
          if (vistos.has(siguiente)) throw new BadRequestException('El cambio formaría un ciclo de jefes.');
          vistos.add(siguiente);
          const nodo: {managerId: number | null} | null = await tx.user.findFirst({where: {id: siguiente, companyMemberships: {some: {companyId}}}, select: {managerId: true}});
          siguiente = nodo?.managerId ?? null;
        }
        await tx.user.update({where: {id: actual.userId}, data: {managerId: jefe.id}});
      } else if (actual.tipo === 'AJUSTE_SUELDO') {
        await tx.userProfile.upsert({where: {userId: actual.userId}, create: {userId: actual.userId, sueldoSemanal: payload.sueldoNuevo}, update: {sueldoSemanal: payload.sueldoNuevo}});
      }
      await tx.empleadoEvento.create({data: {companyId, userId: actual.userId, actorId, tipo: actual.tipo, detalle: payload}});
    }
    return tx.solicitudAprobacionRh.findFirstOrThrow({
      where: { id, companyId },
      include: {
        user: { select: { id: true, nombre: true, email: true, employeeNumber: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
        decididoPor: { select: { id: true, nombre: true } },
      },
    });

    });

    await this.audit
      .log(
        {
          entityType: 'SolicitudAprobacionRh',
          entityId: id,
          action: `RH_SOLICITUD_${estado}`,
          changes: { anterior: 'PENDIENTE', estado, motivoRechazo: motivoRechazo ?? null },
          companyId,
        },
        actorId,
      )
      .catch(() => this.logger.warn('No se pudo registrar la decisión de la solicitud RH.'));

    await this.avisar([actual.solicitadoPorId].filter((x) => x !== actorId), {
      type: AVISO_RH_DECISION[estado],
      title: estado === 'APROBADA'
        ? `Solicitud aprobada: ${actual.user.nombre}`
        : `Solicitud rechazada: ${actual.user.nombre}`,
      message: estado === 'APROBADA'
        ? `Se aprobó la solicitud de ${actual.tipo.replace(/_/g, ' ').toLowerCase()}.`
        : String(motivoRechazo ?? 'Rechazada.'),
      triggerUserId: actorId,
      relatedEntityId: id,
      companyId,
    });

    return updated;
  }

  async listarPendientesPara(actorId: number, companyId: number) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId, isActive: true, companyMemberships: { some: { companyId } } },
      select: { roleKey: true, email: true },
    });
    if (!actor) throw new ForbiddenException('Tu usuario no pertenece a esta empresa.');
    const esDir = actor.roleKey === ROLES.CEO || actor.roleKey === ROLES.SUPER_ADMIN;
    return this.prisma.solicitudAprobacionRh.findMany({
      where: {
        companyId,
        estado: 'PENDIENTE',
        OR: [
          { aprobadorActualId: actorId },
          ...(esDir
            ? [
                { aprobadorActualId: null },
                { tipo: { in: ['CAMBIO_PUESTO', 'CAMBIO_JEFE', 'AJUSTE_SUELDO'] as TipoSolicitudRh[] } },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        user: { select: { id: true, nombre: true, email: true, employeeNumber: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
      },
    });
  }

  async listar(companyId: number, estado?: EstadoSolicitudRh) {
    return this.prisma.solicitudAprobacionRh.findMany({
      where: {
        companyId,
        ...(estado ? { estado } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        user: { select: { id: true, nombre: true, email: true, employeeNumber: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
        decididoPor: { select: { id: true, nombre: true } },
        aprobadorActual: { select: { id: true, nombre: true } },
      },
    });
  }

  /** Escalamiento de vacaciones/permisos: jefe (0) → Luis (1) → dirección (2) tras 24 h. */
  @Cron('15 * * * *', { name: 'rh-escalar-solicitudes-24h', timeZone: WORKDAY_TIMEZONE })
  async escalarPendientes24h() {
    const limite = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendientes = await this.prisma.solicitudAprobacionRh.findMany({
      where: {
        estado: 'PENDIENTE',
        tipo: { in: ['VACACIONES', 'PERMISO'] },
        escaladoNivel: { lt: 2 },
        OR: [
          { escaladoAt: null, createdAt: { lte: limite } },
          { escaladoAt: { lte: limite } },
        ],
      },
      take: 200,
      include: { user: { select: { nombre: true } } },
    });

    for (const s of pendientes) {
      const siguiente = s.escaladoNivel + 1;
      let nuevoAprobador: number | null = null;
      if (siguiente === 1) {
        const luis = await this.supervisorGeneral(s.companyId);
        nuevoAprobador = luis?.id ?? null;
      } else if (siguiente >= 2) {
        const dirs = await this.idsDireccion(s.companyId, s.aprobadorActualId ?? undefined);
        nuevoAprobador = dirs[0] ?? null;
      }
      const cambio = await this.prisma.solicitudAprobacionRh.updateMany({
        where: { id: s.id, companyId: s.companyId, estado: 'PENDIENTE', escaladoNivel: s.escaladoNivel },
        data: {
          escaladoNivel: Math.min(siguiente, 2),
          escaladoAt: new Date(),
          aprobadorActualId: nuevoAprobador,
        },
      });
      if (cambio.count !== 1) continue;
      const destinos = nuevoAprobador
        ? [nuevoAprobador]
        : await this.idsDireccion(s.companyId);
      await this.avisar(destinos, {
        type: 'RH_SOLICITUD_ESCALADA',
        title: `Solicitud sin respuesta: ${s.user.nombre}`,
        message: `Lleva más de 24 h pendiente y subió de nivel (${Math.min(siguiente, 2)}).`,
        triggerUserId: s.solicitadoPorId,
        relatedEntityId: s.id,
        companyId: s.companyId,
      });
    }
  }
}
