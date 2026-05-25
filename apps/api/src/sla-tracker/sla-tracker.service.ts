import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
      } else if (t.estatus !== 'Finalizado') {
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
      } else if (t.estatus !== 'Finalizado') {
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
}
