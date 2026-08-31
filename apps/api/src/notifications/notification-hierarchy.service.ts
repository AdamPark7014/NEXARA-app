import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService, INotificationPayload } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestCompanyId } from '../common/tenant/tenant-context.js';

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
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) return;

      const isAdmin = (user.role as any)?.accesoConsoleAdmin === true;

      const actionText = type === 'ATTENDANCE_CHECKIN' ? 'entró a laborar' : 'dejó de laborar';
      const deviceText = deviceInfo ? ` desde ${deviceInfo}` : '';

      if (isAdmin) {
        // Admin entra/sale -> notificar a otros admins
        const otherAdmins = await this.getSuperAdmins();
        for (const admin of otherAdmins.filter(a => a.id !== userId)) {
          await this.notificationsService.createNotification({
            userId: admin.id,
            type,
            category: 'attendance',
            title: `Admin ${type === 'ATTENDANCE_CHECKIN' ? 'en línea' : 'fuera de línea'}`,
            message: `${userName} ${actionText}${deviceText}`,
            triggerUserId: userId,
            priority: 'high',
          });
        }
      } else {
        // Usuario normal -> notificar a admins del depto
        const supervisors = await this.getSupervisors(userId);
        for (const supervisor of supervisors) {
          await this.notificationsService.createNotification({
            userId: supervisor.id,
            type,
            category: 'attendance',
            title: type === 'ATTENDANCE_CHECKIN' ? 'Usuario en línea' : 'Usuario fuera de línea',
            message: `${userName} ${actionText}${deviceText}`,
            triggerUserId: userId,
            relatedUrl: `/erp/hr/attendance`,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error notifying attendance change:`, error);
    }
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
      const supervisors = await this.getSupervisors(userId);
      const actionText = type === 'LUNCH_CHECKIN' ? 'entró a comida' : 'regresó del descanso';

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type,
          category: 'lunch_breaks',
          title: type === 'LUNCH_CHECKIN' ? 'Usuario en comida' : 'Usuario regresó',
          message: `${userName} ${actionText}`,
          triggerUserId: userId,
          relatedUrl: `/erp/hr/lunch-breaks?highlight=${userId}`,
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying lunch break change:`, error);
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
  ) {
    try {
      // Notificar al usuario asignado
      await this.notificationsService.createNotification({
        userId,
        type: 'ACTIVITY_ASSIGNED',
        category: 'activities',
        title: '✨ Nueva actividad asignada',
        message: `Se te ha asignado: "${activityTitle}". Revísala en tu plataforma.`,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/ops/activities/${activityId}`,
        priority: 'high',
      });

      // Notificar a supervisores
      const supervisors = await this.getSupervisors(userId);
      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: 'Actividad asignada a equipo',
          message: `${assignedByName} asignó "${activityTitle}" a un miembro del equipo`,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/activities/${activityId}`,
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
  ) {
    try {
      const ref = (anNumber && String(anNumber).trim()) || `ID ${activityId}`;
      const titleAct = (activityTitle && String(activityTitle).trim()) || `Actividad ${ref}`;
      const message = `${submitterName} completó el flujo de evidencias de "${titleAct}" (${ref}). Entra a revisarla.`;

      const recipientIds = new Set(await this.getEvidenceReviewerUserIds(submitterUserId));
      for (const sup of await this.getSupervisors(submitterUserId)) {
        recipientIds.add(sup.id);
      }

      for (const uid of recipientIds) {
        await this.notificationsService.createNotification({
          userId: uid,
          type: 'EVIDENCE_SUBMITTED',
          category: 'evidences',
          title: '📋 Evidencia lista para revisión',
          message,
          triggerUserId: submitterUserId,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/ops/activities/${activityId}/evidences`,
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
  ) {
    try {
      const type = status === 'approved' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED';
      const title = status === 'approved' ? '✅ Evidencia aprobada' : '❌ Evidencia rechazada';
      const base = (activityTitle && String(activityTitle).trim()) || `Actividad ${activityId}`;
      const message =
        status === 'approved'
          ? `${reviewerName} aprobó la evidencia de "${base}".`
          : `${reviewerName} rechazó la evidencia de "${base}".${notes ? ` Observaciones: ${notes}` : ''}`;

      await this.notificationsService.createNotification({
        userId: responsableUserId,
        type,
        category: 'evidences',
        title,
        message,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/ops/my-evidences?activityId=${activityId}`,
        priority: status === 'rejected' ? 'high' : 'normal',
      });
    } catch (error) {
      this.logger.error(`Error notifying evidence review:`, error);
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
          relatedUrl: `/ops/tools?highlight=${toolRequestId}`,
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
        relatedUrl: `/ops/tools?highlight=${toolRequestId}`,
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
          url: '/erp/hr/attendance',
          entityType: 'Attendance',
          titulo: '⏰ Multa por Asistencia',
        },
        vehiculo: {
          url: '/ops/vehicles',
          entityType: 'Vehicle',
          titulo: '🚗 Multa por Vehículos',
        },
        herramienta: {
          url: '/ops/tools',
          entityType: 'ToolRequest',
          titulo: '🔧 Multa por Herramientas',
        },
        actividad: {
          url: '/ops/my-activities',
          entityType: 'Activity',
          titulo: '📋 Multa por Actividades',
        },
      };

      const fineConfig = tipoMulta && fineTypeMap[tipoMulta]
        ? fineTypeMap[tipoMulta]
        : {
            url: `/erp/hr/fines?highlight=${fineId}`,
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
          relatedUrl: `/ops/tools?highlight=${renewalId}`,
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
          relatedUrl: `/ops/vehicles?highlight=${vehicleRequestId}`,
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
          relatedUrl: `/ops/vehicles?highlight=${vehicleRequestId}`,
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
        relatedUrl: `/ops/vehicles?highlight=${vehicleRequestId}`,
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
        relatedUrl: `/ops/vehicles?highlight=${vehicleRequestId}`,
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
