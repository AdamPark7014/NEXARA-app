import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OPEN_ACTIVITY_WHERE, isClosedStatus } from '../activities/activity-status.js';

const SLA_RESPONSE_HOURS_BY_PRIORITY: Record<string, number> = {
  Alta: 2,
  Media: 8,
  Baja: 24,
};

const SLA_RESOLUTION_HOURS_BY_PRIORITY: Record<string, number> = {
  Alta: 8,
  Media: 24,
  Baja: 72,
};

@Injectable()
export class SlaTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estadísticas de SLA en el periodo dado. */
  async getStats(filters: { from?: Date; to?: Date; clientId?: number }) {
    const where: any = {
      ticketType: { not: null },
    };
    if (filters.from || filters.to) {
      where.fechaAsignacion = {};
      if (filters.from) where.fechaAsignacion.gte = filters.from;
      if (filters.to) where.fechaAsignacion.lte = filters.to;
    }

    const tickets = await this.prisma.activity.findMany({
      where,
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        prioridad: true,
        estatus: true,
        ticketType: true,
        fechaAsignacion: true,
        fechaInicio: true,
        fechaFinalizacion: true,
        fechaEntregaEsperada: true,
        responsable: { select: { id: true, nombre: true } },
        branchName: true,
      },
      orderBy: { fechaAsignacion: 'desc' },
    });

    let respondedOnTime = 0;
    let respondedLate = 0;
    let resolvedOnTime = 0;
    let resolvedLate = 0;
    let stillOpen = 0;
    const responseHours: number[] = [];
    const resolutionHours: number[] = [];
    const breaches: any[] = [];

    for (const t of tickets) {
      const slaResp = SLA_RESPONSE_HOURS_BY_PRIORITY[t.prioridad || 'Media'] ?? 8;
      const slaRes = SLA_RESOLUTION_HOURS_BY_PRIORITY[t.prioridad || 'Media'] ?? 24;
      const asignado = t.fechaAsignacion;
      if (!asignado) {
        stillOpen++;
        continue;
      }
      if (t.fechaInicio) {
        const hrs = (t.fechaInicio.getTime() - asignado.getTime()) / 3600000;
        responseHours.push(hrs);
        if (hrs <= slaResp) respondedOnTime++;
        else {
          respondedLate++;
          breaches.push({ id: t.id, anNumber: t.anNumber, titulo: t.titulo, type: 'response', priority: t.prioridad, hoursLate: +(hrs - slaResp).toFixed(1) });
        }
      } else if (!isClosedStatus(t.estatus)) {
        const hrsOpen = (Date.now() - asignado.getTime()) / 3600000;
        if (hrsOpen > slaResp) {
          respondedLate++;
          breaches.push({ id: t.id, anNumber: t.anNumber, titulo: t.titulo, type: 'response_open', priority: t.prioridad, hoursLate: +(hrsOpen - slaResp).toFixed(1) });
        }
      }
      if (t.fechaFinalizacion) {
        const hrs = (t.fechaFinalizacion.getTime() - asignado.getTime()) / 3600000;
        resolutionHours.push(hrs);
        if (hrs <= slaRes) resolvedOnTime++;
        else {
          resolvedLate++;
          breaches.push({ id: t.id, anNumber: t.anNumber, titulo: t.titulo, type: 'resolution', priority: t.prioridad, hoursLate: +(hrs - slaRes).toFixed(1) });
        }
      } else if (!isClosedStatus(t.estatus)) {
        stillOpen++;
      }
    }

    const avg = (arr: number[]) => (arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0);
    const totalAnswered = respondedOnTime + respondedLate;
    const totalResolved = resolvedOnTime + resolvedLate;

    return {
      total: tickets.length,
      stillOpen,
      responseSla: {
        onTime: respondedOnTime,
        late: respondedLate,
        compliancePct: totalAnswered > 0 ? +((respondedOnTime / totalAnswered) * 100).toFixed(1) : 0,
        avgHours: avg(responseHours),
      },
      resolutionSla: {
        onTime: resolvedOnTime,
        late: resolvedLate,
        compliancePct: totalResolved > 0 ? +((resolvedOnTime / totalResolved) * 100).toFixed(1) : 0,
        avgHours: avg(resolutionHours),
      },
      breaches: breaches.sort((a, b) => b.hoursLate - a.hoursLate).slice(0, 20),
      bySeverity: {
        high: tickets.filter((t) => t.prioridad === 'Alta').length,
        medium: tickets.filter((t) => t.prioridad === 'Media').length,
        low: tickets.filter((t) => t.prioridad === 'Baja').length,
      },
      defaultSla: { responseByPriority: SLA_RESPONSE_HOURS_BY_PRIORITY, resolutionByPriority: SLA_RESOLUTION_HOURS_BY_PRIORITY },
    };
  }

  private median(arr: number[]): number {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? +sorted[mid].toFixed(2)
      : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
  }

  /**
   * Insights operativos de soporte: MTTR, backlog aging, ranking técnicos,
   * inbox portal y tendencias — encima de getStats.
   */
  async getInsights(filters: { from?: Date; to?: Date; clientId?: number }) {
    const base = await this.getStats(filters);
    const now = Date.now();

    const openTickets = await this.prisma.activity.findMany({
      where: {
        ticketType: { not: null },
        ...OPEN_ACTIVITY_WHERE,
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
      },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        prioridad: true,
        fechaAsignacion: true,
        responsable: { select: { id: true, nombre: true } },
      },
    });

    const aging = { h0_24: 0, d1_3: 0, d3_7: 0, d7_plus: 0 };
    for (const t of openTickets) {
      const start = t.fechaAsignacion?.getTime() ?? now;
      const ageH = (now - start) / 3600000;
      if (ageH < 24) aging.h0_24++;
      else if (ageH < 72) aging.d1_3++;
      else if (ageH < 168) aging.d3_7++;
      else aging.d7_plus++;
    }

    const closedWhere: any = {
      ticketType: { not: null },
      fechaFinalizacion: { not: null },
    };
    if (filters.from || filters.to) {
      closedWhere.fechaFinalizacion = {};
      if (filters.from) closedWhere.fechaFinalizacion.gte = filters.from;
      if (filters.to) closedWhere.fechaFinalizacion.lte = filters.to;
    }

    const closed = await this.prisma.activity.findMany({
      where: closedWhere,
      select: {
        fechaAsignacion: true,
        fechaFinalizacion: true,
        responsableId: true,
        responsable: { select: { id: true, nombre: true } },
        prioridad: true,
      },
    });

    const mttrSamples: number[] = [];
    const byTech = new Map<number, { nombre: string; closed: number; hours: number[] }>();
    for (const c of closed) {
      if (!c.fechaAsignacion || !c.fechaFinalizacion) continue;
      const hrs = (c.fechaFinalizacion.getTime() - c.fechaAsignacion.getTime()) / 3600000;
      if (hrs < 0) continue;
      mttrSamples.push(hrs);
      if (c.responsable?.id) {
        const cur = byTech.get(c.responsable.id) ?? { nombre: c.responsable.nombre, closed: 0, hours: [] };
        cur.closed += 1;
        cur.hours.push(hrs);
        byTech.set(c.responsable.id, cur);
      }
    }

    const techRanking = [...byTech.entries()]
      .map(([id, v]) => ({
        userId: id,
        nombre: v.nombre,
        closed: v.closed,
        mttrHours: v.hours.length
          ? +(v.hours.reduce((a, b) => a + b, 0) / v.hours.length).toFixed(2)
          : 0,
      }))
      .sort((a, b) => b.closed - a.closed)
      .slice(0, 10);

    const d14 = new Date(now - 14 * 86_400_000);
    const recentClosed = await this.prisma.activity.findMany({
      where: {
        ticketType: { not: null },
        fechaFinalizacion: { gte: d14 },
      },
      select: { fechaFinalizacion: true },
    });
    const recentOpened = await this.prisma.activity.findMany({
      where: {
        ticketType: { not: null },
        fechaAsignacion: { gte: d14 },
      },
      select: { fechaAsignacion: true },
    });

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const openedByDay: Record<string, number> = {};
    const closedByDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const k = dayKey(new Date(now - i * 86_400_000));
      openedByDay[k] = 0;
      closedByDay[k] = 0;
    }
    for (const r of recentOpened) {
      if (!r.fechaAsignacion) continue;
      const k = dayKey(r.fechaAsignacion);
      if (k in openedByDay) openedByDay[k] += 1;
    }
    for (const r of recentClosed) {
      if (!r.fechaFinalizacion) continue;
      const k = dayKey(r.fechaFinalizacion);
      if (k in closedByDay) closedByDay[k] += 1;
    }

    const inbox = await this.prisma.clientTicketRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>);

    const inboxByStatus: Record<string, number> = {};
    for (const row of inbox) {
      inboxByStatus[row.status] = row._count._all;
    }

    return {
      generatedAt: new Date().toISOString(),
      ...base,
      mttr: {
        meanHours: base.resolutionSla.avgHours,
        medianHours: this.median(mttrSamples),
        sampleSize: mttrSamples.length,
      },
      backlog: {
        open: openTickets.length,
        aging,
        oldest: openTickets
          .map((t) => ({
            id: t.id,
            anNumber: t.anNumber,
            titulo: t.titulo,
            prioridad: t.prioridad,
            ageHours: t.fechaAsignacion
              ? +((now - t.fechaAsignacion.getTime()) / 3600000).toFixed(1)
              : null,
            assignee: t.responsable?.nombre ?? null,
          }))
          .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0))
          .slice(0, 10),
      },
      techRanking,
      trends: {
        opened14d: Object.entries(openedByDay).map(([date, count]) => ({ date, count })),
        closed14d: Object.entries(closedByDay).map(([date, count]) => ({ date, count })),
      },
      inboxByStatus,
      reopens: {
        count: 0,
        note: 'Reincidencias requieren evento de reopen en Activity — pendiente de modelo',
      },
      alerts: [
        ...(base.resolutionSla.compliancePct < 85 && base.resolutionSla.onTime + base.resolutionSla.late > 0
          ? [{ severity: 'danger' as const, message: `Cumplimiento de resolución en ${base.resolutionSla.compliancePct}%` }]
          : []),
        ...(aging.d7_plus
          ? [{ severity: 'warning' as const, message: `${aging.d7_plus} ticket(s) abiertos >7 días` }]
          : []),
        ...((inboxByStatus['NEW'] ?? 0) > 0
          ? [{ severity: 'warning' as const, message: `${inboxByStatus['NEW']} solicitud(es) portal sin asignar` }]
          : []),
      ],
    };
  }
}
