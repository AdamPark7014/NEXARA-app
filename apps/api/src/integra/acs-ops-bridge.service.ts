import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACTIVITY_STATUS,
  closedStatusVariants,
  statusVariants,
} from '../activities/activity-status.js';
import {
  acsOpsDirection,
  dayKeyInTz,
  isAccesoGeneralDoor,
  pickTodayActivityId,
  type AcsOpsDirection,
} from './acs-ops-bridge.match';

/** Subconjunto del evento normalizado del push (evita ciclo con IntegraPushService). */
export type AcsOpsEventInput = {
  eventType: string;
  major: number | null;
  minor: number | null;
  occurredAt: Date;
  personId: string | null;
  personName: string | null;
  deviceName: string | null;
  doorNo: number | null;
};

export type AcsOpsBridgeResult = {
  handled: boolean;
  direction: AcsOpsDirection;
  userId?: number;
  activityId?: number;
  action?: string;
  reason?: string;
};

/**
 * Puente ACS (integra-push) → Operaciones.
 *
 * Tras un acceso concedido/denegado:
 * 1. Entrada Acceso General + employeeNumber en equipo de OT de hoy → sello check-in.
 * 2. Salida (minor 76) → check-out / leftSite en la OT vinculada.
 * 3. Denegado → notificación opcional a Ops (responsable / coord).
 *
 * Best-effort: nunca tumba el ingest del evento.
 */
@Injectable()
export class AcsOpsBridgeService {
  private readonly logger = new Logger(AcsOpsBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  enabled(): boolean {
    const raw = (process.env.ACS_OPS_BRIDGE || '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  notifyDeniedEnabled(): boolean {
    const raw = (process.env.ACS_OPS_NOTIFY_DENIED || '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  async handlePushEvent(
    site: { id: number; companyId: number },
    ev: AcsOpsEventInput,
  ): Promise<AcsOpsBridgeResult> {
    if (!this.enabled()) {
      return { handled: false, direction: null, reason: 'bridge_off' };
    }
    if (ev.eventType !== 'AccessControllerEvent') {
      return { handled: false, direction: null, reason: 'not_acs' };
    }

    const direction = acsOpsDirection(ev.major, ev.minor);
    if (!direction) {
      return { handled: false, direction: null, reason: 'unknown_minor' };
    }

    try {
      if (direction === 'denied') {
        return await this.onDenied(site, ev);
      }
      if (direction === 'entry') {
        if (!isAccesoGeneralDoor(ev.deviceName)) {
          return { handled: false, direction, reason: 'not_acceso_general' };
        }
        return await this.onEntry(site, ev);
      }
      return await this.onExit(site, ev);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`ACS→Ops bridge: ${msg}`);
      return { handled: false, direction, reason: msg };
    }
  }

  private async onEntry(
    site: { companyId: number },
    ev: AcsOpsEventInput,
  ): Promise<AcsOpsBridgeResult> {
    const user = await this.resolveUser(site.companyId, ev.personId);
    if (!user) {
      return { handled: false, direction: 'entry', reason: 'sin_empleado' };
    }

    const activityId = await this.findTodayActivityId(site.companyId, user.id, ev.occurredAt);
    if (!activityId) {
      return {
        handled: false,
        direction: 'entry',
        userId: user.id,
        reason: 'sin_ot_hoy',
      };
    }

    const door = (ev.deviceName || 'Acceso General').slice(0, 120);
    const at = ev.occurredAt;

    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, companyId: site.companyId },
      select: {
        id: true,
        acsEnteredAt: true,
        fechaInicio: true,
        estatus: true,
        anNumber: true,
        titulo: true,
      },
    });
    if (!activity) {
      return { handled: false, direction: 'entry', userId: user.id, reason: 'ot_missing' };
    }

    const data: {
      acsEnteredAt?: Date;
      acsEnteredByUserId?: number;
      acsEntryDoor?: string;
      acsLeftSite?: boolean;
      fechaInicio?: Date;
      estatus?: string;
    } = {};

    if (!activity.acsEnteredAt) {
      data.acsEnteredAt = at;
      data.acsEnteredByUserId = user.id;
      data.acsEntryDoor = door;
      data.acsLeftSite = false;
    }
    if (!activity.fechaInicio) {
      data.fechaInicio = at;
    }
    const closed = new Set(closedStatusVariants());
    if (
      !closed.has(activity.estatus) &&
      (statusVariants(ACTIVITY_STATUS.PENDIENTE).includes(activity.estatus) ||
        statusVariants(ACTIVITY_STATUS.ASIGNADA).includes(activity.estatus) ||
        /programada|pendiente|asignada/i.test(activity.estatus))
    ) {
      data.estatus = ACTIVITY_STATUS.EN_PROCESO;
    }

