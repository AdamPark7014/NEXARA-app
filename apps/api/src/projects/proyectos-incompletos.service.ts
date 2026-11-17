/**
 * Aviso diario a quien creó un proyecto incompleto (L–S 09:00 México).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import { WORKDAY_TIMEZONE, workDateKey, workDayBounds } from '../common/time/workday.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { esNombreDeRelleno } from '../ventas/client-sectors.js';
import {
  evaluarCompletitud,
  mensajeFaltantes,
  type EntradaCompletitud,
} from './proyecto-completitud.js';

export const CATEGORIA_PROYECTOS_INCOMPLETOS = 'proyectos-incompletos';

export type ProyectoParaAviso = {
  id: number;
  title: string;
  status: string;
  createdById?: number | null;
  vendorId: number;
  companyId?: number;
  responsableId?: number | null;
  createdAt?: Date | null;
  client?: { id?: number | null; name?: string | null; deletedAt?: Date | null } | null;
  projectType?: string | null;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  objective?: string | null;
  scopeSummary?: string | null;
  scopeItems?: Array<{ kind?: string | null }>;
  milestones?: Array<{ plannedDate?: Date | null; status?: string | null }>;
  activities?: Array<{ estatus?: string | null }>;
  documents?: Array<{ kind?: string | null; nombre?: string | null; titulo?: string | null }>;
};

export function entradaDeProyecto(p: ProyectoParaAviso): EntradaCompletitud {
  return {
    title: p.title,
    clientName: p.client?.name,
    clientDeletedAt: p.client?.deletedAt,
    clientId: p.client?.id ?? null,
    clientEsRelleno: esNombreDeRelleno(p.client?.name),
    projectType: p.projectType,
    description: p.description,
    responsableId: p.responsableId,
    startDate: p.startDate,
    endDate: p.endDate,
    objective: p.objective,
    scopeSummary: p.scopeSummary,
    scopeItems: p.scopeItems,
    milestones: p.milestones,
    activities: p.activities,
    documents: p.documents,
  };
}

/** Vigente incompleto: sin FICHA, o ACTIVE sin PLAN. */
export function proyectoRequiereAviso(p: ProyectoParaAviso): boolean {
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return false;
  const c = evaluarCompletitud(entradaDeProyecto(p));
  if (!c.fichaOk) return true;
  if (p.status === 'ACTIVE' && !c.planOk) return true;
  return false;
}

export function destinatariosAviso(p: ProyectoParaAviso): number[] {
  const creador = p.createdById ?? p.vendorId;
  const ids = new Set<number>();
  if (creador) ids.add(creador);
  if (p.responsableId && p.responsableId !== creador) ids.add(p.responsableId);
  return [...ids];
}

export function textoAvisoProyectos(
  proyectos: Array<{ id: number; title: string; faltantesEtiquetas: string[] }>,
): { title: string; message: string; relatedUrl: string } {
  if (proyectos.length === 1) {
    const p = proyectos[0];
    const faltan = mensajeFaltantes(
      p.faltantesEtiquetas.map((etiqueta) => ({ clave: etiqueta, etiqueta, ayuda: '' })),
    );
    return {
      title: 'Proyecto incompleto',
      message: `Tu proyecto "${p.title}" está incompleto: ${faltan}. Corrígelo aquí.`,
      relatedUrl: `/erp/proyectos/${p.id}?completar=1`,
    };
  }
  const lista = proyectos.map((p) => `«${p.title}»`).join(', ');
  return {
    title: `${proyectos.length} proyectos incompletos`,
    message: `Tienes ${proyectos.length} proyectos incompletos: ${lista}. Corrígelos en Proyectos.`,
    relatedUrl: '/erp/proyectos?incompletos=1',
  };
}

