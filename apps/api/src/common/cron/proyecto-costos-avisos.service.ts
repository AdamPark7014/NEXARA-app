import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CostosProyectoService } from '../../costos/costos-proyecto.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { workDayBounds, workDateKey } from '../time/workday.js';
import { umbralesCostos } from './proyecto-costos-avisos.js';

export const CATEGORIA_COSTOS_PROYECTO = 'proyectos-costos';

@Injectable()
export class ProyectoCostosAvisosService {
  constructor(private readonly prisma: PrismaService, private readonly costos: CostosProyectoService,
    private readonly notifications: NotificationsService) {}

  async ejecutar(ahora = new Date()): Promise<number> {
    const grupos = new Map<string, { companyId: number; userId: number; lineas: string[] }>();
    const lecturas = new Map<number, Awaited<ReturnType<CostosProyectoService['contextoLectura']>>>();
    let cursor = 0;
    // Paginación explícita: el middleware de Prisma limita findMany sin take.
    for (;;) {
      const proyectos = await this.prisma.operationalProject.findMany({
        where: { id: { gt: cursor }, deletedAt: null, status: { in: ['ACTIVE', 'PLANNED', 'ON_HOLD'] } },
        select: { id: true, companyId: true, title: true, responsableId: true, createdById: true, vendorId: true },
        orderBy: { id: 'asc' }, take: 100,
      });
      if (!proyectos.length) break;
      for (const p of proyectos) {
        let contexto = lecturas.get(p.companyId);
        if (!contexto) {
          contexto = await this.costos.contextoLectura(p.companyId);
          lecturas.set(p.companyId, contexto);
        }
        const resumen = await this.costos.proyecto(p.companyId, p.id, { isSuperAdmin: true }, contexto);
        const avisos = umbralesCostos(resumen);
        if (!avisos.length) continue;
        const supervisores = avisos.some(a => a.sobrecosto) ? await this.prisma.user.findMany({
          where: { isActive: true, roleKey: 'dir_operaciones', companyMemberships: { some: { companyId: p.companyId } } },
          select: { id: true }, take: 100,
        }) : [];
        for (const aviso of avisos) {
          const destinatarios = new Set<number>();
          if (p.responsableId) destinatarios.add(p.responsableId);
          if (aviso.sobrecosto) {
            destinatarios.add(p.createdById ?? p.vendorId);
            supervisores.forEach(u => destinatarios.add(u.id));
          }
          // Referencia legible y estable, también usada para reconocer el umbral en el historial.
          const marca = `Proyecto #${p.id} · ${aviso.texto.split(':')[0]}:`;
          for (const userId of destinatarios) {
            // Rubro: una vez por umbral para siempre; sobrecosto: un recordatorio diario.
            const previo = await this.prisma.notification.findFirst({ where: {
              companyId: p.companyId, userId, category: CATEGORIA_COSTOS_PROYECTO,
              message: { contains: marca },
              ...(aviso.sobrecosto ? { createdAt: { gte: workDayBounds(ahora).start, lt: workDayBounds(ahora).end } } : {}),
            }, select: { id: true } });
            if (previo) continue;
            const key = `${p.companyId}:${userId}`;
            const grupo = grupos.get(key) ?? { companyId: p.companyId, userId, lineas: [] };
            grupo.lineas.push(`${marca} ${p.title} — ${aviso.texto}`);
            grupos.set(key, grupo);
          }
        }
      }
      cursor = proyectos[proyectos.length - 1].id;
    }
    let enviados = 0;
    for (const grupo of grupos.values()) {
      const destinatario = await this.prisma.user.findFirst({ where: {
        id: grupo.userId, isActive: true, companyMemberships: { some: { companyId: grupo.companyId } },
      }, select: { id: true } });
      if (!destinatario) continue;
      const dia = workDateKey(ahora);
      const previo = await this.prisma.notification.findFirst({ where: {
        companyId: grupo.companyId, userId: grupo.userId, category: CATEGORIA_COSTOS_PROYECTO,
        title: `Costos de proyectos · ${dia}`,
      }, select: { id: true } });
      if (previo) continue;
      const creado = await this.notifications.createNotification({
        companyId: grupo.companyId, userId: grupo.userId, type: 'SALES_PROJECT_MARGIN_ALERT', category: CATEGORIA_COSTOS_PROYECTO,
        title: `Costos de proyectos · ${dia}`, message: grupo.lineas.join('\n'),
        relatedUrl: '/erp/proyectos', entityType: 'OPERATIONAL_PROJECT', priority: 'high',
        collapseKey: `proyectos-costos:${grupo.companyId}:${grupo.userId}:${dia}`, dedupeSeconds: 86400,
      });
      if (creado) enviados++;
    }
    return enviados;
  }
}
