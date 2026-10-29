import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { WORKDAY_TIMEZONE, workDateColumn, workDayStart } from '../../common/time/workday.js';
import { horaAviso, nombreCorto } from '../../notifications/notification-push-meta.js';
import { isNonEmployeeEmail } from '../../common/platform-accounts.js';
import { runScheduledJob } from '../../common/cron/run-scheduled-job.js';
import { resolveAccessScheduleKey } from '../../integra/access-schedule-defaults.js';
import { horarioDePersona } from '../../me/kpis-equipo.js';
import { minutoDelDia } from '../recordatorio-entrada.js';
import { avisoDeComidaQueToca, textoAvisoDeComida, ventanaDeComida } from './ventana-comida.js';

/** Los avisos de comida de cada quien: con esta entidad se decide «ya le avisé hoy». */
const ENTIDAD_AVISO = 'AvisoComida';

@Injectable()
export class LunchBreaksCronService {
  private readonly logger = new Logger(LunchBreaksCronService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Avisos de comida de cada quien, a su hora (29-10-2026). Antes eran dos cron fijos (14:50 y
   * 16:05) filtrados por roles con acceso a consola, y ningún rol activo lo tenía: en 14 días no
   * salió un solo aviso. Ahora, cada minuto de la tarde, a quien está en jornada (checó entrada y
   * no ha salido) y tiene horario:
   * - 10 min antes de que abra su ventana (oficina 14:50; cuadrilla 12:50), si no ha salido a comer;
   * - al pasar su hora de regreso, si no ha registrado que volvió.
   * Reglas en `ventana-comida.ts`. Cada aviso una vez al día: se decide mirando `notifications`.
   */
  @Cron('* 12-18 * * *', { name: 'comida-avisos', timeZone: WORKDAY_TIMEZONE })
  async avisosDeComida() {
    await runScheduledJob('comida:avisos', this.logger, () => this.revisarAvisos(new Date()));
  }

  /** Expuesto para las pruebas. Devuelve a quién le mandó cada aviso. */
  async revisarAvisos(ahora: Date): Promise<{ porSalir: number[]; regresa: number[] }> {
    const enviados = { porSalir: [] as number[], regresa: [] as number[] };
    const hoy = workDateColumn(ahora);
    const jornadas = await this.prisma.attendanceDay.findMany({
      where: { date: hoy, isOpen: true },
      select: { userId: true, companyId: true },
    });
    if (!jornadas.length) return enviados;
    const ids = jornadas.map((j) => j.userId);
    const empresaDe = new Map(jornadas.map((j) => [j.userId, j.companyId]));

    const [usuarios, comidas, avisados] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: {
          id: true,
          email: true,
          roleKey: true,
          tipoContrato: true,
          role: { select: { orgRoleKey: true } },
          horario: { select: { horaEntrada: true, horaSalida: true, dias: true, graciaMin: true, jornadaOrdinariaMin: true } },
        },
      }),
      this.prisma.lunchBreak.findMany({
        where: { userId: { in: ids }, date: hoy },
        select: { id: true, userId: true, checkinTime: true, checkoutTime: true },
      }),
      this.prisma.notification.findMany({
        where: {
          userId: { in: ids },
          entityType: ENTIDAD_AVISO,
          type: { in: [NotificationType.LUNCH_CHECKIN, NotificationType.LUNCH_CHECKOUT] },
          createdAt: { gte: workDayStart(ahora) },
        },
        select: { userId: true, type: true },
      }),
    ]);
    const comidaDe = new Map(comidas.map((c) => [c.userId, c]));
    const yaSalida = new Set(avisados.filter((n) => n.type === NotificationType.LUNCH_CHECKIN).map((n) => n.userId));
    const yaRegreso = new Set(avisados.filter((n) => n.type === NotificationType.LUNCH_CHECKOUT).map((n) => n.userId));
    const minuto = minutoDelDia(ahora);

    for (const u of usuarios) {
      if (isNonEmployeeEmail(u.email) || /\.invalid$/i.test(String(u.email ?? '').trim())) continue;
      const horario = horarioDePersona(
        resolveAccessScheduleKey({ isActive: true, roleKey: u.roleKey, orgRoleKey: u.role?.orgRoleKey ?? null, tipoContrato: u.tipoContrato }),
        u.horario ?? null,
      );
      // Dirección (24/7) no registra comida con horario.
      if (!horario.entrada) continue;
      const ventana = ventanaDeComida(horario);
      const comida = comidaDe.get(u.id) ?? null;
      const aviso = avisoDeComidaQueToca({
        ventana,
        minuto,
        salida: comida ? minutoDelDia(comida.checkinTime) : null,
        regreso: comida?.checkoutTime ? minutoDelDia(comida.checkoutTime) : null,
        yaAvisadoSalida: yaSalida.has(u.id),
        yaAvisadoRegreso: yaRegreso.has(u.id),
      });
      if (!aviso) continue;
      const { title, message } = textoAvisoDeComida(aviso, ventana);
      const fila = await this.notificationsService
        .createNotification({
          userId: u.id,
          type: aviso === 'por-salir' ? NotificationType.LUNCH_CHECKIN : NotificationType.LUNCH_CHECKOUT,
          category: 'lunch_break',
          title,
          message,
          icon: aviso === 'por-salir' ? 'comida_sale' : 'comida_tarde',
          entityType: ENTIDAD_AVISO,
          relatedEntityId: aviso === 'por-salir' ? u.id : comida!.id,
          priority: aviso === 'regresa' ? 'high' : 'normal',
          relatedUrl: '/erp/asistencias?tab=comidas',
          collapseKey: `nx_comida_u${u.id}`,
          reemplazar: true,
          dedupeSeconds: 0,
          companyId: empresaDe.get(u.id) ?? null,
        })
        .catch((error) => {
          this.logger.warn(`Aviso de comida u${u.id}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
      if (fila) (aviso === 'por-salir' ? enviados.porSalir : enviados.regresa).push(u.id);
    }
    if (enviados.porSalir.length || enviados.regresa.length) {
      this.logger.log(
        `Avisos de comida ${horaAviso(ahora)}: por salir [${enviados.porSalir.map((id) => `u${id}`).join(', ')}]` +
          ` · regresa [${enviados.regresa.map((id) => `u${id}`).join(', ')}]`,
      );
    }
    return enviados;
  }

  // Notificación para admins cuando usuarios registran comida (solo en horario de trabajo)
  async notifyAdminUserLunchBreak(userData: { id: number; nombre: string; email: string }, type: 'checkin' | 'checkout', photoUrl?: string) {
    try {
      const adminUsers = await this.prisma.user.findMany({
        where: {
          role: {
            accesoConsoleAdmin: true,
          },
        },
        select: { id: true },
      });

      const isSuperAdmin = isNonEmployeeEmail(userData.email);
      
      const nombre = nombreCorto(userData.nombre) || 'Alguien del equipo';
      const hora = horaAviso(new Date());
      const messages = {
        checkin: `${hora} · Registro con foto`,
        checkout: `${hora} · Registro con foto`,
      };

      const titles = {
        checkin: `${nombre} salió a comer`,
        checkout: `${nombre} regresó de comer`,
      };

      // Si es un usuario normal, notificar a admins
      // Si es admin, notificar a superadmins y otros admins
      let targetUserIds = [];

      if (!isSuperAdmin && !userData.email.includes('@nexara.com.mx')) {
        // Usuario normal -> notificar a admins
        targetUserIds = adminUsers.map((u: any) => u.id);
      } else if (adminUsers.length > 0) {
        // Admin -> notificar a otros admins y superadmins
        targetUserIds = adminUsers.map((u: any) => u.id).filter((id: any) => id !== userData.id);
      }

      if (targetUserIds.length > 0) {
        const notifications = targetUserIds.map((userId: any) => ({
          userId,
          type: type === 'checkin' ? NotificationType.LUNCH_CHECKIN : NotificationType.LUNCH_CHECKOUT,
          category: 'lunch_break',
          title: titles[type],
          message: messages[type],
          icon: type === 'checkin' ? 'comida_sale' : 'comida_regresa',
          isRead: false,
          entityType: 'lunch_break',
          priority: 'normal',
          createdAt: new Date(),
        }));

        await this.pushAll(notifications);

        this.broadcastNotification(`lunch_break:${type}`, { user: userData, targetUsers: targetUserIds });
      }
    } catch (error) {
      this.logger.error(`Error notificando admin sobre comida de usuario:`, error);
    }
  }

  /** Cada aviso por NotificationsService para que también salga push (createMany solo llenaba la campana). */
  private async pushAll(
    notifications: Array<{
      userId: number;
      type: NotificationType;
      category: string;
      title: string;
      message: string;
      entityType: string;
      priority: string;
      icon?: string;
    }>,
  ) {
    for (const n of notifications) {
      await this.notificationsService
        .createNotification({
          userId: n.userId,
          type: n.type,
          category: n.category,
          title: n.title,
          message: n.message,
          icon: n.icon,
          entityType: n.entityType,
          priority: n.priority === 'high' ? 'high' : 'normal',
          relatedUrl: '/erp/asistencias',
          dedupeSeconds: 0,
        })
        .catch((error) =>
          this.logger.warn(
            `Aviso de comida userId=${n.userId}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
  }

  private broadcastNotification(event: string, data: any) {
    // Aquí iría la integración con WebSocket/Socket.io
    // Por ahora solo logging
    this.logger.log(`WebSocket event: ${event}`, data);
  }
}
