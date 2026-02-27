import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService, INotificationPayload } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Servicio que maneja notificaciones jerárquicas
 * Determina a quién notificar en la cadena de mando
 */
@Injectable()
export class NotificationHierarchyService {
  private readonly logger = new Logger(NotificationHierarchyService.name);

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
   * Obtener solo SuperAdmins
   */
  private async getSuperAdmins() {
    try {
      return await this.prisma.user.findMany({
        where: {
          role: {
            accesoConsoleAdmin: true,
          },
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
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) return;

      const isAdmin = (user.role as any)?.accesoConsoleAdmin === true;

      const actionText = type === 'ATTENDANCE_CHECKIN' ? 'entró a laborar' : 'dejó de laborar';

      if (isAdmin) {
        // Admin entra/sale -> notificar a otros admins
        const otherAdmins = await this.getSuperAdmins();
        for (const admin of otherAdmins.filter(a => a.id !== userId)) {
          await this.notificationsService.createNotification({
            userId: admin.id,
            type,
            category: 'attendance',
            title: `Admin ${type === 'ATTENDANCE_CHECKIN' ? 'en línea' : 'fuera de línea'}`,
            message: `${userName} ${actionText}`,
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
            message: `${userName} ${actionText}`,
            triggerUserId: userId,
            relatedUrl: `/console/attendance`,
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
          relatedUrl: `/console/attendance?tab=lunch`,
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
        relatedUrl: `/console/activities?id=${activityId}`,
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
          relatedUrl: `/console/activities?id=${activityId}`,
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
        relatedUrl: `/console/activities?id=${activityId}`,
        priority: status === 'rejected' ? 'high' : 'normal',
      });
    } catch (error) {
      this.logger.error(`Error notifying activity review:`, error);
    }
  }

  /**
   * Notificar evidencia subida
   */
  async notifyEvidenceSubmitted(
    userId: number,
    activityId: number,
    activityTitle: string,
    submitterName: string,
  ) {
    try {
      const supervisors = await this.getSupervisors(userId);

      for (const supervisor of supervisors) {
        await this.notificationsService.createNotification({
          userId: supervisor.id,
          type: 'EVIDENCE_SUBMITTED',
          category: 'evidences',
          title: '📸 Nueva evidencia subida',
          message: `${submitterName} subió evidencia para "${activityTitle}"`,
          relatedEntityId: activityId,
          entityType: 'Activity',
          relatedUrl: `/console/evidences?activityId=${activityId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying evidence submitted:`, error);
    }
  }

  /**
   * Notificar aprobación/rechazo de evidencia
   */
  async notifyEvidenceReview(
    userId: number,
    activityId: number,
    status: 'approved' | 'rejected',
    reviewerName: string,
  ) {
    try {
      const type = status === 'approved' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED';
      const title = status === 'approved' ? '✅ Evidencia aprobada' : '❌ Evidencia rechazada';

      await this.notificationsService.createNotification({
        userId,
        type,
        category: 'evidences',
        title,
        message: `Tu evidencia ha sido ${status === 'approved' ? 'aprobada' : 'rechazada'} por ${reviewerName}`,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: `/console/evidences?activityId=${activityId}`,
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
          relatedUrl: `/console/viatics?id=${viaticId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying viatico requested:`, error);
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
        relatedUrl: `/console/viatics?id=${viaticId}`,
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
          relatedUrl: `/console/tools/requests?id=${toolRequestId}`,
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
        relatedUrl: `/console/tools?id=${toolRequestId}`,
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
          url: '/panel/asistencia',
          entityType: 'Attendance',
          titulo: '⏰ Multa por Asistencia',
        },
        vehiculo: {
          url: '/panel/vehiculos',
          entityType: 'Vehicle',
          titulo: '🚗 Multa por Vehículos',
        },
        herramienta: {
          url: '/panel/herramientas',
          entityType: 'ToolRequest',
          titulo: '🔧 Multa por Herramientas',
        },
        actividad: {
          url: '/panel/actividades',
          entityType: 'Activity',
          titulo: '📋 Multa por Actividades',
        },
      };

      const fineConfig = tipoMulta && fineTypeMap[tipoMulta]
        ? fineTypeMap[tipoMulta]
        : {
            url: '/panel/multas',
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
          relatedUrl: `/console/users?id=${userId}`,
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
          relatedUrl: `/console/tools/renewals?id=${renewalId}`,
          priority: 'high',
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying tool renewal requested:`, error);
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
          relatedUrl: `/console/vehicles?id=${vehicleRequestId}`,
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
        relatedUrl: `/console/vehicles?id=${vehicleRequestId}`,
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
        relatedUrl: `/console/vehicles?id=${vehicleRequestId}`,
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`Error notifying vehicle rejected:`, error);
    }
  }
}
