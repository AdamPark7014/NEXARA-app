import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDayEnd } from '../common/time/workday.js';

/**
 * Incidencias y recomendaciones de un servicio.
 *
 * Ambas vivían en `ServiceSheet.observations`: texto libre. Así no se podía
 * contar cuántas veces se fue en balde por falta de material, ni qué cliente
 * niega el acceso con frecuencia, ni cuánta facturación nace de lo que el
 * técnico ve en sitio. Tipificarlo convierte el relato en una cifra.
 *
 * La recomendación además cierra una costura real: con `cotizacionId`, lo que
 * observa Ingeniería llega a Ventas en lugar de morir en la hoja de servicio.
 */

export const INCIDENT_TYPES = [
  'ACCESO_DENEGADO',
  'FALTA_MATERIAL',
  'FALLA_EQUIPO',
  'CONDICION_INSEGURA',
  'CLIMA',
  'ALCANCE_ADICIONAL',
  'RETRASO_CLIENTE',
  'DANO_INSTALACION',
  'OTRO',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_SEVERITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const RECOMMENDATION_TYPES = [
  'CORRECTIVO',
  'PREVENTIVO',
  'MEJORA',
  'ACTUALIZACION',
  'CAPACITACION',
  'AMPLIACION',
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];

export const RECOMMENDATION_STATUSES = [
  'ABIERTA',
  'COTIZADA',
  'ACEPTADA',
  'RECHAZADA',
  'DESCARTADA',
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** Estados terminales: al llegar a ellos se sella `cerradoAt`. */
export const CLOSED_RECOMMENDATION_STATUSES: RecommendationStatus[] = [
  'ACEPTADA',
  'RECHAZADA',
  'DESCARTADA',
];

const USER_BRIEF = { select: { id: true, nombre: true } };

@Injectable()
export class ActivityIssuesService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadActivity(activityId: number, companyId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(companyId) },
      select: { id: true, companyId: true, anNumber: true },
    });
    assertCompanyAccess(activity, companyId, 'Actividad');
    return activity!;
  }

  // ── Incidencias ───────────────────────────────────────────────────────

  async listIncidents(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    return this.prisma.activityIncident.findMany({
      where: { activityId, ...companyWhere(tenantId) },
      include: { reportadoPor: USER_BRIEF, resueltoPor: USER_BRIEF },
      orderBy: [{ resueltoAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async addIncident(
    activityId: number,
    dto: {
      tipo: IncidentType;
      severidad?: IncidentSeverity;
      descripcion: string;
      accionTomada?: string;
      horasPerdidas?: number;
    },
    actorId: number | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const tipo = requireEnum(dto.tipo, INCIDENT_TYPES, 'tipo de incidencia');
    const severidad = dto.severidad
      ? requireEnum(dto.severidad, INCIDENT_SEVERITIES, 'severidad')
      : 'MEDIA';
    const descripcion = requireText(dto.descripcion, 'descripción');

    if (
      dto.horasPerdidas != null &&
      (!Number.isFinite(dto.horasPerdidas) || dto.horasPerdidas < 0)
    ) {
      throw new BadRequestException('Las horas perdidas deben ser un número no negativo');
    }

    return this.prisma.activityIncident.create({
      data: {
        activityId,
        tipo,
        severidad,
        descripcion,
        accionTomada: dto.accionTomada?.trim() || null,
        horasPerdidas: dto.horasPerdidas ?? null,
        reportadoPorId: actorId ?? null,
        companyId: tenantId,
      },
      include: { reportadoPor: USER_BRIEF },
    });
  }

  /**
   * Cierra una incidencia.
   *
   * No se permite recerrar una ya resuelta: sobrescribir `resueltoPorId`
   * borraría quién la atendió realmente. Para corregir, primero se reabre.
   */
  async resolveIncident(
    activityId: number,
    incidentId: number,
    dto: { accionTomada?: string },
    actorId: number | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const incident = await this.prisma.activityIncident.findFirst({
      where: { id: incidentId, activityId, ...companyWhere(tenantId) },
    });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');
    if (incident.resueltoAt) throw new BadRequestException('La incidencia ya estaba resuelta');

    return this.prisma.activityIncident.update({
      where: { id: incidentId },
      data: {
        resueltoAt: new Date(),
        resueltoPorId: actorId ?? null,
        accionTomada: dto.accionTomada?.trim() || incident.accionTomada,
      },
      include: { reportadoPor: USER_BRIEF, resueltoPor: USER_BRIEF },
    });
  }

  /** Reabre una incidencia cerrada por error o que volvió a ocurrir. */
  async reopenIncident(activityId: number, incidentId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const result = await this.prisma.activityIncident.updateMany({
      where: { id: incidentId, activityId, resueltoAt: { not: null }, ...companyWhere(tenantId) },
      data: { resueltoAt: null, resueltoPorId: null },
    });
    if (result.count === 0) throw new NotFoundException('No hay una incidencia resuelta con ese id');
    return { reopened: true };
  }

  /**
   * Cuántas veces pasa cada cosa y cuánto tiempo cuesta.
   *
   * Es la pregunta que el texto libre no podía responder: si "falta material"
   * encabeza la lista, el problema no está en campo sino en almacén.
   */
  async incidentSummary(
    companyId?: number | null,
    range?: { desde?: string; hasta?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const where = {
      ...companyWhere(tenantId),
      ...(range?.desde || range?.hasta
        ? {
            createdAt: {
              ...(range.desde ? { gte: new Date(range.desde) } : {}),
              ...(range.hasta ? { lte: endOfDay(new Date(range.hasta)) } : {}),
            },
          }
        : {}),
    };

    const [porTipo, porSeveridad, abiertas, total, horas] = await Promise.all([
      this.prisma.activityIncident.groupBy({
        by: ['tipo'],
        where,
        _count: { _all: true },
        _sum: { horasPerdidas: true },
      }),
      this.prisma.activityIncident.groupBy({ by: ['severidad'], where, _count: { _all: true } }),
      this.prisma.activityIncident.count({ where: { ...where, resueltoAt: null } }),
      this.prisma.activityIncident.count({ where }),
      this.prisma.activityIncident.aggregate({ where, _sum: { horasPerdidas: true } }),
    ]);

    return {
      total,
      abiertas,
      horasPerdidas: Number(horas._sum.horasPerdidas ?? 0),
      porTipo: porTipo
        .map((t) => ({
          tipo: t.tipo,
          conteo: t._count._all,
          horasPerdidas: Number(t._sum.horasPerdidas ?? 0),
        }))
        .sort((a, b) => b.conteo - a.conteo),
      porSeveridad: porSeveridad.map((s) => ({ severidad: s.severidad, conteo: s._count._all })),
    };
  }

  // ── Recomendaciones ───────────────────────────────────────────────────

  async listRecommendations(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    return this.prisma.activityRecommendation.findMany({
      where: { activityId, ...companyWhere(tenantId) },
      include: {
        creadoPor: USER_BRIEF,
        cotizacion: { select: { id: true, quoteNumber: true, status: true, total: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addRecommendation(
    activityId: number,
    dto: {
      tipo: RecommendationType;
      prioridad?: RecommendationPriority;
      descripcion: string;
      costoEstimado?: number;
    },
    actorId: number | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const tipo = requireEnum(dto.tipo, RECOMMENDATION_TYPES, 'tipo de recomendación');
    const prioridad = dto.prioridad
      ? requireEnum(dto.prioridad, RECOMMENDATION_PRIORITIES, 'prioridad')
      : 'MEDIA';
    const descripcion = requireText(dto.descripcion, 'descripción');

    if (dto.costoEstimado != null && (!Number.isFinite(dto.costoEstimado) || dto.costoEstimado < 0)) {
      throw new BadRequestException('El costo estimado no puede ser negativo');
    }

    return this.prisma.activityRecommendation.create({
      data: {
        activityId,
        tipo,
        prioridad,
        descripcion,
        costoEstimado: dto.costoEstimado ?? null,
        creadoPorId: actorId ?? null,
        companyId: tenantId,
      },
      include: { creadoPor: USER_BRIEF },
    });
  }

  /**
   * Cambia el estado de una recomendación y, si se indica, la enlaza con la
   * cotización que nació de ella.
   *
   * Enlazar una cotización implica `COTIZADA` aunque no se pida: es la razón de
   * ser del enlace, y dejarla `ABIERTA` la mantendría en la bandeja de Ventas
   * como trabajo por hacer cuando ya se hizo.
   */
  async updateRecommendation(
    activityId: number,
    recommendationId: number,
    dto: {
      estado?: RecommendationStatus;
      prioridad?: RecommendationPriority;
      cotizacionId?: number | null;
      costoEstimado?: number | null;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const actual = await this.prisma.activityRecommendation.findFirst({
      where: { id: recommendationId, activityId, ...companyWhere(tenantId) },
    });
    if (!actual) throw new NotFoundException('Recomendación no encontrada');

    const data: Record<string, unknown> = {};

    if (dto.cotizacionId !== undefined) {
      if (dto.cotizacionId === null) {
        data.cotizacionId = null;
      } else {
        const cotizacion = await this.prisma.cotizacion.findFirst({
          where: { id: dto.cotizacionId, ...companyWhere(tenantId) },
          select: { id: true },
        });
        if (!cotizacion) throw new NotFoundException('La cotización no existe en esta empresa');
        data.cotizacionId = cotizacion.id;
        if (!dto.estado && actual.estado === 'ABIERTA') data.estado = 'COTIZADA';
      }
    }

    if (dto.estado !== undefined) {
      data.estado = requireEnum(dto.estado, RECOMMENDATION_STATUSES, 'estado');
    }
    if (dto.prioridad !== undefined) {
      data.prioridad = requireEnum(dto.prioridad, RECOMMENDATION_PRIORITIES, 'prioridad');
    }
    if (dto.costoEstimado !== undefined) {
      if (
        dto.costoEstimado !== null &&
        (!Number.isFinite(dto.costoEstimado) || dto.costoEstimado < 0)
      ) {
        throw new BadRequestException('El costo estimado no puede ser negativo');
      }
      data.costoEstimado = dto.costoEstimado;
    }

    const estadoFinal = (data.estado as RecommendationStatus | undefined) ?? actual.estado;
    data.cerradoAt = CLOSED_RECOMMENDATION_STATUSES.includes(estadoFinal as RecommendationStatus)
      ? (actual.cerradoAt ?? new Date())
      : null;

    return this.prisma.activityRecommendation.update({
      where: { id: recommendationId },
      data,
      include: {
        creadoPor: USER_BRIEF,
        cotizacion: { select: { id: true, quoteNumber: true, status: true, total: true } },
      },
    });
  }

  /**
   * Recomendaciones sin cotizar: el trabajo que Ingeniería ya detectó y Ventas
   * todavía no ha convertido. Antes esta lista no existía.
   */
  async pendingRecommendations(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);

    const abiertas = await this.prisma.activityRecommendation.findMany({
      where: { estado: 'ABIERTA', ...companyWhere(tenantId) },
      include: {
        creadoPor: USER_BRIEF,
        activity: { select: { id: true, anNumber: true, clientId: true, titulo: true } },
      },
      orderBy: [{ prioridad: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });

    const valorPotencial = abiertas.reduce((s, r) => s + Number(r.costoEstimado ?? 0), 0);
    return { total: abiertas.length, valorPotencial, recomendaciones: abiertas };
  }
}

function requireEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(allowed as readonly string[]).includes(v)) {
    throw new BadRequestException(`${label} inválido. Valores: ${allowed.join(', ')}`);
  }
  return v as T[number];
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`La ${label} es obligatoria`);
  return text.slice(0, 4000);
}

/**
 * Fin del día en hora de la empresa.
 *
 * Con hora del servidor —UTC— el rango terminaba a las 18:00 de México, así que
 * las incidencias reportadas por la tarde del último día quedaban fuera del
 * informe.
 */
function endOfDay(d: Date): Date {
  return workDayEnd(d);
}