    if (Object.keys(data).length) {
      await this.prisma.activity.update({ where: { id: activityId }, data });
    }

    await this.stampAssignee(activityId, site.companyId, user.id, {
      acsEnteredAt: at,
      acsEntryDoor: door,
      acsLeftSite: false,
      clearExit: true,
    });

    this.logger.log(
      `ACS check-in OT #${activityId} (${activity.anNumber}) user=${user.id} door=${door}`,
    );

    return {
      handled: true,
      direction: 'entry',
      userId: user.id,
      activityId,
      action: activity.acsEnteredAt ? 'assignee_stamp' : 'checkin',
    };
  }

  private async onExit(
    site: { companyId: number },
    ev: AcsOpsEventInput,
  ): Promise<AcsOpsBridgeResult> {
    const user = await this.resolveUser(site.companyId, ev.personId);
    if (!user) {
      return { handled: false, direction: 'exit', reason: 'sin_empleado' };
    }

    // Preferir OT con entrada ACS hoy; si no, OT abierta del equipo.
    const activityId =
      (await this.findLinkedOpenActivityId(site.companyId, user.id)) ??
      (await this.findTodayActivityId(site.companyId, user.id, ev.occurredAt));
    if (!activityId) {
      return {
        handled: false,
        direction: 'exit',
        userId: user.id,
        reason: 'sin_ot',
      };
    }

    const at = ev.occurredAt;
    await this.prisma.activity.updateMany({
      where: { id: activityId, companyId: site.companyId },
      data: {
        acsExitedAt: at,
        acsLeftSite: true,
      },
    });

    await this.stampAssignee(activityId, site.companyId, user.id, {
      acsExitedAt: at,
      acsLeftSite: true,
    });

    this.logger.log(`ACS check-out OT #${activityId} user=${user.id}`);
    return {
      handled: true,
      direction: 'exit',
      userId: user.id,
      activityId,
      action: 'checkout',
    };
  }

  private async onDenied(
    site: { companyId: number },
    ev: AcsOpsEventInput,
  ): Promise<AcsOpsBridgeResult> {
    if (!this.notifyDeniedEnabled()) {
      return { handled: false, direction: 'denied', reason: 'notify_off' };
    }

    const user = await this.resolveUser(site.companyId, ev.personId);
    const activityId = user
      ? await this.findTodayActivityId(site.companyId, user.id, ev.occurredAt)
      : null;

    const who = ev.personName || ev.personId || 'Persona desconocida';
    const door = ev.deviceName || `puerta ${ev.doorNo ?? '?'}`;
    const title = 'Acceso denegado (ACS)';
    const message = activityId
      ? `${who} fue denegado en ${door}. Tiene OT #${activityId} asignada hoy.`
      : `${who} fue denegado en ${door}.`;

    const notifyIds = new Set<number>();
    if (activityId) {
      const act = await this.prisma.activity.findFirst({
        where: { id: activityId, companyId: site.companyId },
        select: { responsableId: true, creadoPorId: true },
      });
      if (act?.responsableId) notifyIds.add(act.responsableId);
      if (act?.creadoPorId) notifyIds.add(act.creadoPorId);
    }

    // Coordinación / dirección ops del tenant (roleKey).
    const coords = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roleKey: { in: ['coord_operaciones', 'dir_operaciones', 'ceo'] },
        companyMemberships: { some: { companyId: site.companyId } },
      },
      select: { id: true },
      take: 12,
    });
    for (const c of coords) notifyIds.add(c.id);

    if (!notifyIds.size) {
      return { handled: false, direction: 'denied', reason: 'sin_destinatarios' };
    }

    await Promise.all(
      [...notifyIds].map((userId) =>
        this.notifications.createNotification({
          userId,
          companyId: site.companyId,
          type: 'ACS_ACCESS_DENIED',
          category: 'ops-acs',
          title,
          message,
          relatedEntityId: activityId ?? undefined,
          entityType: activityId ? 'Activity' : 'IntegraPushEvent',
          relatedUrl: activityId ? `/ops/activities/${activityId}` : '/integra/events',
          priority: 'high',
        }),
      ),
    );

    return {
      handled: true,
      direction: 'denied',
      userId: user?.id,
      activityId: activityId ?? undefined,
      action: 'notify',
    };
  }

  private async resolveUser(
    companyId: number,
    personId?: string | null,
  ): Promise<{ id: number; nombre: string } | null> {
    const key = normalizeEmpKey(personId);
    if (!key) return null;

    const membership = await this.prisma.userCompany.findFirst({
      where: {
        companyId,
        OR: [
          { employeeNumber: { equals: personId!, mode: 'insensitive' } },
          { user: { employeeNumber: { equals: personId!, mode: 'insensitive' } } },
        ],
      },
      select: { user: { select: { id: true, nombre: true, isActive: true } } },
    });
    if (membership?.user?.isActive) {
      return { id: membership.user.id, nombre: membership.user.nombre };
    }

    // Fallback: User.employeeNumber global + membresía al tenant.
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        employeeNumber: { equals: personId!, mode: 'insensitive' },
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, nombre: true },
    });
    return user;
  }

  private async findTodayActivityId(
    companyId: number,
    userId: number,
    at: Date,
  ): Promise<number | null> {
    const tz = 'America/Mexico_City';
    const day = dayKeyInTz(at, tz);
    const closed = closedStatusVariants();

    const rows = await this.prisma.activity.findMany({
      where: {
        companyId,
        deletedAt: null,
        estatus: { notIn: closed },
        OR: [
          { responsableId: userId },
          { assignees: { some: { userId, retiradoAt: null } } },
        ],
      },
      select: {
        id: true,
        fechaAsignacion: true,
        fechaEntregaEsperada: true,
        fechaInicio: true,
        fechaMaxima: true,
        acsEnteredAt: true,
      },
      orderBy: [{ fechaEntregaEsperada: 'asc' }, { id: 'desc' }],
      take: 40,
    });

    return pickTodayActivityId(rows, day, tz);
  }

  /** OT abierta donde ya hubo entrada ACS de este usuario (assignee o activity). */
  private async findLinkedOpenActivityId(
    companyId: number,
    userId: number,
  ): Promise<number | null> {
    const closed = closedStatusVariants();
    const byAssignee = await this.prisma.activityAssignee.findFirst({
      where: {
        companyId,
        userId,
        retiradoAt: null,
        acsEnteredAt: { not: null },
        acsLeftSite: false,
        activity: { deletedAt: null, estatus: { notIn: closed } },
      },
      orderBy: { acsEnteredAt: 'desc' },
      select: { activityId: true },
    });
    if (byAssignee) return byAssignee.activityId;

    const byActivity = await this.prisma.activity.findFirst({
      where: {
        companyId,
        deletedAt: null,
        estatus: { notIn: closed },
        acsEnteredByUserId: userId,
        acsEnteredAt: { not: null },
        acsLeftSite: false,
      },
      orderBy: { acsEnteredAt: 'desc' },
      select: { id: true },
    });
    return byActivity?.id ?? null;
  }

  private async stampAssignee(
    activityId: number,
    companyId: number,
    userId: number,
    opts: {
      acsEnteredAt?: Date;
      acsExitedAt?: Date;
      acsLeftSite?: boolean;
      acsEntryDoor?: string;
      clearExit?: boolean;
    },
  ) {
    const existing = await this.prisma.activityAssignee.findUnique({
      where: { activityId_userId: { activityId, userId } },
      select: { id: true, acsEnteredAt: true },
    });
    if (!existing) return;

    const data: Record<string, unknown> = {};
    if (opts.acsEnteredAt && !existing.acsEnteredAt) {
      data.acsEnteredAt = opts.acsEnteredAt;
      if (opts.acsEntryDoor) data.acsEntryDoor = opts.acsEntryDoor;
    }
    if (opts.clearExit) {
      data.acsExitedAt = null;
      data.acsLeftSite = false;
    }
    if (opts.acsExitedAt) data.acsExitedAt = opts.acsExitedAt;
    if (opts.acsLeftSite != null) data.acsLeftSite = opts.acsLeftSite;
    if (opts.acsEntryDoor && !data.acsEntryDoor && !existing.acsEnteredAt) {
      data.acsEntryDoor = opts.acsEntryDoor;
    }
    if (!Object.keys(data).length) return;

    await this.prisma.activityAssignee.update({
      where: { id: existing.id },
      data: { ...data, companyId },
    });
  }
}