/** Días hábiles L–S entre dos fechas (inclusive del inicio, exclusive del fin? cuenta días con aviso). */
export function diasHabilesSeguidos(desde: Date, hasta: Date): number {
  let n = 0;
  const cur = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const end = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  while (cur.getTime() <= end) {
    const dow = cur.getUTCDay(); // 0=dom
    if (dow !== 0) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

export function diasPreviosHabiles(ahora: Date, cantidad: number): string[] {
  const cursor = new Date(workDateKey(ahora) + 'T12:00:00Z');
  const dias: string[] = [];
  while (dias.length < cantidad) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (cursor.getUTCDay() !== 0) dias.push(cursor.toISOString().slice(0, 10));
  }
  return dias;
}

@Injectable()
export class ProyectosIncompletosService {
  private readonly logger = new Logger(ProyectosIncompletosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 9 * * 1-6', { name: 'proyectos-incompletos', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('avisos:proyectos-incompletos', this.logger, () => this.revisar());
  }

  private cola: Promise<unknown> = Promise.resolve();
  revisar(ahora = new Date()): Promise<number> {
    const tarea = this.cola.then(() => this.revisarConjunto(ahora));
    this.cola = tarea.catch((error) => this.logger.error('No se pudo revisar proyectos incompletos', error));
    return tarea;
  }
  private async revisarConjunto(ahora: Date): Promise<number> {
    const proyectos = await this.prisma.operationalProject.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: {
        id: true,
        companyId: true,
        title: true,
        status: true,
        createdById: true,
        vendorId: true,
        responsableId: true,
        createdAt: true,
        projectType: true,
        description: true,
        startDate: true,
        endDate: true,
        objective: true,
        scopeSummary: true,
        client: { select: { id: true, name: true } },
        scopeItems: { select: { kind: true } },
        milestones: { select: { plannedDate: true, status: true } },
        activities: { select: { estatus: true } },
        documents: { select: { kind: true, nombre: true } },
      },

    });

    const incompletos = (proyectos as ProyectoParaAviso[]).filter(proyectoRequiereAviso);
    if (!incompletos.length) return 0;

    const porPersona = new Map<number, ProyectoParaAviso[]>();
    for (const p of incompletos) {
      for (const uid of destinatariosAviso(p)) {
        const lista = porPersona.get(uid) ?? [];
        lista.push(p);
        porPersona.set(uid, lista);
      }
    }

    // Historial por proyecto en la URL: permite contar días consecutivos sin agregar columnas.
    const historial = await this.prisma.notification.findMany({
      where: { category: CATEGORIA_PROYECTOS_INCOMPLETOS, createdAt: { gte: new Date(ahora.getTime() - 8 * 86400000) } },
      select: { id: true, userId: true, createdAt: true, relatedEntityId: true, relatedUrl: true },
    });
    const previos = diasPreviosHabiles(ahora, 2);
    const idsDe = (n: typeof historial[number]) => {
      const ids = new URL(n.relatedUrl || '/', 'https://nexara.local').searchParams.get('proyectos');
      return ids ? ids.split(',').map(Number) : [n.relatedEntityId];
    };
    const escalados = new Map<number, ProyectoParaAviso[]>();
    for (const p of incompletos) {
      const creador = p.createdById ?? p.vendorId;
      if (!previos.every((dia) => historial.some((n) => n.userId === creador && workDateKey(n.createdAt) === dia && idsDe(n).includes(p.id)))) continue;
      const empresa = await this.prisma.operationalProject.findUnique({ where: { id: p.id }, select: { companyId: true } });
      const supervisor = await this.prisma.user.findFirst({ where: { roleKey: ROLES.DIR_OPERACIONES, isActive: true, companyMemberships: { some: { companyId: empresa?.companyId } } }, select: { id: true }, orderBy: { id: 'asc' } });
      if (supervisor) escalados.set(supervisor.id, [...(escalados.get(supervisor.id) || []), p]);
    }
    for (const [uid, lista] of escalados) {
      const propios = porPersona.get(uid) || [];
      porPersona.set(uid, [...new Map([...propios, ...lista].map((p) => [p.id, p])).values()]);
    }
    let enviados = 0;
    const hoyKey = workDateKey(ahora);
    const { start, end } = workDayBounds(ahora);
    for (const [userId, lista] of porPersona) {
      const ya = historial.find((n) => n.userId === userId && n.createdAt >= start && n.createdAt <= end);
      const payload = textoAvisoProyectos(lista.map((p) => {
        const c = evaluarCompletitud(entradaDeProyecto(p));
        return { id: p.id, title: p.title, faltantesEtiquetas: c.faltantes.filter((f) => !c.fichaOk ? ['nombre_descriptivo', 'cliente_valido', 'tipo', 'responsable', 'fecha_inicio', 'fecha_fin'].includes(f.clave) : ['alcance', 'cronograma', 'actividad'].includes(f.clave)).map((f) => f.etiqueta) };
      }));
      const relatedUrl = payload.relatedUrl + (payload.relatedUrl.includes('?') ? '&' : '?') + 'proyectos=' + lista.map((p) => p.id).join(',');
      if (ya) {
        // Si nació otro hoy, se agrega al aviso del día, sin un segundo push.
        if (lista.some((p) => !idsDe(ya).includes(p.id))) await this.prisma.notification.update({ where: { id: ya.id }, data: { title: payload.title, message: payload.message, relatedUrl } });
        continue;
      }
      await this.notifications.createNotification({ userId, type: 'WORKFLOW_PENDING', category: CATEGORIA_PROYECTOS_INCOMPLETOS, companyId: lista[0].companyId, title: escalados.has(userId) ? 'Proyectos pendientes de completar' : payload.title, message: payload.message, entityType: 'OperationalProject', relatedEntityId: lista[0].id, relatedUrl, collapseKey: 'nx_proy_inc_u' + userId + '_' + hoyKey, entrega: 'siempre', dedupeSeconds: 0 });
      enviados++;
    }

    this.logger.log(`Avisos de proyectos incompletos: ${enviados}`);
    return enviados;
  }

  /** Al nacer un proyecto incompleto (altas automáticas). */
  async avisarAlNacer(proyectoId: number, actorId?: number | null) {
    // Revisa el conjunto para agrupar también varias altas automáticas en un solo aviso.
    try { return (await this.revisar()) > 0; }
    catch (error) { this.logger.error('Proyecto creado; no se pudo enviar el aviso inicial. El cron lo reintentará.', error); return false; }
  }
}
