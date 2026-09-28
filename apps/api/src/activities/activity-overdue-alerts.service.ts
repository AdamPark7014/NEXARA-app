import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { appUrls } from '../common/app-urls.js';
import {
  CLAVE_RECORDATORIO_ATRASO,
  decisionAvisoAtraso,
  etiquetaSemaforo,
  evaluarSemaforo,
  horasRecordatorioDe,
} from './semaforo-actividad.js';
import {
  destinatariosDeAtraso,
  esCoordinacionDeDepartamento,
  ROLES_COORDINACION_DEPARTAMENTO,
  type PersonaAviso,
} from './activity-overdue-recipients.js';

const LOTE = 400;

type Fila = {
  id: number;
  companyId: number;
  titulo: string;
  estatus: string;
  fechaInicio: Date | null;
  fechaMaxima: Date | null;
  fechaEntregaEsperada: Date | null;
  periodoInicio: Date | null;
  periodoFin: Date | null;
  overdueAlertedAt: Date | null;
  responsableId: number;
  client: { name: string } | null;
  assignees: Array<{ userId: number; inicioRealAt: Date | null; finRealAt: Date | null; retiradoAt: Date | null }>;
};

/**
 * Cada cinco minutos: si una actividad acaba de ponerse roja, avisa por la
 * campana y por push (el mismo `createNotification` manda las dos) a quien la
 * tiene, a su jefe directo y a la coordinación de su departamento.
 *
 * La marca `overdueAlertedAt` evita repetir. Se borra cuando deja de estar en
 * rojo. Un recordatorio cada N horas es optativo
 * (`activities.overdue_reminder_hours` en `system_settings`, por empresa; 0 = solo una vez).
 *
 * El cron no trae empresa en el request: cada lectura y cada escritura filtra
 * por `companyId`. No usa llaves únicas compuestas.
 */
