import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestCompanyId } from '../common/tenant/tenant-context.js';
import { appUrls } from '../common/app-urls.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { expectedStartHm, isLateVsSchedule } from '../attendance/attendance-hybrid.match.js';
import { buildAccessScheduleAssignment } from '../integra/access-schedule-defaults.js';
import {
  portalTicketActionNotifyMeta,
  portalTicketCommentNotifyMeta,
  supportRequestStaffUrl,
  type PortalTicketClientAction,
} from './portal-ticket-notify.js';

/** 8:02 a. m. en la zona de la jornada. */
function horaMexico(d: Date): string {
  return d.toLocaleTimeString('es-MX', { timeZone: WORKDAY_TIMEZONE, hour: 'numeric', minute: '2-digit' });
}

/**
 * Servicio que maneja notificaciones jerárquicas
 * Determina a quién notificar en la cadena de mando
 */
@Injectable()
export class NotificationHierarchyService {
  private readonly logger = new Logger(NotificationHierarchyService.name);
  /** Correos con visión global (equivalente a “superadmin” de plataforma). */
  private readonly platformSuperEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtener supervisores/administradores de un usuario
   */
  private async getSupervisors(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          department: {
            include: {
              users: {
                include: { role: true },
              },
            },
          },
          role: true,
        },
      });

      if (!user) return [];

      // Obtener administradores de la consola (ADMIN y SUPERADMIN)
      // Check for any role relationship indicating admin/supervisor status
      const supervisors = user.department?.users?.filter(u => {
        const isAdmin = u.role && (u.role as any)?.accesoConsoleAdmin === true;
        return u.id !== userId && isAdmin;
      }) ?? [];

      return supervisors;
    } catch (error) {
      this.logger.error(`Error getting supervisors for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Acota una búsqueda de destinatarios a la empresa en curso.
   *
   * `User` no lleva `companyId` —la pertenencia vive en `UserCompany`— así que
   * el middleware de aislamiento no puede acotarla, y estas búsquedas devolvían
   * los administradores de **todas** las empresas. Hoy sólo existe una, así que
   * no se nota; el día que se dé de alta la segunda, sus administradores
   * recibirían las notificaciones de la primera, con folios e importes dentro.
   *
   * Fuera de una petición HTTP —tareas programadas— no hay empresa en contexto
   * y devuelve filtro vacío, que es el comportamiento de siempre.
   *
   * No se aplica a los dueños de plataforma: esos sí ven todas las empresas a
   * propósito.
   */
  private companyScope() {
    const companyId = getRequestCompanyId();
    return companyId ? { companyMemberships: { some: { companyId } } } : {};
  }

  /**
   * Obtener solo SuperAdmins
   */
  private async getSuperAdmins() {
    try {
      return await this.prisma.user.findMany({
        where: {
          role: {
            accesoConsoleAdmin: true,
          },
          ...this.companyScope(),
        },
      });
    } catch {
      return [];
    }
  }

  /** Christian (CEO): todo aviso de actividades le llega también a él. */
  private async getCeoUserIds(): Promise<number[]> {
    try {
      const rows = await this.prisma.user.findMany({
        where: { email: 'gerencia@nexara.com.mx', isActive: true },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }

  /**
   * Notificar entrada/salida de usuario a su supervisor
   * Usuario entra -> Notificar al admin del depto
   * Admin entra -> Notificar al SuperAdmin
   */
  async notifyAttendanceChange(
    userId: number,
    type: 'ATTENDANCE_CHECKIN' | 'ATTENDANCE_CHECKOUT',
    userName: string,
    deviceInfo?: string,
    at: Date = new Date(),
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          nombre: true,
          employeeNumber: true,
          roleKey: true,
          tipoContrato: true,
          role: { select: { orgRoleKey: true } },
        },
      });
      if (!user) return;

      const nombre = user.nombre || userName;
      const entrada = type === 'ATTENDANCE_CHECKIN';
      const hora = horaMexico(at);
      const lugar = deviceInfo ? ` · ${deviceInfo}` : '';

      // Retardo contra su plantilla (oficina 09:00, contratista 08:00, con 15 min de gracia).
      let horarioEsperado: string | null = null;
      if (entrada) {
        const plantilla = buildAccessScheduleAssignment({
          employeeNumber: user.employeeNumber,
          isActive: true,
          roleKey: user.roleKey,
          orgRoleKey: user.role?.orgRoleKey,
          tipoContrato: user.tipoContrato,
        });
        if (isLateVsSchedule(at.toISOString(), plantilla.key)) {
          horarioEsperado = expectedStartHm(plantilla.key);
        }
      }

      const title = !entrada
        ? `🔴 ${nombre} terminó su jornada`
        : horarioEsperado
          ? `🟠 ${nombre} entró a trabajar con retardo`
          : `🟢 ${nombre} entró a trabajar`;
      const message = !entrada
        ? `Salida a las ${hora}${lugar}`
        : horarioEsperado
          ? `Entrada a las ${hora}; su horario es a las ${horarioEsperado}${lugar}`
          : `Entrada a las ${hora}${lugar}`;

      for (const id of await this.shiftWatcherIds(userId)) {
        await this.notificationsService.createNotification({
          userId: id,
          type,
          category: 'attendance',
          title,
          message,
          triggerUserId: userId,
          relatedEntityId: userId,
          entityType: 'User',
          relatedUrl: appUrls.erpAttendance(undefined, userId),
          priority: horarioEsperado ? 'high' : 'normal',
          dedupeSeconds: 60,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying attendance change:`, error);
    }
  }

  /**
   * Quienes siguen la jornada de alguien: sus jefes por organigrama (Antonio → Luis → …),
   * Christian y los administradores de su departamento.
   */
  private async shiftWatcherIds(userId: number): Promise<number[]> {
    const ids = new Set<number>(await this.lunchReviewerIds(userId));
    for (const s of await this.getSupervisors(userId)) ids.add(s.id);
    ids.delete(userId);
    return [...ids];
  }

  /**
   * Notificar entrada/regreso de comida
   */
  async notifyLunchBreakChange(
    userId: number,
    type: 'LUNCH_CHECKIN' | 'LUNCH_CHECKOUT',
    userName: string,
  ) {
    try {
      const sale = type === 'LUNCH_CHECKIN';
      const hora = horaMexico(new Date());
      for (const id of await this.shiftWatcherIds(userId)) {
        await this.notificationsService.createNotification({
          userId: id,
          type,
          category: 'lunch_breaks',
          title: sale ? `🍽️ ${userName} salió a comer` : `↩️ ${userName} regresó de comer`,
          message: sale ? `Salida a comer a las ${hora}` : `Regreso a las ${hora}`,
          triggerUserId: userId,
          relatedEntityId: userId,
          entityType: 'User',
          relatedUrl: appUrls.erpLunchBreaks(userId),
          dedupeSeconds: 60,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying lunch break change:`, error);
    }
  }

  /**
   * Notificar que un ingeniero inició trabajo en campo (estatus → En Proceso).
   * Supervisor ve quién arrancó qué OT.
   */
  async notifyActivityStarted(
    actorId: number,
    activityId: number,
    activityTitle: string,
    actorName: string,
    responsableId?: number | null,
  ) {
    try {
      const url = appUrls.opsActivity(activityId);
      const supervisors = await this.getSupervisors(actorId);
      const targets = new Set<number>();
      for (const s of supervisors) targets.add(s.id);
      if (responsableId && responsableId !== actorId) targets.add(responsableId);
      for (const ceoId of await this.getCeoUserIds()) {
        if (ceoId !== actorId) targets.add(ceoId);
      }

      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_STARTED',
          category: 'activities',
          title: 'OT iniciada en campo',
          message: `${actorName} inició "${activityTitle}"`,
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: url,
          priority: 'normal',
          channel: 'ops',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying activity started:`, error);
    }
  }

  /**
   * Avance en campo paso a paso: «Alejandro inició AN-0001», «subió 4 fotos», «subió la hoja de
   * servicio», «llenó el formulario». Lo reciben el responsable, quien la creó, los encargados de
   * la actividad, los jefes por organigrama de quien la hace y Christian. En el teléfono cada
   * paso reemplaza al anterior de la misma persona y actividad, así no se amontonan.
   * (La salida y «lista para revisión» las avisa `notifyEvidenceSubmitted`.)
   */
  async notifyActivityProgress(params: {
    activityId: number;
    actorId: number;
    paso: 'inicio' | 'evidencias' | 'hoja' | 'formulario';
    fotos?: number;
    at?: Date;
  }) {
    const { activityId, actorId, paso } = params;
    try {
      const [activity, actor, leads] = await Promise.all([
        this.prisma.activity.findUnique({
          where: { id: activityId },
          select: {
            anNumber: true,
            titulo: true,
            responsableId: true,
            creadoPorId: true,
            client: { select: { name: true } },
          },
        }),
        this.prisma.user.findUnique({ where: { id: actorId }, select: { nombre: true } }),
        this.prisma.activityAssignee.findMany({
          where: { activityId, rol: 'LEAD', retiradoAt: null },
          select: { userId: true },
        }),
      ]);
      if (!activity) return;

      const nombre = actor?.nombre || 'Alguien del equipo';
      const ref = activity.anNumber || `Actividad ${activityId}`;
      const cliente = activity.client?.name ? ` · ${activity.client.name}` : '';
      const hora = horaMexico(params.at ?? new Date());
      const fotos = params.fotos ?? 0;

      const title = {
        inicio: `▶️ ${nombre} inició ${ref}`,
        evidencias: `📷 ${nombre} subió ${fotos === 1 ? '1 foto' : `${fotos} fotos`} de evidencia`,
        hoja: `📄 ${nombre} subió la hoja de servicio`,
        formulario: `📝 ${nombre} llenó el formulario de servicio`,
      }[paso];
      const message =
        paso === 'inicio'
          ? `Llegó a las ${hora} · ${activity.titulo}${cliente}`
          : `${ref} · ${activity.titulo}${cliente}`;

      const targets = new Set<number>(await this.lunchReviewerIds(actorId));
      if (activity.responsableId) targets.add(activity.responsableId);
      if (activity.creadoPorId) targets.add(activity.creadoPorId);
      for (const l of leads) targets.add(l.userId);
      targets.delete(actorId);

      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_STARTED',
          category: 'activities',
          title,
          message,
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}`,
          priority: paso === 'inicio' ? 'high' : 'normal',
          channel: 'ops',
          // Mismo aviso en el teléfono para toda la visita de esta persona a esta actividad.
          collapseKey: `nx_act_${activityId}_by${actorId}`,
          // El inicio se deduplica con el de «En Proceso»; los pasos siguientes no se descartan.
          dedupeSeconds: paso === 'inicio' ? 120 : 0,
        });
      }
    } catch (error) {
      this.logger.error(`notifyActivityProgress ${paso}`, error);
    }
  }

  /** Admins de consola + cuentas plataforma (solicitudes de soporte sin actor User). */
  private async getSupportStaffRecipientIds(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { accesoConsoleAdmin: true }, ...this.companyScope() },
          { email: { in: this.platformSuperEmails.map((e) => e.toLowerCase()) } },
        ],
      },
      select: { id: true },
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  /**
   * Cliente comentó una OT desde el portal → staff (responsable + fallback soporte).
   */
  async notifyPortalTicketComment(params: {
    activityId: number;
    anNumber?: string | null;
    message: string;
    responsableId?: number | null;
    companyId?: number | null;
  }) {
    try {
      const meta = portalTicketCommentNotifyMeta(params.activityId, params.anNumber, params.message);
      const targets = new Set<number>();
      if (params.responsableId) targets.add(params.responsableId);
      if (targets.size === 0) {
        for (const id of await this.getSupportStaffRecipientIds()) targets.add(id);
      } else if (params.responsableId) {
        for (const s of await this.getSupervisors(params.responsableId)) targets.add(s.id);
      }

      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: meta.type,
          category: meta.category,
          channel: meta.channel,
          title: meta.title,
          message: meta.message,
          relatedEntityId: params.activityId,
          entityType: meta.entityType,
          relatedUrl: meta.relatedUrl,
          companyId: params.companyId,
          priority: 'high',
          excludeActor: true,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying portal ticket comment:`, error);
    }
  }

  /**
   * Cliente ACK / confirmó resolución / pidió reapertura → staff.
   */
  async notifyPortalTicketClientAction(params: {
    action: PortalTicketClientAction;
    activityId: number;
    anNumber?: string | null;
    title?: string | null;
    note?: string;
    responsableId?: number | null;
    companyId?: number | null;
  }) {
    try {
      const meta = portalTicketActionNotifyMeta(
        params.action,
        params.activityId,
        params.anNumber,
        params.title,
        params.note,
      );
      const targets = new Set<number>();
      if (params.responsableId) targets.add(params.responsableId);
      if (params.action === 'REQUEST_REOPEN') {
        for (const id of await this.getSupportStaffRecipientIds()) targets.add(id);
      }
      if (targets.size === 0) {
        for (const id of await this.getSupportStaffRecipientIds()) targets.add(id);
      }

      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: meta.type,
          category: meta.category,
          channel: meta.channel,
          title: meta.title,
          message: meta.message,
          relatedEntityId: params.activityId,
          entityType: meta.entityType,
          relatedUrl: meta.relatedUrl,
          companyId: params.companyId,
          priority: meta.priority,
          excludeActor: true,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying portal ticket client action:`, error);
    }
  }

  /** Nueva solicitud de soporte desde portal → staff (ops/support). */
  async notifySupportRequestCreated(params: {
    requestId: number;
    description: string;
    clientName?: string | null;
    companyId: number;
    urgency?: string | null;
  }) {
    try {
      const who = (params.clientName && params.clientName.trim()) || 'Cliente';
      const urg = params.urgency ? ` [${params.urgency}]` : '';
      const url = supportRequestStaffUrl(params.requestId);
      for (const userId of await this.getSupportStaffRecipientIds()) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_ASSIGNED',
          category: 'tickets',
          channel: 'tickets',
          title: `Nueva solicitud de soporte${urg}`,
          message: `${who}: ${params.description.slice(0, 240)}`,
          relatedEntityId: params.requestId,
          entityType: 'ClientTicketRequest',
          relatedUrl: url,
          companyId: params.companyId,
          priority: params.urgency === 'HIGH' ? 'high' : 'normal',
          excludeActor: true,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying support request created:`, error);
    }
  }

  /**
   * Staff cambió estatus de ClientTicketRequest → responsable de la OT vinculada.
   */
  async notifySupportRequestStatusChanged(params: {
    requestId: number;
    status: string;
    actorUserId: number;
    activityResponsableId?: number | null;
    description?: string | null;
    companyId?: number | null;
  }) {
    try {
      if (
        !params.activityResponsableId ||
        params.activityResponsableId === params.actorUserId
      ) {
        return;
      }
      const url = supportRequestStaffUrl(params.requestId);
      await this.notificationsService.createNotification({
        userId: params.activityResponsableId,
        type: 'ACTIVITY_ASSIGNED',
        category: 'tickets',
        channel: 'tickets',
        title: `Soporte → ${params.status}`,
        message: (params.description || `Solicitud #${params.requestId}`).slice(0, 280),
        triggerUserId: params.actorUserId,
        relatedEntityId: params.requestId,
        entityType: 'ClientTicketRequest',
        relatedUrl: url,
        companyId: params.companyId,
        excludeActor: true,
      });
    } catch (error) {
      this.logger.error(`Error notifying support request status:`, error);
    }
  }

  /**
   * Notificar asignación de actividad
   * Usuario asignado -> Recibe notificación
   * Admin -> Notificación que se asignó una actividad
   */
  async notifyActivityAssigned(
    userId: number,
    activityId: number,
    activityTitle: string,
    assignedByName: string,
    assignedById?: number | null,
  ) {
    try {
      const [activity, asignado] = await Promise.all([
        this.prisma.activity.findUnique({
          where: { id: activityId },
          select: {
            anNumber: true,
            titulo: true,
            fechaInicio: true,
            client: { select: { name: true } },
          },
        }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { nombre: true } }),
      ]);
      const ref = activity?.anNumber || activityTitle;
      const titulo = activity?.titulo ? ` · ${activity.titulo}` : '';
      const cliente = activity?.client?.name ? ` · ${activity.client.name}` : '';
      const cuando = activity?.fechaInicio
        ? ` · ${activity.fechaInicio.toLocaleString('es-MX', {
            timeZone: WORKDAY_TIMEZONE,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}`
        : '';
      const url = `/erp/actividades/${activityId}`;
      // Quien asigna no recibe su propio aviso (p. ej. al asignarse una tarea a sí mismo).
      const actor = assignedById ?? undefined;

      await this.notificationsService.createNotification({
        userId,
        type: 'ACTIVITY_ASSIGNED',
        category: 'activities',
        title: `✨ Nueva actividad: ${ref}`,
        message: `${assignedByName} te asignó${titulo}${cliente}${cuando}`.replace('asignó · ', 'asignó '),
        triggerUserId: actor,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: url,
        priority: 'high',
      });

      // Sus jefes por organigrama, Christian y los administradores de su departamento.
      const nombreAsignado = asignado?.nombre || 'alguien del equipo';
      for (const id of await this.shiftWatcherIds(userId)) {
        if (id === assignedById) continue;
        await this.notificationsService.createNotification({
          userId: id,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: `📌 ${assignedByName} asignó ${ref} a ${nombreAsignado}`,
          message: `${activity?.titulo || activityTitle}${cliente}${cuando}`,
          triggerUserId: actor,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: url,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying activity assigned:`, error);
    }
  }

  /**
   * Notificar aprobación/rechazo de actividad
   */
  async notifyActivityReview(
    userId: number,
    activityId: number,
    activityTitle: string,
    status: 'approved' | 'rejected',
    reviewerName: string,
    reason?: string,
  ) {
    try {
      const type = status === 'approved' ? 'ACTIVITY_APPROVED' : 'ACTIVITY_REJECTED';
      const title = status === 'approved' ? '✅ Actividad aprobada' : '❌ Actividad rechazada';
      const message = status === 'approved'
        ? `Tu actividad "${activityTitle}" ha sido aprobada por ${reviewerName}`
        : `Tu actividad "${activityTitle}" ha sido rechazada. ${reason ? `Razón: ${reason}` : 'Por favor revísala y corrígela.'}`;

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'activities',
        title,
        message,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/ops/activities/${activityId}`,
        priority: status === 'rejected' ? 'high' : 'normal',
      });
    } catch (error) {
      this.logger.error(`Error notifying activity review:`, error);
    }
  }

  /**
   * Revisores de evidencias: superadmins de plataforma, admins de consola, rol con acceso evidencias, y supervisores de depto.
   */
  private async getEvidenceReviewerUserIds(excludeUserId?: number): Promise<number[]> {
    const protectedEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];
    const rows = await this.prisma.user.findMany({
      where: {
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        OR: [
          // Los correos protegidos son dueños de plataforma: ven todas las
          // empresas a proposito, por eso van fuera del filtro de empresa.
          { email: { in: protectedEmails } },
          { role: { accesoConsoleAdmin: true }, ...this.companyScope() },
          { role: { accesoEvidencias: true }, ...this.companyScope() },
        ],
      },
      select: { id: true },
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  /**
   * Flujo de evidencias completado (listo para revisión administrativa)
   */
  async notifyEvidenceSubmitted(
    submitterUserId: number,
    activityId: number,
    activityTitle: string,
    submitterName: string,
    anNumber?: string | null,
    /** Responsable (p. ej. Luis) que da seguimiento aunque no revise evidencias. */
    responsableId?: number | null,
    /** Encargados de la cadena y jefe directo: también revisan. */
    reviewerIds: number[] = [],
    /** Es la corrección de algo que se le devolvió. */
    correccion = false,
  ) {
    try {
      const ref = (anNumber && String(anNumber).trim()) || `ID ${activityId}`;
      const titleAct = (activityTitle && String(activityTitle).trim()) || `Actividad ${ref}`;
      const message = correccion
        ? `${submitterName} corrigió lo que se le devolvió en "${titleAct}" (${ref}). Revísalo de nuevo: apruébalo o devuélvelo.`
        : `${submitterName} completó el flujo de evidencias de "${titleAct}" (${ref}). Entra a revisarla.`;

      const recipientIds = new Set(await this.getEvidenceReviewerUserIds(submitterUserId));
      for (const sup of await this.getSupervisors(submitterUserId)) {
        recipientIds.add(sup.id);
      }
      if (responsableId && responsableId !== submitterUserId) recipientIds.add(responsableId);
      for (const id of reviewerIds) {
        if (id && id !== submitterUserId) recipientIds.add(id);
      }
      for (const ceoId of await this.getCeoUserIds()) {
        if (ceoId !== submitterUserId) recipientIds.add(ceoId);
      }

      for (const uid of recipientIds) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'EVIDENCE_SUBMITTED',
          category: 'evidences',
          title: correccion ? '🔁 Corrección lista para revisión' : '📋 Evidencia lista para revisión',
          message,
          triggerUserId: submitterUserId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}/evidencias`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying evidence submitted:`, error);
    }
  }

  /**
   * Notificar aprobación/rechazo de evidencia al responsable de la actividad
   */
  async notifyEvidenceReview(
    responsableUserId: number,
    activityId: number,
    activityTitle: string,
    status: 'approved' | 'rejected',
    reviewerName: string,
    notes?: string,
    /** Además del responsable: quien subió la evidencia (y Christian se agrega solo). */
    alsoNotify: number[] = [],
    reviewerId?: number | null,
    /** Calificación (1–5), pasos devueltos, si se devolvió todo y si la actividad quedó finalizada. */
    extra: { score?: number | null; steps?: string[]; full?: boolean; closed?: boolean } = {},
  ) {
    try {
      const type = status === 'approved' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED';
      const title =
        status === 'approved'
          ? extra.closed
            ? '✅ Actividad aprobada y finalizada'
            : '✅ Evidencia aprobada'
          : extra.full
            ? '↩️ Evidencia devuelta: rehacer desde cero'
            : '↩️ Evidencia devuelta para corregir';
      const base = (activityTitle && String(activityTitle).trim()) || `Actividad ${activityId}`;
      const stepNames: Record<string, string> = {
        ENTRY_PHOTO: 'foto de entrada',
        EVIDENCE_PHOTOS: 'fotos en sitio',
        SERVICE_SHEET_PDF: 'hoja de servicio PDF',
        SERVICE_SHEET_DATA: 'formulario',
        EXIT_PHOTO: 'foto de salida',
      };
      const pasos = (extra.steps ?? []).map((s) => stepNames[s] ?? s).join(', ');
      const calif = extra.score ? ` Calificación: ${extra.score}/5.` : '';
      const obs = notes ? ` Observaciones: ${notes}` : '';
      const message =
        status === 'approved'
          ? `${reviewerName} aprobó la evidencia de "${base}".${extra.closed ? ' La actividad quedó finalizada.' : ''}${calif}${obs}`
          : extra.full
            ? `${reviewerName} devolvió toda la evidencia de "${base}": hay que rehacerla desde cero.${calif}${obs}`
            : `${reviewerName} devolvió "${base}" para corregir${pasos ? `: ${pasos}` : ''}.${calif}${obs}`;

      const recipients = new Set<number>([responsableUserId, ...alsoNotify]);
      for (const ceoId of await this.getCeoUserIds()) recipients.add(ceoId);
      if (reviewerId) recipients.delete(reviewerId);
      for (const uid of recipients) {
        if (!uid) continue;
        await this.notificationsService.createNotification({
          userId: uid,
          type,
          category: 'evidences',
          title,
          message,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}/evidencias`,
          priority: status === 'rejected' ? 'high' : 'normal',
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying evidence review:`, error);
    }
  }

  /**
   * Despacho / asignación a equipo: avisa a quien recibe, al responsable (Luis) y a Christian.
   */
  async notifyActivityDispatched(params: {
    activityId: number;
    label: string;
    actorId: number | null;
    memberId: number;
    memberName: string;
    responsableId: number | null;
    /** En despacho el que recibe como LEAD solo reparte. */
    reparte: boolean;
  }) {
    try {
      const { activityId, label, actorId, memberId, memberName, responsableId, reparte } = params;
      const actorName = actorId ? await this.resolveActorName(actorId) : 'Dirección';
      const url = `/erp/actividades/${activityId}`;

      if (memberId !== actorId) {
        await this.notificationsService.createNotification({
          userId: memberId,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: reparte ? '📨 Te pasaron una actividad para repartir' : '✨ Nueva actividad asignada',
          message: reparte
            ? `${actorName} te pasó «${label}». Repártela a tu equipo.`
            : `${actorName} te asignó «${label}». Tú la ejecutas.`,
          triggerUserId: actorId ?? undefined,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: url,
          priority: 'high',
          dedupeSeconds: 0,
        });
      }

      const seguimiento = new Set<number>(await this.getCeoUserIds());
      if (responsableId) seguimiento.add(responsableId);
      seguimiento.delete(memberId);
      if (actorId) seguimiento.delete(actorId);
      for (const uid of seguimiento) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: 'Despacho registrado',
          message: `${actorName} pasó «${label}» a ${memberName}.`,
          triggerUserId: actorId ?? undefined,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: url,
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityDispatched', error);
    }
  }

  /** Jefes por organigrama (managerId hacia arriba) y Christian: quienes aprueban comidas a destiempo. */
  private async lunchReviewerIds(userId: number): Promise<number[]> {
    const ids = new Set<number>(await this.getCeoUserIds());
    const vistos = new Set<number>([userId]);
    let cur = (await this.prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } }))
      ?.managerId;
    while (cur != null && !vistos.has(cur)) {
      ids.add(cur);
      vistos.add(cur);
      cur = (await this.prisma.user.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId;
    }
    ids.delete(userId);
    return [...ids];
  }

  /** Comida a destiempo: sus jefes y Christian reciben el motivo para aprobarla o rechazarla. */
  async notifyLunchLate(params: {
    userId: number;
    userName: string;
    momento: 'salida' | 'regreso';
    hora: Date;
    justificacion: string;
    lunchId: number;
  }) {
    try {
      const hora = params.hora.toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
      });
      const accion = params.momento === 'salida' ? 'salió a comer' : 'regresó de comer';
      for (const uid of await this.lunchReviewerIds(params.userId)) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: params.momento === 'salida' ? 'LUNCH_CHECKIN' : 'LUNCH_CHECKOUT',
          category: 'lunch_breaks',
          title: '⏰ Comida a destiempo por aprobar',
          message: `${params.userName} ${accion} a las ${hora}, fuera de 3 a 4 p.m.: «${params.justificacion}». Apruébala o recházala.`,
          triggerUserId: params.userId,
          relatedEntityId: params.lunchId,
          entityType: 'LunchBreak',
          relatedUrl: '/erp/asistencias?tab=comidas',
          priority: 'high',
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyLunchLate', error);
    }
  }

  /** Resultado de la revisión de una comida a destiempo, para quien comió. */
  async notifyLunchReviewed(params: {
    userId: number;
    reviewerId: number;
    aprobada: boolean;
    notas: string | null;
    lunchId: number;
  }) {
    try {
      const quien = await this.resolveActorName(params.reviewerId);
      await this.notificationsService.createNotification({
        userId: params.userId,
        type: 'LUNCH_CHECKOUT',
        category: 'lunch_breaks',
        title: params.aprobada ? '✅ Aprobaron tu comida a destiempo' : '❌ Rechazaron tu comida a destiempo',
        message: `${quien} ${params.aprobada ? 'aprobó' : 'rechazó'} tu justificación.${params.notas ? ` «${params.notas}»` : ''}`,
        triggerUserId: params.reviewerId,
        relatedEntityId: params.lunchId,
        entityType: 'LunchBreak',
        relatedUrl: '/erp/asistencias?tab=comidas',
        priority: params.aprobada ? 'normal' : 'high',
        dedupeSeconds: 0,
      });
    } catch (error) {
      this.logger.error('notifyLunchReviewed', error);
    }
  }

  /** Todo el equipo subió su evidencia (queda Por Validar): responsable y Christian. */
  async notifyActivityAutoCompleted(
    activityId: number,
    label: string,
    responsableId: number | null,
    lastUserId?: number | null,
  ) {
    try {
      const targets = new Set<number>(await this.getCeoUserIds());
      if (responsableId) targets.add(responsableId);
      const who = lastUserId ? await this.resolveActorName(lastUserId) : null;
      for (const uid of targets) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: '📋 Actividad lista para revisión',
          message: who
            ? `«${label}»: el equipo terminó (la última evidencia la subió ${who}). Queda finalizada cuando alguien la aprueba.`
            : `«${label}»: el equipo subió todas sus evidencias. Queda finalizada cuando alguien la aprueba.`,
          triggerUserId: lastUserId ?? undefined,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}/evidencias`,
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityAutoCompleted', error);
    }
  }

  /**
   * Reasignación: el nuevo responsable recibe la actividad, el anterior sabe a quién pasó (y si
   * sigue de apoyo), y quien la creó y Christian ven el movimiento. Nadie recibe su propio aviso.
   */
  async notifyActivityReassigned(params: {
    activityId: number;
    actorId: number;
    deUsuarioId: number | null;
    aUsuarioId: number;
    motivo?: string | null;
    retiradoAnterior?: boolean;
  }) {
    const { activityId, actorId, deUsuarioId, aUsuarioId } = params;
    try {
      const [activity, personas] = await Promise.all([
        this.prisma.activity.findUnique({
          where: { id: activityId },
          select: { anNumber: true, titulo: true, creadoPorId: true, client: { select: { name: true } } },
        }),
        this.prisma.user.findMany({
          where: { id: { in: [actorId, aUsuarioId, ...(deUsuarioId ? [deUsuarioId] : [])] } },
          select: { id: true, nombre: true },
        }),
      ]);
      if (!activity) return;
      const nombreDe = (id: number | null) => personas.find((p) => p.id === id)?.nombre || 'alguien';
      const ref = activity.anNumber || `Actividad ${activityId}`;
      const cliente = activity.client?.name ? ` · ${activity.client.name}` : '';
      const motivo = params.motivo?.trim() ? ` Motivo: ${params.motivo.trim()}` : '';
      const base = {
        type: 'ACTIVITY_ASSIGNED',
        category: 'activities',
        triggerUserId: actorId,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/erp/actividades/${activityId}`,
        channel: 'ops',
        dedupeSeconds: 0,
      } as const;

      await this.notificationsService.createNotification({
        ...base,
        userId: aUsuarioId,
        title: `📌 Te reasignaron ${ref}`,
        message: `${activity.titulo}${cliente}. Te la pasó ${nombreDe(actorId)}.${motivo}`,
        priority: 'high',
      });

      if (deUsuarioId && deUsuarioId !== aUsuarioId) {
        await this.notificationsService.createNotification({
          ...base,
          userId: deUsuarioId,
          title: `🔄 ${ref} pasó a ${nombreDe(aUsuarioId)}`,
          message: `${nombreDe(actorId)} la reasignó; ${
            params.retiradoAnterior ? 'ya no estás en el equipo' : 'sigues en el equipo como apoyo'
          }.${motivo}`,
        });
      }

      const observadores = new Set<number>(await this.getCeoUserIds());
      if (activity.creadoPorId) observadores.add(activity.creadoPorId);
      observadores.delete(aUsuarioId);
      if (deUsuarioId) observadores.delete(deUsuarioId);
      for (const userId of observadores) {
        await this.notificationsService.createNotification({
          ...base,
          userId,
          title: `🔄 ${nombreDe(actorId)} reasignó ${ref}`,
          message: `${activity.titulo}${cliente}: de ${nombreDe(deUsuarioId)} a ${nombreDe(aUsuarioId)}.${motivo}`,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityReassigned', error);
    }
  }

  /** Reprogramación de día/hora: responsable, equipo y Christian (menos quien la movió). */
  async notifyActivityRescheduled(params: {
    activityId: number;
    label: string;
    actorId: number;
    de: Date | null;
    a: Date;
    motivo: string | null;
    recipientIds: number[];
  }) {
    try {
      const { activityId, label, actorId, de, a, motivo, recipientIds } = params;
      const actorName = await this.resolveActorName(actorId);
      const fmt = (d: Date) =>
        d.toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      const targets = new Set<number>([...recipientIds, ...(await this.getCeoUserIds())]);
      targets.delete(actorId);
      const message = `${actorName} movió «${label}»${de ? ` del ${fmt(de)}` : ''} al ${fmt(a)}.${
        motivo ? ` Motivo: ${motivo}` : ''
      }`;
      for (const uid of targets) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_RESCHEDULED',
          category: 'activities',
          title: '🕑 Actividad reprogramada',
          message,
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}/historial`,
          priority: 'high',
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityRescheduled', error);
    }
  }

  /**
   * Notificar solicitud de viático
   */
  async notifyViaticRequested(
    userId: number,
    viaticId: number,
    requesterName: string,
    amount: number,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'VIATICO_ASSIGNED',
          category: 'viatics',
          title: '💰 Solicitud de viático',
          message: `${requesterName} solicitó un viático de $${amount.toFixed(2)}`,
          relatedEntityId: viaticId,
          entityType: 'Viatico',
          relatedUrl: `/ops/viatics?highlight=${viaticId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying viatico requested:`, error);
    }
  }

  /** Notifica al beneficiario cuando un manager le asigna un viático. */
  async notifyViaticAssignedToUser(
    userId: number,
    viaticId: number,
    assignerName: string,
    amount: number,
    motivo?: string | null,
  ) {
    try {
      const detail = motivo ? ` · ${motivo}` : '';
      await this.notificationsService.createNotification({
        userId,
        type: 'VIATICO_ASSIGNED',
        category: 'viatics',
        title: '💳 Viático asignado',
        message: `${assignerName} te asignó un viático de $${amount.toFixed(2)}${detail}`,
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/ops/my-viatics?highlight=${viaticId}`,
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying viatico assigned to user:`, error);
    }
  }

  /**
   * Notificar aprobación/rechazo de viático
   */
  async notifyViaticReview(
    userId: number,
    viaticId: number,
    status: 'approved' | 'rejected',
    amount: number,
  ) {
    try {
      const type = status === 'approved' ? 'VIATICO_APPROVED' : 'VIATICO_REJECTED';
      const title = status === 'approved' ? '✅ Viático aprobado' : '❌ Viático rechazado';
      const message = status === 'approved'
        ? `Tu viático de $${amount.toFixed(2)} ha sido aprobado`
        : `Tu viático de $${amount.toFixed(2)} ha sido rechazado`;

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'viatics',
        title,
        message,
        relatedEntityId: viaticId,
        entityType: 'Viatico',
        relatedUrl: `/ops/viatics?highlight=${viaticId}`,
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying viatico review:`, error);
    }
  }

  /**
   * Notificar solicitud de herramienta
   */
  async notifyToolRequested(
    userId: number,
    toolRequestId: number,
    requesterName: string,
    toolName: string,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'TOOL_REQUESTED',
          category: 'tools',
          title: '🔨 Solicitud de herramienta',
          message: `${requesterName} solicitó: "${toolName}"`,
          relatedEntityId: toolRequestId,
          entityType: 'ToolRequest',
          relatedUrl: appUrls.opsTools(toolRequestId, 'requests'),
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying tool requested:`, error);
    }
  }

  /**
   * Notificar aprobación/rechazo de herramienta
   */
  async notifyToolReview(
    userId: number,
    toolRequestId: number,
    status: 'approved' | 'rejected',
    toolName: string,
  ) {
    try {
      const type = status === 'approved' ? 'TOOL_APPROVED' : 'TOOL_REJECTED';
      const title = status === 'approved' ? '✅ Herramienta aprobada' : '❌ Herramienta rechazada';
      const message = `Tu solicitud para "${toolName}" ha sido ${status === 'approved' ? 'aprobada' : 'rechazada'}`;

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'tools',
        title,
        message,
        relatedEntityId: toolRequestId,
        entityType: 'ToolRequest',
        relatedUrl: appUrls.opsTools(toolRequestId, 'requests'),
        priority: status === 'rejected' ? 'high' : 'normal',
      });
    } catch (error) {
      this.logger.error(`Error notifying tool review:`, error);
    }
  }

  /**
   * Notificar multa
   */
  async notifyFineCreated(
    userId: number,
    fineId: number,
    reason: string,
    amount: number,
    tipoMulta?: string,
  ) {
    try {
      // Determinar URL y mensaje según el tipo de multa
      const fineTypeMap: { [key: string]: { url: string; entityType: string; titulo: string } } = {
        asistencia: {
          url: appUrls.erpAttendance(undefined, userId),
          entityType: 'Attendance',
          titulo: '⏰ Multa por Asistencia',
        },
        vehiculo: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: '🚗 Multa por Vehículos',
        },
        herramienta: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: '🔧 Multa por Herramientas',
        },
        actividad: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: '📋 Multa por Actividades',
        },
      };

      const fineConfig = tipoMulta && fineTypeMap[tipoMulta]
        ? fineTypeMap[tipoMulta]
        : {
            url: appUrls.erpFines(fineId),
            entityType: 'Fine',
            titulo: '⚠️ Nueva Multa',
          };

      await this.notificationsService.createNotification({
        userId,
        type: 'FINE_CREATED',
        category: 'fines',
        title: fineConfig.titulo,
        message: `Se registró una multa de $${amount.toFixed(2)} por: ${reason}`,
        relatedEntityId: fineId,
        entityType: fineConfig.entityType,
        relatedUrl: fineConfig.url,
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying fine created:`, error);
    }
  }

  /**
   * Notificar documento subido en perfil
   */
  async notifyProfileDocumentUploaded(
    userId: number,
    documentType: string,
    uploaderName: string,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'PROFILE_DOCUMENT_UPLOADED',
          category: 'profile',
          title: `📄 ${documentType} subido`,
          message: `${uploaderName} subió su ${documentType} para revisión`,
          relatedUrl: `/erp/users?highlight=${userId}`,
          priority: 'normal',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying profile document uploaded:`, error);
    }
  }

  /**
   * Notificar solicitud de renovación de herramienta
   */
  async notifyToolRenewalRequested(
    userId: number,
    renewalId: number,
    requesterName: string,
    toolName: string,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'TOOL_RENEWAL_REQUESTED',
          category: 'tools',
          title: '🔄 Solicitud de renovación de herramienta',
          message: `${requesterName} solicitó renovar: "${toolName}"`,
          relatedEntityId: renewalId,
          entityType: 'ToolRenewal',
          relatedUrl: appUrls.opsTools(renewalId, 'renewals'),
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying tool renewal requested:`, error);
    }
  }

  /**
   * Aviso de vencimiento de uso de vehículo (ingeniero + aprobadores).
   */
  async notifyVehicleExpiring(
    userId: number,
    vehicleRequestId: number,
    requesterName: string,
    vehicleName: string,
    fechaFin?: Date | null,
  ) {
    try {
      const finLabel = fechaFin
        ? fechaFin.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'pronto';
      const message = `${requesterName}: el uso de "${vehicleName}" vence ${finLabel}. Solicita renovación si lo necesitas.`;

      await this.notificationsService.createNotification({
        userId,
        type: 'VEHICLE_USAGE_EXPIRING',
        category: 'vehicles',
        title: '⏰ Vehículo por vencer',
        message,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: `/ops/my-vehicles?highlight=${vehicleRequestId}`,
        priority: 'high',
      });

      const supervisors = await this.getSupervisors(userId);
      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'VEHICLE_USAGE_EXPIRING',
          category: 'vehicles',
          title: '⏰ Vehículo por vencer',
          message,
          relatedEntityId: vehicleRequestId,
          entityType: 'VehicleControl',
          relatedUrl: appUrls.opsVehicles(vehicleRequestId, 'requests'),
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying vehicle expiring:`, error);
    }
  }

  /**
   * Notificar solicitud de vehículo
   */
  async notifyVehicleRequested(
    userId: number,
    vehicleRequestId: number,
    requesterName: string,
    vehicleName: string,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'VEHICLE_DELIVERY_REQUESTED',
          category: 'vehicles',
          title: '🚗 Solicitud de vehículo',
          message: `${requesterName} solicitó: "${vehicleName}"`,
          relatedEntityId: vehicleRequestId,
          entityType: 'VehicleControl',
          relatedUrl: appUrls.opsVehicles(vehicleRequestId, 'requests'),
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying vehicle requested:`, error);
    }
  }

  /**
   * Notificar aprobación de vehículo
   */
  async notifyVehicleApproved(
    userId: number,
    vehicleRequestId: number,
    vehicleName: string,
  ) {
    try {
      await this.notificationsService.createNotification({
        userId,
        type: 'VEHICLE_DELIVERY_APPROVED',
        category: 'vehicles',
        title: '✅ Vehículo aprobado',
        message: `Tu solicitud para "${vehicleName}" ha sido aprobada`,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: appUrls.opsVehicles(vehicleRequestId, 'requests'),
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying vehicle approved:`, error);
    }
  }

  /**
   * Notificar rechazo de vehículo
   */
  async notifyVehicleRejected(
    userId: number,
    vehicleRequestId: number,
    vehicleName: string,
  ) {
    try {
      await this.notificationsService.createNotification({
        userId,
        type: 'VEHICLE_DELIVERY_REJECTED',
        category: 'vehicles',
        title: '❌ Vehículo rechazado',
        message: `Tu solicitud para "${vehicleName}" ha sido rechazada`,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: appUrls.opsVehicles(vehicleRequestId, 'requests'),
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying vehicle rejected:`, error);
    }
  }

  /**
   * Quién debe recibir el “feed operativo” cuando alguien hace un movimiento:
   * - Todos los usuarios con rol consola admin (excepto el actor).
   * - Cuentas de plataforma (gerencia/developer) por si no están en ese rol.
   * - Si el actor no es admin de consola: supervisores de su departamento.
   */
  async getOperationalOversightRecipientIds(actorId: number): Promise<number[]> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      include: { role: true },
    });
    if (!actor) return [];
    const isConsoleAdmin = Boolean((actor.role as { accesoConsoleAdmin?: boolean })?.accesoConsoleAdmin);

    const ids = new Set<number>();

    const admins = await this.prisma.user.findMany({
      where: { role: { accesoConsoleAdmin: true }, NOT: { id: actorId }, ...this.companyScope() },
      select: { id: true },
    });
    admins.forEach((u) => ids.add(u.id));

    const platformRows = await this.prisma.user.findMany({
      where: {
        email: { in: this.platformSuperEmails.map((e) => e.toLowerCase()) },
        NOT: { id: actorId },
      },
      select: { id: true },
    });
    platformRows.forEach((u) => ids.add(u.id));

    if (!isConsoleAdmin) {
      const supervisors = await this.getSupervisors(actorId);
      supervisors.forEach((s) => {
        if (s.id !== actorId) ids.add(s.id);
      });
    }

    return [...ids];
  }

  async notifySalesClientCreated(actorId: number, clientId: number, clientName: string, actorName: string) {
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} registró el cliente comercial «${clientName}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_CLIENT_CREATED',
          category: 'sales',
          title: 'Nuevo cliente (ventas)',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: clientId,
          entityType: 'SalesClient',
          relatedUrl: `/crm/clients/${clientId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Cliente registrado',
        message: `«${clientName}» se guardó correctamente en tu cartera.`,
        relatedEntityId: clientId,
        entityType: 'SalesClient',
        relatedUrl: `/crm/clients/${clientId}`,
      });
    } catch (error) {
      this.logger.error('notifySalesClientCreated', error);
    }
  }

  async notifySalesLeadCreated(actorId: number, leadId: number, label: string, actorName: string) {
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} creó el lead «${label}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_LEAD_CREATED',
          category: 'sales',
          title: 'Nuevo lead (ventas)',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: leadId,
          entityType: 'SalesLead',
          relatedUrl: `/crm/leads?highlight=${leadId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Lead creado',
        message: `«${label}» quedó registrado.`,
        relatedEntityId: leadId,
        entityType: 'SalesLead',
        relatedUrl: `/crm/leads?highlight=${leadId}`,
      });
    } catch (error) {
      this.logger.error('notifySalesLeadCreated', error);
    }
  }

  async notifySalesOpportunityCreated(actorId: number, opportunityId: number, title: string, actorName: string) {
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} abrió la oportunidad «${title}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_OPPORTUNITY_CREATED',
          category: 'sales',
          title: 'Nueva oportunidad',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: opportunityId,
          entityType: 'SalesOpportunity',
          relatedUrl: `/crm/opportunities/${opportunityId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Oportunidad creada',
        message: `«${title}» quedó en tu embudo.`,
        relatedEntityId: opportunityId,
        entityType: 'SalesOpportunity',
        relatedUrl: `/crm/opportunities/${opportunityId}`,
      });
    } catch (error) {
      this.logger.error('notifySalesOpportunityCreated', error);
    }
  }

  async notifySalesOpportunityStageChanged(
    actorId: number,
    opportunityId: number,
    title: string,
    prevStage: string,
    newStage: string,
    actorName: string,
  ) {
    if (prevStage === newStage) return;
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} movió «${title}» de ${prevStage} → ${newStage}.`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_OPPORTUNITY_STAGE_CHANGED',
          category: 'sales',
          title: 'Pipeline actualizado',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: opportunityId,
          entityType: 'SalesOpportunity',
          relatedUrl: `/crm/opportunities/${opportunityId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Etapa actualizada',
        message: `«${title}» ahora está en ${newStage}.`,
        relatedEntityId: opportunityId,
        entityType: 'SalesOpportunity',
        relatedUrl: `/crm/opportunities/${opportunityId}`,
      });
    } catch (error) {
      this.logger.error('notifySalesOpportunityStageChanged', error);
    }
  }

  /**
   * Actividad pasó a estatus finalizada: dirección recibe aviso; el responsable (o el mismo actor) recibe cierre amable.
   */
  async notifyActivityMarkedFinished(
    actorId: number,
    activityId: number,
    activityLabel: string,
    actorName: string,
    responsableId: number,
  ) {
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const oversightMsg = `${actorName} marcó como finalizada la actividad «${activityLabel}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: 'Actividad finalizada',
          message: oversightMsg,
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/activities/${activityId}`,
        });
      }

      if (responsableId === actorId) {
        await this.notificationsService.createNotification({
          userId: actorId,
          type: 'USER_ACTION_CONFIRMED',
          category: 'confirmations',
          title: 'Actividad completada',
          message: `Marcaste «${activityLabel}» como finalizada.`,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/my-evidences?activityId=${activityId}`,
        });
      } else {
        await this.notificationsService.createNotification({
          userId: responsableId,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: 'Tu actividad fue cerrada',
          message: `${actorName} marcó como finalizada «${activityLabel}».`,
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/my-evidences?activityId=${activityId}`,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityMarkedFinished', error);
    }
  }

  private async resolveActorName(actorId: number): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: actorId }, select: { nombre: true } });
    const n = u?.nombre?.trim();
    return n && n.length > 0 ? n : 'Usuario';
  }

  async notifyPurchaseRequisitionCreated(actorId: number, requisitionId: number, reqNumber: string, title: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} creó la requisición ${reqNumber}: «${title}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PURCHASE_REQUISITION_CREATED',
          category: 'erp',
          title: 'Nueva requisición de compra',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: requisitionId,
          entityType: 'PurchaseRequisition',
          relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Requisición registrada',
        message: `${reqNumber} quedó creada.`,
        relatedEntityId: requisitionId,
        entityType: 'PurchaseRequisition',
        relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
      });
    } catch (error) {
      this.logger.error('notifyPurchaseRequisitionCreated', error);
    }
  }

  async notifyPurchaseRequisitionApproved(
    approverId: number,
    requesterId: number,
    requisitionId: number,
    reqNumber: string,
    title: string,
  ) {
    const approverName = await this.resolveActorName(approverId);
    try {
      const oversight = await this.getOperationalOversightRecipientIds(approverId);
      const msg = `${approverName} aprobó la requisición ${reqNumber}: «${title}».`;
      for (const uid of oversight) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PURCHASE_REQUISITION_APPROVED',
          category: 'erp',
          title: 'Requisición aprobada',
          message: msg,
          triggerUserId: approverId,
          relatedEntityId: requisitionId,
          entityType: 'PurchaseRequisition',
          relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
        });
      }
      if (requesterId && requesterId !== approverId) {
        await this.notificationsService.createNotification({
          userId: requesterId,
          type: 'PURCHASE_REQUISITION_APPROVED',
          category: 'confirmations',
          title: 'Tu requisición fue aprobada',
          message: `${approverName} aprobó ${reqNumber} («${title}»).`,
          triggerUserId: approverId,
          relatedEntityId: requisitionId,
          entityType: 'PurchaseRequisition',
          relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
        });
      }
    } catch (error) {
      this.logger.error('notifyPurchaseRequisitionApproved', error);
    }
  }

  async notifyPurchaseRequisitionRejected(
    approverId: number,
    requesterId: number,
    requisitionId: number,
    reqNumber: string,
    title: string,
    reason: string,
  ) {
    const approverName = await this.resolveActorName(approverId);
    try {
      const oversight = await this.getOperationalOversightRecipientIds(approverId);
      const msg = `${approverName} rechazó la requisición ${reqNumber}: «${title}». ${reason}`;
      for (const uid of oversight) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PURCHASE_REQUISITION_REJECTED',
          category: 'erp',
          title: 'Requisición rechazada',
          message: msg,
          triggerUserId: approverId,
          relatedEntityId: requisitionId,
          entityType: 'PurchaseRequisition',
          relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
          priority: 'high',
        });
      }
      if (requesterId && requesterId !== approverId) {
        await this.notificationsService.createNotification({
          userId: requesterId,
          type: 'PURCHASE_REQUISITION_REJECTED',
          category: 'confirmations',
          title: 'Requisición rechazada',
          message: `${approverName} rechazó ${reqNumber}. ${reason}`,
          triggerUserId: approverId,
          relatedEntityId: requisitionId,
          entityType: 'PurchaseRequisition',
          relatedUrl: `/erp/procurement?tab=requisitions&id=${requisitionId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error('notifyPurchaseRequisitionRejected', error);
    }
  }

  async notifyPurchaseOrderCreated(actorId: number, purchaseOrderId: number, poNumber: string, supplierName: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} generó la orden ${poNumber} (proveedor: ${supplierName}).`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PURCHASE_ORDER_CREATED',
          category: 'erp',
          title: 'Nueva orden de compra',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: purchaseOrderId,
          entityType: 'PurchaseOrder',
          relatedUrl: `/erp/procurement?tab=orders&id=${purchaseOrderId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Orden de compra creada',
        message: `${poNumber} quedó registrada.`,
        relatedEntityId: purchaseOrderId,
        entityType: 'PurchaseOrder',
        relatedUrl: `/erp/procurement?tab=orders&id=${purchaseOrderId}`,
      });
    } catch (error) {
      this.logger.error('notifyPurchaseOrderCreated', error);
    }
  }

  async notifyPurchaseOrderApproved(approverId: number, notifyUserId: number | null, purchaseOrderId: number, poNumber: string) {
    const approverName = await this.resolveActorName(approverId);
    try {
      const oversight = await this.getOperationalOversightRecipientIds(approverId);
      const msg = `${approverName} confirmó la orden de compra ${poNumber}.`;
      for (const uid of oversight) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PURCHASE_ORDER_APPROVED',
          category: 'erp',
          title: 'Orden de compra confirmada',
          message: msg,
          triggerUserId: approverId,
          relatedEntityId: purchaseOrderId,
          entityType: 'PurchaseOrder',
          relatedUrl: `/erp/procurement?tab=orders&id=${purchaseOrderId}`,
        });
      }
      if (notifyUserId && notifyUserId !== approverId) {
        await this.notificationsService.createNotification({
          userId: notifyUserId,
          type: 'PURCHASE_ORDER_APPROVED',
          category: 'confirmations',
          title: 'OC confirmada',
          message: `${approverName} confirmó ${poNumber}.`,
          triggerUserId: approverId,
          relatedEntityId: purchaseOrderId,
          entityType: 'PurchaseOrder',
          relatedUrl: `/erp/procurement?tab=orders&id=${purchaseOrderId}`,
        });
      }
    } catch (error) {
      this.logger.error('notifyPurchaseOrderApproved', error);
    }
  }

  async notifyGoodsReceiptPosted(
    actorId: number,
    receiptId: number,
    receiptNumber: string,
    poNumber: string,
    purchaseOrderId: number,
    notifyCreatorId: number | null,
  ) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const oversight = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} registró recepción ${receiptNumber} para la OC ${poNumber}.`;
      for (const uid of oversight) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'GOODS_RECEIPT_POSTED',
          category: 'erp',
          title: 'Recepción de mercancía',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: receiptId,
          entityType: 'GoodsReceipt',
          relatedUrl: `/erp/procurement?tab=receipts&poId=${purchaseOrderId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Recepción guardada',
        message: `${receiptNumber} registrada para ${poNumber}.`,
        relatedEntityId: receiptId,
        entityType: 'GoodsReceipt',
        relatedUrl: `/erp/procurement?tab=receipts&poId=${purchaseOrderId}`,
      });
      if (notifyCreatorId && notifyCreatorId !== actorId) {
        await this.notificationsService.createNotification({
          userId: notifyCreatorId,
          type: 'GOODS_RECEIPT_POSTED',
          category: 'erp',
          title: 'Recepción en tu OC',
          message: `${actorName} registró ${receiptNumber} en ${poNumber}.`,
          triggerUserId: actorId,
          relatedEntityId: receiptId,
          entityType: 'GoodsReceipt',
          relatedUrl: `/erp/procurement?tab=receipts&poId=${purchaseOrderId}`,
        });
      }
    } catch (error) {
      this.logger.error('notifyGoodsReceiptPosted', error);
    }
  }

  async notifyStockMovementPosted(actorId: number, movementId: number, movementNumber: string, productLabel: string, type: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} registró movimiento ${movementNumber} (${type}) — ${productLabel}.`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'STOCK_MOVEMENT_POSTED',
          category: 'erp',
          title: 'Movimiento de inventario',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: movementId,
          entityType: 'StockMovement',
          relatedUrl: `/erp/warehouse?movementId=${movementId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Movimiento registrado',
        message: `${movementNumber} guardado.`,
        relatedEntityId: movementId,
        entityType: 'StockMovement',
        relatedUrl: `/erp/warehouse?movementId=${movementId}`,
      });
    } catch (error) {
      this.logger.error('notifyStockMovementPosted', error);
    }
  }

  async notifyJournalEntryPosted(actorId: number, entryId: number, entryNumber: string, description: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} contabilizó el asiento ${entryNumber}: ${description.slice(0, 120)}${description.length > 120 ? '…' : ''}`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'JOURNAL_ENTRY_POSTED',
          category: 'erp',
          title: 'Asiento contabilizado',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: entryId,
          entityType: 'JournalEntry',
          relatedUrl: `/erp/accounting?highlight=${entryId}`,
          priority: 'high',
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Asiento publicado',
        message: `${entryNumber} quedó en libros.`,
        relatedEntityId: entryId,
        entityType: 'JournalEntry',
        relatedUrl: `/erp/accounting?highlight=${entryId}`,
      });
    } catch (error) {
      this.logger.error('notifyJournalEntryPosted', error);
    }
  }

  async notifyInvoiceCreated(actorId: number, invoiceId: number, invoiceNumber: string, totalHint: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} creó la factura ${invoiceNumber} (${totalHint}).`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'INVOICE_CREATED',
          category: 'erp',
          title: 'Nueva factura',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: invoiceId,
          entityType: 'Invoice',
          relatedUrl: `/erp/invoicing?highlight=${invoiceId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Factura creada',
        message: `${invoiceNumber} registrada.`,
        relatedEntityId: invoiceId,
        entityType: 'Invoice',
        relatedUrl: `/erp/invoicing?highlight=${invoiceId}`,
      });
    } catch (error) {
      this.logger.error('notifyInvoiceCreated', error);
    }
  }

  async notifyPaymentRegistered(actorId: number, paymentId: number, invoiceNumber: string, amountLabel: string) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} registró pago ${amountLabel} sobre factura ${invoiceNumber}.`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'PAYMENT_REGISTERED',
          category: 'erp',
          title: 'Pago registrado',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: paymentId,
          entityType: 'Payment',
          relatedUrl: `/erp/invoicing?invoiceRef=${encodeURIComponent(invoiceNumber)}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'Pago guardado',
        message: `${amountLabel} aplicado a ${invoiceNumber}.`,
        relatedEntityId: paymentId,
        entityType: 'Payment',
        relatedUrl: `/erp/invoicing?invoiceRef=${encodeURIComponent(invoiceNumber)}`,
      });
    } catch (error) {
      this.logger.error('notifyPaymentRegistered', error);
    }
  }

  /**
   * Recipientes ejecutivos: superadmins + plataforma + directores comerciales.
   * Para alertas críticas de margen/presupuesto.
   */
  async getExecutiveRecipientIds(): Promise<number[]> {
    const ids = new Set<number>();

    const platform = await this.prisma.user.findMany({
      where: { email: { in: this.platformSuperEmails.map((e) => e.toLowerCase()) } },
      select: { id: true },
    });
    platform.forEach((u) => ids.add(u.id));

    const directors = await this.prisma.user.findMany({
      where: {
        role: {
          OR: [
            { accesoConsoleAdmin: true },
            { orgRoleKey: { in: ['ceo', 'director_admin', 'director_commercial', 'sales_manager'] } },
          ],
        },
        ...this.companyScope(),
      },
      select: { id: true },
    });
    directors.forEach((u) => ids.add(u.id));

    return [...ids];
  }

  /**
   * Alerta jerárquica de margen — al exceder presupuesto o caer bajo umbral.
   * Notifica al dueño comercial + directores comerciales + superadmins.
   */
  async notifyProjectMarginAlert(opts: {
    projectId: number;
    projectName: string;
    ownerId?: number | null;
    marginPercent: number;
    severity: 'overspend' | 'low_margin';
    actualMargin: number;
    budget: number;
  }) {
    try {
      const recipients = new Set(await this.getExecutiveRecipientIds());
      if (opts.ownerId) recipients.add(opts.ownerId);

      const severityText = opts.severity === 'overspend' ? '🚨 Sobrepresupuesto' : '⚠️ Margen bajo';
      const title = `${severityText} · ${opts.projectName}`;
      const message =
        opts.severity === 'overspend'
          ? `El proyecto «${opts.projectName}» excedió el presupuesto. Margen real: ${opts.marginPercent.toFixed(1)}% (${opts.actualMargin.toFixed(2)} / ${opts.budget.toFixed(2)}).`
          : `El proyecto «${opts.projectName}» tiene margen real ${opts.marginPercent.toFixed(1)}% (debajo del 10%). Revisa costos reales.`;

      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_PROJECT_MARGIN_ALERT',
          category: 'sales',
          title,
          message,
          relatedEntityId: opts.projectId,
          entityType: 'SalesProject',
          relatedUrl: `/ops/projects/${opts.projectId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error('notifyProjectMarginAlert', error);
    }
  }

  async notifyMaintenanceWorkOrderCreated(
    actorId: number,
    workOrderId: number,
    orderNumber: string,
    title: string,
    assignedToId: number | null,
  ) {
    const actorName = await this.resolveActorName(actorId);
    try {
      const recipients = await this.getOperationalOversightRecipientIds(actorId);
      const msg = `${actorName} abrió OT ${orderNumber}: «${title}».`;
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'MAINTENANCE_WORK_ORDER_CREATED',
          category: 'erp',
          title: 'Nueva orden de mantenimiento',
          message: msg,
          triggerUserId: actorId,
          relatedEntityId: workOrderId,
          entityType: 'MaintenanceOrder',
          relatedUrl: `/ops/maintenance?woId=${workOrderId}`,
        });
      }
      await this.notificationsService.createNotification({
        userId: actorId,
        type: 'USER_ACTION_CONFIRMED',
        category: 'confirmations',
        title: 'OT creada',
        message: `${orderNumber} registrada.`,
        relatedEntityId: workOrderId,
        entityType: 'MaintenanceOrder',
        relatedUrl: `/ops/maintenance?woId=${workOrderId}`,
      });
      if (assignedToId && assignedToId !== actorId) {
        await this.notificationsService.createNotification({
          userId: assignedToId,
          type: 'MAINTENANCE_WORK_ORDER_CREATED',
          category: 'erp',
          title: 'OT asignada a ti',
          message: `${actorName} te asignó ${orderNumber}: «${title}».`,
          triggerUserId: actorId,
          relatedEntityId: workOrderId,
          entityType: 'MaintenanceOrder',
          relatedUrl: `/ops/maintenance?woId=${workOrderId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error('notifyMaintenanceWorkOrderCreated', error);
    }
  }
}
