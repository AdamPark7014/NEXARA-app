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
import { fechaAviso, horaAviso, nombreCorto } from './notification-push-meta.js';
import { CEO_EQUIVALENT_EMAILS } from '../common/platform-accounts.js';

/**
 * Nombre de la actividad para el aviso. El folio (AN-0001) nunca es el identificador principal:
 * la gente reconoce «Mantenimiento de CCTV», no el código.
 */
function nombreActividad(titulo?: string | null): string {
  return (titulo && String(titulo).trim()) || 'Actividad sin nombre';
}

/** Une las partes presentes con « · »: «Mantenimiento de CCTV · Plaza Dorada». */
function unir(...partes: Array<string | null | undefined | false>): string {
  return partes
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}

/** Nombre corto de una persona, con respaldo cuando no hay nombre. */
function persona(nombre: string | null | undefined, respaldo = 'Alguien del equipo'): string {
  return nombreCorto(nombre) || respaldo;
}

/** Minutos en lenguaje de campo: «2 h 35 min», «45 min». */
function minutosLargos(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
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
        // Christian y su cuenta de pruebas (Claudia) reciben lo mismo.
        where: { email: { in: [...CEO_EQUIVALENT_EMAILS] }, isActive: true },
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

      const nombre = persona(user.nombre || userName);
      const entrada = type === 'ATTENDANCE_CHECKIN';
      const hora = horaAviso(at);

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
        ? `${nombre} terminó su jornada`
        : horarioEsperado
          ? `${nombre} llegó con retardo`
          : `${nombre} entró a trabajar`;
      const message = !entrada
        ? hora
        : horarioEsperado
          ? unir(hora, `Su horario inicia a las ${horarioEsperado.replace(/^0/, '')}`)
          : unir(hora, deviceInfo);
      const icon = !entrada ? 'salida' : horarioEsperado ? 'entrada_tarde' : 'entrada';

      for (const id of await this.shiftWatcherIds(userId)) {
        await this.notificationsService.createNotification({
          userId: id,
          type,
          category: 'attendance',
          title,
          message,
          icon,
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
      const hora = horaAviso(new Date());
      const nombre = persona(userName);
      for (const id of await this.shiftWatcherIds(userId)) {
        await this.notificationsService.createNotification({
          userId: id,
          type,
          category: 'lunch_breaks',
          title: sale ? `${nombre} salió a comer` : `${nombre} regresó de comer`,
          message: hora,
          icon: sale ? 'comida_sale' : 'comida_regresa',
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

      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { titulo: true, client: { select: { name: true } } },
      });
      const actividad = nombreActividad(activity?.titulo || activityTitle);
      const title = `${persona(actorName)} inició ${actividad}`;
      const message = unir(activity?.client?.name, `En proceso desde las ${horaAviso(new Date())}`);

      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_STARTED',
          category: 'activities',
          title,
          message,
          icon: 'actividad_inicio',
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
   * Avance en campo paso a paso: «Alejandro González inició Mantenimiento de CCTV», «subió 4 fotos», «subió la hoja de
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

      const nombre = persona(actor?.nombre);
      const actividad = nombreActividad(activity.titulo);
      const cliente = activity.client?.name;
      const hora = horaAviso(params.at ?? new Date());
      const fotos = params.fotos ?? 0;

      const title = {
        inicio: `${nombre} inició ${actividad}`,
        evidencias: `${nombre} subió ${fotos === 1 ? '1 foto' : `${fotos} fotos`} de evidencia`,
        hoja: `${nombre} subió la hoja de servicio`,
        formulario: `${nombre} llenó el formulario de servicio`,
      }[paso];
      const message =
        paso === 'inicio' ? unir(cliente, `Llegó a las ${hora}`) : unir(actividad, cliente);
      const icon = {
        inicio: 'actividad_inicio',
        evidencias: 'fotos',
        hoja: 'documento',
        formulario: 'formulario',
      }[paso];

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
          icon,
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

  /** Quién sigue a alguien en una actividad: esa persona, sus jefes, Christian, responsable, creador y encargados. */
  private async activityZoneWatcherIds(activityId: number, userId: number) {
    const [activity, leads] = await Promise.all([
      this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { titulo: true, responsableId: true, creadoPorId: true, client: { select: { name: true } } },
      }),
      this.prisma.activityAssignee.findMany({
        where: { activityId, rol: 'LEAD', retiradoAt: null },
        select: { userId: true },
      }),
    ]);
    const jefes = new Set<number>(await this.lunchReviewerIds(userId));
    for (const s of await this.getSupervisors(userId)) jefes.add(s.id);
    if (activity?.responsableId) jefes.add(activity.responsableId);
    if (activity?.creadoPorId) jefes.add(activity.creadoPorId);
    for (const l of leads) jefes.add(l.userId);
    jefes.delete(userId);
    return { activity, jefes: [...jefes] };
  }

  /**
   * Geocerca: la persona salió del radio del punto donde inició la actividad. Le llega a ella
   * (para que justifique) y a sus jefes, Christian y responsables de la actividad.
   */
  async notifyActivityOutOfZone(params: { activityId: number; userId: number; distanciaM: number; alertId: number }) {
    try {
      const { activity, jefes } = await this.activityZoneWatcherIds(params.activityId, params.userId);
      if (!activity) return;
      const persona_ = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { nombre: true } });
      const nombre = persona(persona_?.nombre);
      const actividad = nombreActividad(activity.titulo);
      const hora = horaAviso(new Date());
      const url = `/erp/actividades/${params.activityId}/evidencias`;
      const comun = {
        type: 'ACTIVITY_OUT_OF_ZONE',
        category: 'activities',
        icon: 'fuera_zona',
        relatedEntityId: params.activityId,
        entityType: 'Activity',
        priority: 'high' as const,
        channel: 'ops',
        collapseKey: `nx_zona_${params.alertId}`,
        dedupeSeconds: 0,
      };
      await this.notificationsService.createNotification({
        ...comun,
        userId: params.userId,
        title: 'Estás fuera de la zona de tu actividad',
        message: unir(
          actividad,
          `Te alejaste ${params.distanciaM} m del punto de inicio (máx. 100 m) a las ${hora}`,
          'Justifica el motivo con una foto',
        ),
        relatedUrl: `/erp/actividades/${params.activityId}`,
      });
      for (const uid of jefes) {
        await this.notificationsService.createNotification({
          ...comun,
          userId: uid,
          triggerUserId: params.userId,
          title: `${nombre} salió de la zona de su actividad`,
          message: unir(actividad, activity.client?.name, `A ${params.distanciaM} m del punto de inicio · ${hora}`),
          relatedUrl: url,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityOutOfZone', error);
    }
  }

  /** La persona justificó su salida de zona: jefes, Christian y responsables leen el motivo. */
  async notifyActivityOutOfZoneJustified(params: { activityId: number; userId: number; motivo: string; alertId: number }) {
    try {
      const { activity, jefes } = await this.activityZoneWatcherIds(params.activityId, params.userId);
      if (!activity) return;
      const persona_ = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { nombre: true } });
      const nombre = persona(persona_?.nombre);
      for (const uid of jefes) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_OUT_OF_ZONE',
          category: 'activities',
          icon: 'fuera_zona',
          triggerUserId: params.userId,
          title: `${nombre} justificó su salida de zona`,
          message: unir(nombreActividad(activity.titulo), `«${params.motivo.slice(0, 160)}»`),
          relatedEntityId: params.activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${params.activityId}/evidencias`,
          priority: 'normal',
          channel: 'ops',
          collapseKey: `nx_zona_${params.alertId}`,
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityOutOfZoneJustified', error);
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
            titulo: true,
            fechaInicio: true,
            client: { select: { name: true } },
          },
        }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { nombre: true } }),
      ]);
      const actividad = nombreActividad(activity?.titulo || activityTitle);
      const cliente = activity?.client?.name;
      const cuando = activity?.fechaInicio ? fechaAviso(activity.fechaInicio, WORKDAY_TIMEZONE) : null;
      const quienAsigna = persona(assignedByName, 'Sistema');
      const url = `/erp/actividades/${activityId}`;
      // Quien asigna no recibe su propio aviso (p. ej. al asignarse una tarea a sí mismo).
      const actor = assignedById ?? undefined;

      await this.notificationsService.createNotification({
        userId,
        type: 'ACTIVITY_ASSIGNED',
        category: 'activities',
        title: `Nueva actividad: ${actividad}`,
        message: unir(`${quienAsigna} te la asignó`, cliente, cuando),
        icon: 'actividad_nueva',
        triggerUserId: actor,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: url,
        priority: 'high',
      });

      // Sus jefes por organigrama, Christian y los administradores de su departamento.
      const nombreAsignado = persona(asignado?.nombre, 'alguien del equipo');
      for (const id of await this.shiftWatcherIds(userId)) {
        if (id === assignedById) continue;
        await this.notificationsService.createNotification({
          userId: id,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: `${quienAsigna} asignó ${actividad} a ${nombreAsignado}`,
          message: unir(cliente, cuando) || 'Sin fecha programada',
          icon: 'actividad_nueva',
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
      const actividad = nombreActividad(activityTitle);
      const quien = persona(reviewerName, 'Tu supervisor');
      const title = status === 'approved' ? `${actividad} aprobada` : `${actividad} devuelta`;
      const message =
        status === 'approved'
          ? `${quien} la aprobó`
          : unir(`${quien} la devolvió`, reason ? `Motivo: ${reason}` : 'Revísala y corrígela');

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'activities',
        title,
        message,
        icon: status === 'approved' ? 'aprobada' : 'devuelta',
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
    /** Folio: ya no se muestra; el aviso identifica la actividad por su nombre. */
    _anNumber?: string | null,
    /** Responsable (p. ej. Luis) que da seguimiento aunque no revise evidencias. */
    responsableId?: number | null,
    /** Encargados de la cadena y jefe directo: también revisan. */
    reviewerIds: number[] = [],
    /** Es la corrección de algo que se le devolvió. */
    correccion = false,
  ) {
    try {
      const actividad = nombreActividad(activityTitle);
      const quien = persona(submitterName);
      const title = correccion
        ? `${actividad} corregida, lista para revisión`
        : `${actividad} lista para revisión`;
      const message = correccion
        ? `${quien} corrigió lo que se le devolvió`
        : `${quien} envió sus evidencias`;

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
          title,
          message,
          icon: correccion ? 'correccion' : 'por_revisar',
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
      const actividad = nombreActividad(activityTitle);
      const title =
        status === 'approved'
          ? extra.closed
            ? `${actividad} finalizada`
            : `Evidencia aprobada: ${actividad}`
          : `Evidencia devuelta: ${actividad}`;
      const icon = status === 'approved' ? (extra.closed ? 'finalizada' : 'aprobada') : 'devuelta';
      const quien = persona(reviewerName, 'Tu supervisor');
      const stepNames: Record<string, string> = {
        ENTRY_PHOTO: 'foto de entrada',
        EVIDENCE_PHOTOS: 'fotos en sitio',
        SERVICE_SHEET_PDF: 'hoja de servicio PDF',
        SERVICE_SHEET_DATA: 'formulario',
        EXIT_PHOTO: 'foto de salida',
      };
      const pasos = (extra.steps ?? []).map((s) => stepNames[s] ?? s).join(', ');
      const calif = extra.score ? `Calificación ${extra.score} de 5` : null;
      const obs = notes?.trim() ? `Observaciones: ${notes.trim()}` : null;
      const accion =
        status === 'approved'
          ? extra.closed
            ? `${quien} aprobó las evidencias`
            : `${quien} aprobó la evidencia`
          : extra.full
            ? `${quien} pidió rehacer toda la evidencia`
            : pasos
              ? `${quien} pidió corregir: ${pasos}`
              : `${quien} pidió corregir la evidencia`;
      const message = unir(accion, calif, obs);

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
          icon,
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
      const actorName = actorId ? persona(await this.resolveActorName(actorId), 'Dirección') : 'Dirección';
      const url = `/erp/actividades/${activityId}`;
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { titulo: true, client: { select: { name: true } } },
      });
      const actividad = nombreActividad(activity?.titulo || label);
      const cliente = activity?.client?.name;
      const miembro = persona(memberName, 'alguien del equipo');

      if (memberId !== actorId) {
        await this.notificationsService.createNotification({
          userId: memberId,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: reparte ? `Actividad por repartir: ${actividad}` : `Nueva actividad: ${actividad}`,
          message: reparte
            ? unir(`${actorName} te la pasó para repartir a tu equipo`, cliente)
            : unir(`${actorName} te la asignó`, cliente),
          icon: reparte ? 'despacho' : 'actividad_nueva',
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
          title: `${actorName} pasó ${actividad} a ${miembro}`,
          message: unir(cliente, reparte ? 'La reparte a su equipo' : 'La ejecuta directamente'),
          icon: 'despacho',
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

  /**
   * Checada que hay que mirar: ubicación simulada, fuera de sitio, hora del teléfono que no
   * coincide o cierre automático de una salida olvidada. Le llega a sus jefes por organigrama y a
   * dirección; a la persona sólo cuando le afecta directamente (le cerraron la jornada, le
   * corrigieron la hora).
   */
  async notifyAttendanceFlagged(params: {
    userId: number;
    titulo: string;
    mensaje: string;
    attendanceId?: number | null;
    avisarPersona?: boolean;
  }) {
    try {
      const nombre = persona(await this.resolveActorName(params.userId));
      const comun = {
        type: 'ATTENDANCE_FLAGGED' as const,
        category: 'attendance',
        icon: 'asistencia_alerta',
        relatedEntityId: params.attendanceId ?? params.userId,
        entityType: params.attendanceId ? 'Attendance' : 'User',
        priority: 'high' as const,
        dedupeSeconds: 0,
      };
      if (params.avisarPersona) {
        await this.notificationsService.createNotification({
          ...comun,
          userId: params.userId,
          title: params.titulo,
          message: params.mensaje,
          relatedUrl: '/erp/asistencias',
        });
      }
      for (const jefe of await this.lunchReviewerIds(params.userId)) {
        await this.notificationsService.createNotification({
          ...comun,
          userId: jefe,
          triggerUserId: params.userId,
          title: `${nombre}: ${params.titulo.toLowerCase()}`,
          message: params.mensaje,
          relatedUrl: appUrls.erpAttendance(undefined, params.userId),
        });
      }
    } catch (error) {
      this.logger.error('notifyAttendanceFlagged', error);
    }
  }

  /**
   * Christian justificó la falta de un día: la persona lo sabe («Tu falta del jue 17 sep quedó
   * justificada · motivo») y sus jefes por organigrama también. Quien la justificó no recibe aviso.
   */
  async notifyAbsenceJustified(params: {
    userId: number;
    actorId: number;
    fecha: string;
    motivo: string;
    justificationId: number;
  }) {
    try {
      const nombre = persona(await this.resolveActorName(params.userId));
      const motivo = `Motivo: ${params.motivo.trim().slice(0, 200)}`;
      const comun = {
        type: 'ATTENDANCE_ABSENCE',
        category: 'attendance',
        icon: 'falta_justificada',
        triggerUserId: params.actorId,
        relatedEntityId: params.justificationId,
        entityType: 'AttendanceJustification',
        priority: 'normal' as const,
        dedupeSeconds: 0,
      };
      await this.notificationsService.createNotification({
        ...comun,
        userId: params.userId,
        title: `Tu falta del ${params.fecha} quedó justificada`,
        message: motivo,
        relatedUrl: '/erp/asistencias',
      });
      for (const jefe of await this.lunchReviewerIds(params.userId)) {
        await this.notificationsService.createNotification({
          ...comun,
          userId: jefe,
          title: `${nombre}: falta del ${params.fecha} justificada`,
          message: motivo,
          relatedUrl: appUrls.erpAttendance(undefined, params.userId),
        });
      }
    } catch (error) {
      this.logger.error('notifyAbsenceJustified', error);
    }
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
      const nombre = persona(params.userName);
      const justificacion = params.justificacion?.trim() || 'Sin justificación';
      for (const uid of await this.lunchReviewerIds(params.userId)) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: params.momento === 'salida' ? 'LUNCH_CHECKIN' : 'LUNCH_CHECKOUT',
          category: 'lunch_breaks',
          title: 'Comida fuera de horario por revisar',
          message: `${nombre}: ${justificacion}`,
          icon: 'comida_tarde',
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
      const quien = persona(await this.resolveActorName(params.reviewerId), 'Tu supervisor');
      await this.notificationsService.createNotification({
        userId: params.userId,
        type: 'LUNCH_CHECKOUT',
        category: 'lunch_breaks',
        title: params.aprobada ? 'Aprobaron tu comida fuera de horario' : 'Rechazaron tu comida fuera de horario',
        message: unir(
          `${quien} ${params.aprobada ? 'aprobó' : 'rechazó'} tu justificación`,
          params.notas ? `Nota: ${params.notas}` : null,
        ),
        icon: params.aprobada ? 'comida_aprobada' : 'comida_rechazada',
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
      const who = lastUserId ? persona(await this.resolveActorName(lastUserId)) : null;
      const actividad = nombreActividad(label);
      for (const uid of targets) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: `${actividad} lista para revisión`,
          message: who
            ? `El equipo terminó; ${who} subió la última evidencia`
            : 'El equipo subió todas sus evidencias',
          icon: 'por_revisar',
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
          select: { titulo: true, creadoPorId: true, responsableId: true, client: { select: { name: true } } },
        }),
        this.prisma.user.findMany({
          where: { id: { in: [actorId, aUsuarioId, ...(deUsuarioId ? [deUsuarioId] : [])] } },
          select: { id: true, nombre: true },
        }),
      ]);
      if (!activity) return;
      const nombreDe = (id: number | null) => persona(personas.find((p) => p.id === id)?.nombre, 'alguien');
      const actividad = nombreActividad(activity.titulo);
      const cliente = activity.client?.name;
      const motivo = params.motivo?.trim() ? `Motivo: ${params.motivo.trim()}` : null;
      const base = {
        type: 'ACTIVITY_ASSIGNED',
        category: 'activities',
        triggerUserId: actorId,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/erp/actividades/${activityId}`,
        channel: 'ops',
        dedupeSeconds: 0,
        icon: 'reasignada',
      } as const;

      await this.notificationsService.createNotification({
        ...base,
        userId: aUsuarioId,
        title: `Te asignaron ${actividad} para continuarla`,
        message: unir(
          motivo,
          deUsuarioId ? `Continúas donde se quedó ${nombreDe(deUsuarioId)}` : null,
          `${nombreDe(actorId)} te la pasó`,
          cliente,
        ),
        priority: 'high',
      });

      if (deUsuarioId && deUsuarioId !== aUsuarioId) {
        await this.notificationsService.createNotification({
          ...base,
          userId: deUsuarioId,
          title: `${actividad} pasó a ${nombreDe(aUsuarioId)}`,
          message: unir(
            motivo,
            `${nombreDe(actorId)} la reasignó`,
            params.retiradoAnterior ? 'Tu avance quedó guardado' : 'Sigues en el equipo como apoyo',
          ),
        });
      }

      // Responsable, quien la creó, jefes de quien salió y de quien entra, y Christian.
      const observadores = new Set<number>(await this.getCeoUserIds());
      if (activity.creadoPorId) observadores.add(activity.creadoPorId);
      if (activity.responsableId) observadores.add(activity.responsableId);
      for (const id of [deUsuarioId, aUsuarioId]) {
        if (id) for (const jefe of await this.lunchReviewerIds(id)) observadores.add(jefe);
      }
      observadores.delete(actorId);
      observadores.delete(aUsuarioId);
      if (deUsuarioId) observadores.delete(deUsuarioId);
      for (const userId of observadores) {
        await this.notificationsService.createNotification({
          ...base,
          userId,
          title: `${nombreDe(actorId)} reasignó ${actividad}`,
          message: unir(
            deUsuarioId
              ? `De ${nombreDe(deUsuarioId)} a ${nombreDe(aUsuarioId)}`
              : `Ahora la tiene ${nombreDe(aUsuarioId)}`,
            cliente,
            motivo,
          ),
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityReassigned', error);
    }
  }

  /**
   * Un superior canceló la actividad: «Mantenimiento de CCTV fue cancelada · motivo». Lo reciben
   * quienes la ejecutaban (y quien salió del equipo no), el responsable, quien la creó, los jefes
   * por organigrama de cada uno y Christian. Nadie recibe su propio aviso.
   */
  async notifyActivityCancelled(params: { activityId: number; actorId: number; motivo: string }) {
    const { activityId, actorId } = params;
    try {
      const [activity, team] = await Promise.all([
        this.prisma.activity.findUnique({
          where: { id: activityId },
          select: { titulo: true, responsableId: true, creadoPorId: true, client: { select: { name: true } } },
        }),
        this.prisma.activityAssignee.findMany({
          where: { activityId, retiradoAt: null },
          select: { userId: true },
        }),
      ]);
      if (!activity) return;
      const personas = new Set<number>([activity.responsableId, ...team.map((t) => t.userId)]);
      const targets = new Set<number>(personas);
      if (activity.creadoPorId) targets.add(activity.creadoPorId);
      for (const id of personas) {
        for (const jefe of await this.lunchReviewerIds(id)) targets.add(jefe);
      }
      for (const ceo of await this.getCeoUserIds()) targets.add(ceo);
      targets.delete(actorId);

      const quien = persona(await this.resolveActorName(actorId));
      const title = `${nombreActividad(activity.titulo)} fue cancelada`;
      const message = unir(`Motivo: ${params.motivo.trim().slice(0, 200)}`, `${quien} la canceló`, activity.client?.name);
      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_CANCELLED',
          category: 'activities',
          title,
          message,
          icon: 'cancelada',
          triggerUserId: actorId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${activityId}/historial`,
          priority: 'high',
          channel: 'ops',
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityCancelled', error);
    }
  }

  /**
   * Inició la actividad que le asignaron (quien la recibe ya no acepta ni rechaza,
   * solo inicia): le llega a quien se la pasó y al responsable, con la hora real.
   * El tipo sigue siendo ACTIVITY_ACCEPTED_BY_ASSIGNEE para no tocar el enum de la base.
   */
  async notifyActivityStartedByAssignee(params: {
    activityId: number;
    userId: number;
    asignadoPorId: number | null;
    inicioRealAt?: Date;
  }) {
    try {
      const activity = await this.prisma.activity.findUnique({
        where: { id: params.activityId },
        select: { titulo: true, responsableId: true, creadoPorId: true, client: { select: { name: true } } },
      });
      if (!activity) return;
      const quien = persona(await this.resolveActorName(params.userId));
      const targets = new Set<number>(
        [params.asignadoPorId, activity.responsableId, activity.creadoPorId].filter(
          (id): id is number => Boolean(id),
        ),
      );
      targets.delete(params.userId);
      for (const userId of targets) {
        await this.notificationsService.createNotification({
          userId,
          type: 'ACTIVITY_ACCEPTED_BY_ASSIGNEE',
          category: 'activities',
          title: `${quien} inició ${nombreActividad(activity.titulo)}`,
          message: unir(activity.client?.name, `Inició a las ${horaAviso(params.inicioRealAt ?? new Date())}`),
          icon: 'aceptada',
          triggerUserId: params.userId,
          relatedEntityId: params.activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${params.activityId}`,
          priority: 'normal',
          channel: 'ops',
          collapseKey: `nx_acept_${params.activityId}_u${params.userId}`,
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityStartedByAssignee', error);
    }
  }

  /**
   * Pasó de su tiempo estimado: le llega a la persona y a sus superiores, una sola vez
   * por actividad (la tarea marca `alertaExcesoAt` para no repetirlo).
   */
  async notifyActivityOvertime(params: {
    activityId: number;
    userId: number;
    minutosPlan: number;
    minutosReales: number;
  }) {
    try {
      const { activity, jefes } = await this.activityZoneWatcherIds(params.activityId, params.userId);
      if (!activity) return;
      const quien = persona(await this.resolveActorName(params.userId));
      const actividad = nombreActividad(activity.titulo);
      const plan = minutosLargos(params.minutosPlan);
      const real = minutosLargos(params.minutosReales);
      const comun = {
        type: 'ACTIVITY_OVERTIME' as const,
        category: 'activities',
        icon: 'tiempo_excedido' as const,
        relatedEntityId: params.activityId,
        entityType: 'Activity',
        priority: 'high' as const,
        channel: 'ops',
        collapseKey: `nx_exceso_${params.activityId}_u${params.userId}`,
        dedupeSeconds: 0,
      };
      await this.notificationsService.createNotification({
        ...comun,
        userId: params.userId,
        title: `${actividad} excedió su tiempo estimado`,
        message: unir(`Plan ${plan} · llevas ${real}`, activity.client?.name),
        relatedUrl: `/erp/actividades/${params.activityId}`,
      });
      for (const uid of jefes) {
        await this.notificationsService.createNotification({
          ...comun,
          userId: uid,
          triggerUserId: params.userId,
          title: `${actividad} excedió su tiempo estimado`,
          message: unir(`${quien}: plan ${plan} · lleva ${real}`, activity.client?.name),
          relatedUrl: `/erp/actividades/${params.activityId}/evidencias`,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityOvertime', error);
    }
  }

  /**
   * Inicio marcado: empezó lejos del sitio del cliente o antes que otra de más prioridad.
   * Nunca bloquea la foto de entrada; solo deja constancia a los superiores.
   */
  async notifyActivityStartFlagged(params: {
    activityId: number;
    userId: number;
    distanciaSitioM?: number | null;
    saltoPrioridad?: boolean;
    justificacion?: string | null;
  }) {
    try {
      const { activity, jefes } = await this.activityZoneWatcherIds(params.activityId, params.userId);
      if (!activity || !jefes.length) return;
      const quien = persona(await this.resolveActorName(params.userId));
      const actividad = nombreActividad(activity.titulo);
      const motivos = [
        params.distanciaSitioM != null
          ? `Inició a ${params.distanciaSitioM} m del sitio del cliente`
          : null,
        params.saltoPrioridad ? 'Tenía otra de más prioridad sin terminar' : null,
        params.justificacion ? `«${params.justificacion.slice(0, 160)}»` : null,
      ];
      for (const uid of jefes) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_START_FLAGGED',
          category: 'activities',
          title: `${quien} inició ${actividad} fuera de lo previsto`,
          message: unir(...motivos, activity.client?.name),
          icon: 'inicio_marcado',
          triggerUserId: params.userId,
          relatedEntityId: params.activityId,
          entityType: 'Activity',
          relatedUrl: `/erp/actividades/${params.activityId}/evidencias`,
          priority: 'normal',
          channel: 'ops',
          collapseKey: `nx_inicio_marcado_${params.activityId}_u${params.userId}`,
          dedupeSeconds: 0,
        });
      }
    } catch (error) {
      this.logger.error('notifyActivityStartFlagged', error);
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
      const actorName = persona(await this.resolveActorName(actorId));
      const targets = new Set<number>([...recipientIds, ...(await this.getCeoUserIds())]);
      targets.delete(actorId);
      const title = `${nombreActividad(label)} reprogramada`;
      const message = unir(
        `${actorName} la movió al ${fechaAviso(a)}`,
        de ? `Antes: ${fechaAviso(de)}` : null,
        motivo?.trim() ? `Motivo: ${motivo.trim()}` : null,
      );
      for (const uid of targets) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_RESCHEDULED',
          category: 'activities',
          title,
          message,
          icon: 'reprogramada',
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
          title: 'Solicitud de viático',
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
        title: 'Viático asignado',
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
      const title = status === 'approved' ? 'Viático aprobado' : 'Viático rechazado';
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
          title: 'Solicitud de herramienta',
          message: `${requesterName} solicitó: "${toolName}"`,
          relatedEntityId: toolRequestId,
          entityType: 'ToolRequest',
          relatedUrl: appUrls.erpHerramientas(toolRequestId, 'requests'),
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
      const title = status === 'approved' ? 'Herramienta aprobada' : 'Herramienta rechazada';
      const message = `Tu solicitud para "${toolName}" ha sido ${status === 'approved' ? 'aprobada' : 'rechazada'}`;

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'tools',
        title,
        message,
        relatedEntityId: toolRequestId,
        entityType: 'ToolRequest',
        relatedUrl: appUrls.erpHerramientas(toolRequestId, 'requests'),
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
          titulo: 'Multa por asistencia',
        },
        vehiculo: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: 'Multa por vehículos',
        },
        herramienta: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: 'Multa por herramientas',
        },
        actividad: {
          url: appUrls.erpFines(fineId),
          entityType: 'Fine',
          titulo: 'Multa por actividades',
        },
      };

      const fineConfig = tipoMulta && fineTypeMap[tipoMulta]
        ? fineTypeMap[tipoMulta]
        : {
            url: appUrls.erpFines(fineId),
            entityType: 'Fine',
            titulo: 'Nueva multa',
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
          title: `${documentType} subido`,
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
          title: 'Solicitud de renovación de herramienta',
          message: `${requesterName} solicitó renovar: "${toolName}"`,
          relatedEntityId: renewalId,
          entityType: 'ToolRenewal',
          relatedUrl: appUrls.erpHerramientas(renewalId, 'renewals'),
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
        title: 'Vehículo por vencer',
        message,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: appUrls.erpMisVehiculos(vehicleRequestId),
        priority: 'high',
      });

      const supervisors = await this.getSupervisors(userId);
      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'VEHICLE_USAGE_EXPIRING',
          category: 'vehicles',
          title: 'Vehículo por vencer',
          message,
          relatedEntityId: vehicleRequestId,
          entityType: 'VehicleControl',
          relatedUrl: appUrls.erpVehiculos(vehicleRequestId, 'requests'),
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
          title: 'Solicitud de vehículo',
          message: `${requesterName} solicitó: "${vehicleName}"`,
          relatedEntityId: vehicleRequestId,
          entityType: 'VehicleControl',
          relatedUrl: appUrls.erpVehiculos(vehicleRequestId, 'requests'),
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
        title: 'Vehículo aprobado',
        message: `Tu solicitud para "${vehicleName}" ha sido aprobada`,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: appUrls.erpVehiculos(vehicleRequestId, 'requests'),
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
        title: 'Vehículo rechazado',
        message: `Tu solicitud para "${vehicleName}" ha sido rechazada`,
        relatedEntityId: vehicleRequestId,
        entityType: 'VehicleControl',
        relatedUrl: appUrls.erpVehiculos(vehicleRequestId, 'requests'),
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
      // El token no trae el nombre: sin él los avisos decían «Usuario registró…».
      const nombreReal =
        actorName && actorName !== 'Usuario' ? actorName : await this.resolveActorName(actorId);
      const ceoIds = new Set(await this.getCeoUserIds());
      // Christian recibe el aviso con su propio formato: «Ana López agregó el cliente Plaza Dorada».
      for (const uid of ceoIds) {
        if (uid === actorId) continue;
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'SALES_CLIENT_CREATED',
          category: 'sales',
          title: `${persona(nombreReal)} agregó el cliente ${String(clientName || '').trim() || 'sin nombre'}`,
          message: 'Nuevo cliente en el padrón',
          icon: 'cliente',
          triggerUserId: actorId,
          relatedEntityId: clientId,
          entityType: 'SalesClient',
          relatedUrl: `/erp/clientes/${clientId}`,
          priority: 'normal',
          dedupeSeconds: 0,
        });
      }
      const recipients = (await this.getOperationalOversightRecipientIds(actorId)).filter((id) => !ceoIds.has(id));
      const msg = `${nombreReal} registró el cliente comercial «${clientName}».`;
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
      const actividad = nombreActividad(activityLabel);
      const quien = persona(actorName, 'Usuario');
      for (const uid of recipients) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: `${actividad} finalizada`,
          message: `${quien} la marcó como finalizada`,
          icon: 'finalizada',
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
          title: `${actividad} finalizada`,
          message: 'La marcaste como finalizada',
          icon: 'finalizada',
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/my-evidences?activityId=${activityId}`,
        });
      } else {
        await this.notificationsService.createNotification({
          userId: responsableId,
          type: 'ACTIVITY_COMPLETED',
          category: 'activities',
          title: `${actividad} finalizada`,
          message: `${quien} la marcó como finalizada`,
          icon: 'finalizada',
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
          relatedUrl: appUrls.erpAlmacen({ movementId }),
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
        relatedUrl: appUrls.erpAlmacen({ movementId }),
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

      const severityText = opts.severity === 'overspend' ? 'Sobrepresupuesto' : 'Margen bajo';
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