@Injectable()
export class ActivityOverdueAlertsService {
  private readonly logger = new Logger(ActivityOverdueAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/5 * * * *', { name: 'actividades-atrasadas' })
  async avisarAtrasos() {
    await runScheduledJob('actividades:atrasadas', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Devuelve cuántos avisos se mandaron. */
  async revisar(ahora = new Date()): Promise<number> {
    const hoy = new Date(ahora);
    hoy.setUTCHours(0, 0, 0, 0);
    const filas = (await this.prisma.activity.findMany({
      where: {
        deletedAt: null,
        OR: [
          { overdueAlertedAt: { not: null } },
          { fechaInicio: { lt: ahora } },
          { fechaMaxima: { lt: ahora } },
          { fechaEntregaEsperada: { lt: ahora } },
          { periodoFin: { lt: hoy } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        titulo: true,
        estatus: true,
        fechaInicio: true,
        fechaMaxima: true,
        fechaEntregaEsperada: true,
        periodoInicio: true,
        periodoFin: true,
        overdueAlertedAt: true,
        responsableId: true,
        client: { select: { name: true } },
        assignees: {
          where: { retiradoAt: null },
          select: { userId: true, inicioRealAt: true, finRealAt: true, retiradoAt: true },
        },
      },
      orderBy: { id: 'asc' },
      take: LOTE,
    })) as Fila[];

    const horasPorEmpresa = new Map<number, number>();
    const avisar: Fila[] = [];
    const limpiar = new Map<number, number[]>();

    for (const fila of filas) {
      const luz = evaluarSemaforo({
        ...fila,
        inicioRealAt: fila.assignees.find((a) => a.inicioRealAt)?.inicioRealAt ?? null,
        finRealAt: fila.assignees.every((a) => a.finRealAt) && fila.assignees.length
          ? fila.assignees[fila.assignees.length - 1].finRealAt
          : null,
        ahora,
      });
      const horas = await this.horasDe(fila.companyId, horasPorEmpresa);
      const decision = decisionAvisoAtraso({
        enRojo: luz.semaforo === 'rojo',
        overdueAlertedAt: fila.overdueAlertedAt,
        ahora,
        horasRecordatorio: horas,
      });
      if (decision.limpiar) {
        const lista = limpiar.get(fila.companyId) ?? [];
        lista.push(fila.id);
        limpiar.set(fila.companyId, lista);
      } else if (decision.avisar) {
        avisar.push(fila);
      }
    }

    for (const [companyId, ids] of limpiar) {
      await this.prisma.activity.updateMany({
        where: { id: { in: ids }, companyId, overdueAlertedAt: { not: null } },
        data: { overdueAlertedAt: null },
      });
    }

    let enviados = 0;
    for (const fila of avisar) {
      const ok = await this.avisarUna(fila, ahora);
      if (ok) enviados += 1;
    }
    if (enviados > 0) this.logger.log(`Actividades atrasadas: ${enviados} aviso(s)`);
    return enviados;
  }

  private async horasDe(companyId: number, cache: Map<number, number>): Promise<number> {
    const previa = cache.get(companyId);
    if (previa != null) return previa;
    const filas = await this.prisma.systemSetting.findMany({
      where: {
        key: CLAVE_RECORDATORIO_ATRASO,
        OR: [{ companyId }, { companyId: null }],
      },
      select: { companyId: true, value: true },
    });
    const propia = filas.find((f) => f.companyId === companyId) ?? filas.find((f) => f.companyId == null);
    const horas = horasRecordatorioDe(propia?.value);
    cache.set(companyId, horas);
    return horas;
  }

  private async avisarUna(fila: Fila, ahora: Date): Promise<boolean> {
    const luz = evaluarSemaforo({
      ...fila,
      inicioRealAt: fila.assignees.find((a) => a.inicioRealAt)?.inicioRealAt ?? null,
      ahora,
    });
    if (luz.semaforo !== 'rojo') return false;

    const genteIds = [
      ...new Set([fila.responsableId, ...fila.assignees.map((a) => a.userId)].filter((id) => id > 0)),
    ];
    const personas = await this.prisma.user.findMany({
      where: { id: { in: genteIds }, isActive: true },
      select: {
        id: true,
        managerId: true,
        departmentId: true,
        roleKey: true,
        email: true,
        department: { select: { companyId: true } },
      },
    });
    const deLaEmpresa = personas.filter((p) => p.department?.companyId === fila.companyId);
    const jefesIds = [...new Set(deLaEmpresa.map((p) => p.managerId).filter((id): id is number => id != null && id > 0))];
    const jefes = jefesIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: jefesIds }, isActive: true },
          select: { id: true, department: { select: { companyId: true } } },
        })
      : [];
    const jefeDeEmpresa = new Set(jefes.filter((j) => j.department?.companyId === fila.companyId).map((j) => j.id));

    const deptIds = [...new Set(deLaEmpresa.map((p) => p.departmentId).filter((id): id is number => id != null))];
    const coordinadores = deptIds.length
      ? await this.prisma.user.findMany({
          where: {
            isActive: true,
            departmentId: { in: deptIds },
            department: { companyId: fila.companyId },
            OR: [
              { roleKey: { in: [...ROLES_COORDINACION_DEPARTAMENTO] } },
              { email: { equals: 'jose.ramirez@nexara.com.mx', mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            managerId: true,
            departmentId: true,
            roleKey: true,
            email: true,
            department: { select: { companyId: true } },
          },
        })
      : [];

    const equipo: PersonaAviso[] = deLaEmpresa.map((p) => ({
      id: p.id,
      managerId: p.managerId != null && jefeDeEmpresa.has(p.managerId) ? p.managerId : null,
      departmentId: p.departmentId,
      roleKey: p.roleKey,
      email: p.email,
      companyId: p.department?.companyId ?? null,
    }));
    const coords: PersonaAviso[] = coordinadores
      .filter((c) => esCoordinacionDeDepartamento(c))
      .map((c) => ({
        id: c.id,
        managerId: null,
        departmentId: c.departmentId,
        roleKey: c.roleKey,
        email: c.email,
        companyId: c.department?.companyId ?? null,
      }));
    const destinos = destinatariosDeAtraso(fila.companyId, equipo, coords);
    if (!destinos.length) {
      this.logger.warn(`Actividad ${fila.id} atrasada sin destinatarios en la empresa ${fila.companyId}`);
      return false;
    }

    const nombre = (fila.titulo || '').trim() || 'Actividad sin nombre';
    const detalle =
      luz.motivo === 'inicio'
        ? 'Pasó su hora de inicio y no se ha iniciado'
        : 'Pasó su fecha límite y sigue abierta';
    const cliente = fila.client?.name?.trim();
    const message = [detalle, etiquetaSemaforo(luz).replace(/^Atrasada · /, ''), cliente].filter(Boolean).join(' · ');

    let alguno = false;
    for (const userId of destinos) {
      try {
        await this.notifications.createNotification({
          userId,
          type: 'ACTIVITY_OVERDUE',
          category: 'activities',
          title: `${nombre} está atrasada`,
          message,
          icon: 'vencida',
          relatedEntityId: fila.id,
          entityType: 'Activity',
          relatedUrl: appUrls.erpActividad(fila.id),
          priority: 'high',
          channel: 'ops',
          collapseKey: `nx_atraso_${fila.id}`,
          dedupeSeconds: 0,
          companyId: fila.companyId,
        });
        alguno = true;
      } catch (error) {
        this.logger.warn(
          `Aviso de atraso ${fila.id} → ${userId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (!alguno) return false;

    await this.prisma.activity.updateMany({
      where: { id: fila.id, companyId: fila.companyId },
      data: { overdueAlertedAt: ahora },
    });
    return true;
  }
}
