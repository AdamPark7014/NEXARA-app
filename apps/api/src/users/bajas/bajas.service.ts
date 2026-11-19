import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { UsersService } from '../users.service.js';
import {
  PLATFORM_OWNER_EMAIL,
  isDeveloperSuperAdminEmail,
  isPlatformOwnerEmail,
} from '../../common/platform-accounts.js';
import { esCuentaAvisoRh } from '../../common/aprobaciones/cuenta-aviso.js';
import { esDireccion } from '../user-creation-policy.js';
import { ROLES } from '../../common/rbac/roles.v2.js';
import type { MotivoBaja, ModoBaja, EstadoBaja, NotificationType } from '@prisma/client';

type Sesion = { id?: number | string | null; isClient?: boolean; isBranchUser?: boolean };

export type SolicitarBajaDto = {
  userId: number;
  motivo: MotivoBaja;
  fechaBaja: string;
  comentario?: string;
  yaAutorizadoPorDireccion?: boolean;
  justificacion?: string;
};

const MOTIVOS: ReadonlySet<string> = new Set(['RENUNCIA', 'ABANDONO', 'DESPIDO', 'FIN_CONTRATO', 'OTRO']);

/** Misma regla que el servicio reutilizable de aprobaciones RH. */
const esCuentaDireccionAviso = esCuentaAvisoRh;

@Injectable()
export class BajasService {
  private readonly logger = new Logger(BajasService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async actor(sesion: Sesion, companyId: number) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0) throw new ForbiddenException('Selecciona una empresa válida.');
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el personal interno puede gestionar bajas.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, isActive: true, nombre: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return actor;
  }

  private esRhODireccion(actor: { email: string | null; roleKey: string | null }) {
    if (esDireccion(actor, PLATFORM_OWNER_EMAIL)) return { rh: false, direccion: true };
    if (actor.roleKey === ROLES.RH) return { rh: true, direccion: false };
    throw new ForbiddenException('Solo RH o dirección pueden gestionar bajas.');
  }

  private async idsDireccion(companyId: number, excluirId?: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        roleKey: ROLES.CEO,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, email: true, puesto: true },
    });
    return rows.filter(esCuentaDireccionAviso).map((r) => r.id).filter((id) => id !== excluirId);
  }

  private async avisar(
    userIds: number[],
    payload: {
      type: NotificationType;
      title: string;
      message: string;
      triggerUserId: number;
      relatedEntityId: number;
      companyId: number;
      relatedUrl?: string;
    },
  ) {
    if (!userIds.length) return;
    const destinatarios = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, companyMemberships: { some: { companyId: payload.companyId } } },
      select: { id: true, email: true, puesto: true },
    });
    for (const { id: userId } of destinatarios.filter(esCuentaDireccionAviso)) {
      await this.notifications
        .createNotification({
          userId,
          type: payload.type,
          category: 'hr',
          title: payload.title,
          message: payload.message,
          triggerUserId: payload.triggerUserId,
          relatedEntityId: payload.relatedEntityId,
          entityType: 'UserDeactivationRequest',
          relatedUrl: payload.relatedUrl ?? '/erp/approvals',
          priority: 'high',
          companyId: payload.companyId,
          dedupeSeconds: 0,
        })
        .catch((error) =>
          this.logger.warn(`No se pudo completar un aviso de baja (${payload.type}): ${String(error?.message ?? error)}`),
        );
    }
  }

  private async desactivar(
    userId: number,
    companyId: number,
    actorId: number,
    action: string,
  ) {
    await this.users.updateHrFields(userId, { isActive: false, estadoRRHH: 'Baja' }, companyId);
    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: userId,
          action,
          changes: { cambiadoPor: actorId, estadoRRHH: 'Baja' },
          companyId,
        },
        actorId,
      )
      .catch(() => this.logger.warn('No se pudo completar un aviso o registro auxiliar de baja.'));
  }

  private async reactivar(userId: number, companyId: number, actorId: number) {
    await this.users.updateHrFields(userId, { isActive: true, estadoRRHH: 'Activo' }, companyId);
    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: userId,
          action: 'USER_REACTIVATED',
          changes: { cambiadoPor: actorId, estadoRRHH: 'Activo', via: 'baja_revertida' },
          companyId,
        },
        actorId,
      )
      .catch(() => this.logger.warn('No se pudo completar un aviso o registro auxiliar de baja.'));
  }

  private async decidir(id: number, companyId: number, actorId: number, anterior: EstadoBaja,
    estado: EstadoBaja, motivoRechazo?: string) {
    return this.prisma.$transaction(async (tx) => {
      const cambio = await tx.userDeactivationRequest.updateMany({
        where: { id, companyId, estado: anterior },
        data: { estado, decididoPorId: actorId, decididoAt: new Date(), motivoRechazo },
      });
      if (cambio.count !== 1) throw new BadRequestException('La baja ya cambió de estado. Actualiza la lista.');
      const solicitud = await tx.userDeactivationRequest.findFirstOrThrow({ where: { id, companyId } });
      if (estado === 'APROBADA') {
        const destino = await tx.user.findFirst({ where: { id: solicitud.userId, companyMemberships: { some: { companyId } } },
          select: { id: true, email: true, roleKey: true } });
        if (!destino || destino.id === actorId || esDireccion(destino, PLATFORM_OWNER_EMAIL) || isDeveloperSuperAdminEmail(destino.email)) {
          throw new ForbiddenException('Esa cuenta no se da de baja desde aquí.');
        }
      }
      if (estado !== 'RECHAZADA') {
        const persona = await tx.user.updateMany({
          where: { id: solicitud.userId, companyMemberships: { some: { companyId } } },
          data: { isActive: estado === 'REVERTIDA', estadoRRHH: estado === 'REVERTIDA' ? 'Activo' : 'Baja' },
        });
        if (persona.count !== 1) throw new BadRequestException('La persona ya no pertenece a esta empresa.');
      }
      await tx.auditLog.create({ data: { companyId, userId: actorId, entityType: 'UserDeactivationRequest',
        entityId: id, action: 'BAJA_' + estado, changes: { anterior, estado, motivoRechazo: motivoRechazo ?? null } } });
      return solicitud;
    });
  }

  async solicitar(sesion: Sesion, dto: SolicitarBajaDto, companyId: number) {
    if (!dto || typeof dto !== 'object') throw new BadRequestException('Completa la solicitud de baja.');
    const actor = await this.actor(sesion, companyId);
    const { rh, direccion } = this.esRhODireccion(actor);

    const userId = Number(dto.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new BadRequestException('Indica a quién dar de baja.');
    if (userId === actor.id) throw new BadRequestException('No puedes darte de baja a ti mismo.');

    const motivo = String(dto.motivo ?? '').trim().toUpperCase();
    if (!MOTIVOS.has(motivo)) throw new BadRequestException('Elige un motivo de baja válido.');

    const fechaBaja = String(dto.fechaBaja ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaBaja) || !Number.isFinite(Date.parse(fechaBaja)) || new Date(fechaBaja).toISOString().slice(0, 10) !== fechaBaja) {
      throw new BadRequestException('La fecha de baja debe ser AAAA-MM-DD.');
    }

    const destino = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, email: true, roleKey: true, isActive: true },
    });
    if (!destino) throw new BadRequestException('No encontramos a esa persona.');
    if (isPlatformOwnerEmail(destino.email) || isDeveloperSuperAdminEmail(destino.email)) {
      throw new ForbiddenException('Esa cuenta no se da de baja desde aquí.');
    }
    if (destino.roleKey === ROLES.CEO || esDireccion({ email: destino.email, roleKey: destino.roleKey }, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('No se puede dar de baja a dirección.');
    }
    if (destino.isActive === false) throw new BadRequestException('Esa persona ya está desactivada.');

    const pendiente = await this.prisma.userDeactivationRequest.findFirst({
      where: { companyId, userId, estado: 'PENDIENTE' },
      select: { id: true },
    });
    if (pendiente) throw new BadRequestException('Ya hay una baja pendiente de aprobación para esa persona.');

    if (dto.yaAutorizadoPorDireccion != null && typeof dto.yaAutorizadoPorDireccion !== 'boolean') throw new BadRequestException('Indica si dirección ya autorizó la baja.');
    const yaAutorizado = dto.yaAutorizadoPorDireccion === true;
    const justificacion = String(dto.justificacion ?? '').trim();
    if (rh && yaAutorizado && justificacion.length < 10) {
      throw new BadRequestException('Si Christian ya autorizó, escribe la justificación (al menos 10 caracteres).');
    }

    const aplicarYa = direccion || (rh && yaAutorizado);
    const modo: ModoBaja = rh && yaAutorizado ? 'APLICADA_CON_VOBO' : 'SOLICITUD';
    const estado: EstadoBaja = aplicarYa ? 'APROBADA' : 'PENDIENTE';

    const created = await this.prisma.$transaction(async (tx) => {
      if (await tx.userDeactivationRequest.findFirst({ where: { companyId, userId, estado: 'PENDIENTE' } })) {
        throw new BadRequestException('Ya hay una baja pendiente de aprobación para esa persona.');
      }
      const created = await tx.userDeactivationRequest.create({
        data: {
          companyId,
          userId,
          solicitadoPorId: actor.id,
          motivo: motivo as MotivoBaja,
          fechaBaja: new Date(`${fechaBaja}T12:00:00.000Z`),
          comentario: String(dto.comentario ?? '').trim() || null,
          modo: aplicarYa && yaAutorizado && rh ? 'APLICADA_CON_VOBO' : modo,
          justificacion: yaAutorizado ? justificacion || null : null,
          estado,
          decididoPorId: aplicarYa ? actor.id : null,
          decididoAt: aplicarYa ? new Date() : null,
        },
        include: {
          user: { select: { id: true, nombre: true, email: true } },
          solicitadoPor: { select: { id: true, nombre: true } },
        },
      });

      if (aplicarYa) await tx.user.update({ where: { id: userId, companyMemberships: { some: { companyId } } },
        data: { isActive: false, estadoRRHH: 'Baja' } });
      await tx.auditLog.create({ data: { companyId, userId: actor.id, entityType: 'UserDeactivationRequest',
        entityId: created.id, action: 'BAJA_SOLICITADA', changes: { estado, modo, userId } } });
      return created;
    }, { isolationLevel: 'Serializable' }).catch((error: unknown) => {
      if ((error as { code?: string })?.code === 'P2034') throw new BadRequestException('La persona o su solicitud cambiaron. Actualiza la lista e intenta de nuevo.');
      throw error;
    });

    if (aplicarYa) {
      await this.desactivar(userId, companyId, actor.id, 'USER_DEACTIVATED');
      if (rh && yaAutorizado) {
        await this.avisar(await this.idsDireccion(companyId, actor.id), {
          type: 'BAJA_APLICADA_VOBO',
          title: `Baja aplicada con tu visto bueno: ${destino.nombre}`,
          message: `${actor.nombre} la aplicó. Puedes revisarla y revertirla si hace falta.`,
          triggerUserId: actor.id,
          relatedEntityId: created.id,
          companyId,
        });
      }
    } else {
      await this.avisar(await this.idsDireccion(companyId, actor.id), {
        type: 'BAJA_PENDIENTE',
        title: `Baja por aprobar: ${destino.nombre}`,
        message: `${actor.nombre} solicitó la baja. Revísala en Aprobaciones.`,
        triggerUserId: actor.id,
        relatedEntityId: created.id,
        companyId,
      });
    }

    return created;
  }

  async listar(sesion: Sesion, companyId: number, estado?: string) {
    const actor = await this.actor(sesion, companyId);
    this.esRhODireccion(actor);
    const where: { companyId: number; estado?: EstadoBaja } = { companyId };
    if (estado && ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVERTIDA'].includes(estado)) {
      where.estado = estado as EstadoBaja;
    }
    return this.prisma.userDeactivationRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        user: { select: { id: true, nombre: true, email: true, employeeNumber: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
        decididoPor: { select: { id: true, nombre: true } },
      },
    });
  }

  async aprobar(sesion: Sesion, id: number, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    if (!esDireccion(actor, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('Solo dirección aprueba bajas.');
    }
    const req = await this.prisma.userDeactivationRequest.findFirst({
      where: { id, companyId },
      include: { user: { select: { id: true, nombre: true, isActive: true } }, solicitadoPor: { select: { id: true } } },
    });
    if (!req) throw new NotFoundException('No encontramos esa solicitud de baja.');
    if (req.estado !== 'PENDIENTE') throw new BadRequestException('Esa baja ya no está pendiente.');

    const updated = await this.decidir(req.id, companyId, actor.id, 'PENDIENTE', 'APROBADA');
    if (req.user.isActive !== false) {
      await this.desactivar(req.userId, companyId, actor.id, 'USER_DEACTIVATED');
    }
    await this.avisar([req.solicitadoPorId].filter((x) => x !== actor.id), {
      type: 'BAJA_APROBADA',
      title: `Baja aprobada: ${req.user.nombre}`,
      message: `${actor.nombre} aprobó la baja. La cuenta ya no puede entrar.`,
      triggerUserId: actor.id,
      relatedEntityId: req.id,
      companyId,
    });
    return updated;
  }

  async rechazar(sesion: Sesion, id: number, motivo: string, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    if (!esDireccion(actor, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('Solo dirección rechaza bajas.');
    }
    const motivoRechazo = String(motivo ?? '').trim();
    if (motivoRechazo.length < 3) throw new BadRequestException('Escribe el motivo del rechazo.');

    const req = await this.prisma.userDeactivationRequest.findFirst({
      where: { id, companyId },
      include: { user: { select: { nombre: true } } },
    });
    if (!req) throw new NotFoundException('No encontramos esa solicitud de baja.');
    if (req.estado !== 'PENDIENTE') throw new BadRequestException('Esa baja ya no está pendiente.');

    const updated = await this.decidir(req.id, companyId, actor.id, 'PENDIENTE', 'RECHAZADA', motivoRechazo);
    await this.avisar([req.solicitadoPorId].filter((x) => x !== actor.id), {
      type: 'BAJA_RECHAZADA',
      title: `Baja rechazada: ${req.user.nombre}`,
      message: `${actor.nombre}: ${motivoRechazo}`,
      triggerUserId: actor.id,
      relatedEntityId: req.id,
      companyId,
    });
    return updated;
  }

  async revertir(sesion: Sesion, id: number, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    if (!esDireccion(actor, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('Solo dirección revierte bajas.');
    }
    const req = await this.prisma.userDeactivationRequest.findFirst({
      where: { id, companyId },
      include: { user: { select: { id: true, nombre: true } } },
    });
    if (!req) throw new NotFoundException('No encontramos esa solicitud de baja.');
    if (req.estado !== 'APROBADA') throw new BadRequestException('Solo se revierten bajas ya aplicadas.');

    const updated = await this.decidir(req.id, companyId, actor.id, 'APROBADA', 'REVERTIDA');
    await this.reactivar(req.userId, companyId, actor.id);
    await this.avisar([req.solicitadoPorId].filter((x) => x !== actor.id), {
      type: 'BAJA_REVERTIDA',
      title: `Baja revertida: ${req.user.nombre}`,
      message: `${actor.nombre} reactivó la cuenta.`,
      triggerUserId: actor.id,
      relatedEntityId: req.id,
      companyId,
    });
    return updated;
  }
}

