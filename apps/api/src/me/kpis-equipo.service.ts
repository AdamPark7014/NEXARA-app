import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { workDateColumn, workDateKey, workDayEnd, workDayStart, parseWorkDate } from '../common/time/workday.js';
import { esMultiDia, periodoDeActividad } from '../activities/actividad-periodo.js';
import { tiposVisibles } from './equipo-alcance.js';
import { estatusCerrado, tiemposReales } from './pizarra-kpi.js';
import { TeamBoardService } from './team-board.service.js';
import {
  calculaKpisPersona,
  diasDelRango,
  horarioDePlantilla,
  semaforoKpi,
  sumaEquipo,
  supuestosKpi,
  type ActividadKpi,
  type ChecadaKpi,
  type ComidaKpi,
  type DiaKpi,
  type HorarioKpi,
  type SemaforoKpi,
  type TotalesKpi,
} from './kpis-equipo.js';

/** Rango máximo: un trimestre. Más que eso es un reporte, no un tablero. */
export const KPI_MAX_DIAS = 93;
const DIA_MS = 24 * 3_600_000;

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };

export type KpiPersona = { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null };

export type KpiHorario = {
  clave: string | null;
  etiqueta: string;
  entrada: string | null;
  graciaMin: number;
  jornadaOrdinariaMin: number | null;
};

export type KpiPersonaFila = {
  persona: KpiPersona;
  horario: KpiHorario;
  totales: TotalesKpi;
  semaforo: SemaforoKpi;
  motivos: string[];
};

export type KpisEquipoResponse = {
  scope: 'company' | 'subtree';
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  equipo: { totales: TotalesKpi; semaforo: SemaforoKpi; motivos: string[] };
  personas: KpiPersonaFila[];
};

export type KpisPersonaResponse = KpiPersonaFila & {
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  dias: DiaKpi[];
  justificaciones: Array<{ fecha: string; motivo: string }>;
};

const ETIQUETA_HORARIO: Record<string, string> = {
  office_hours: 'Oficina · entra 09:00',
  contractor: 'Contratista · entra 08:00',
  always_on: 'Sin horario fijo (24/7)',
  visitor: 'Visitante',
  disabled: 'Inactivo',
  none: 'Sin horario',
};

type DatosPersona = {
  horario: HorarioKpi;
  fechaIngreso: Date | null;
  checadas: ChecadaKpi[];
  comidas: ComidaKpi[];
  actividades: ActividadKpi[];
  justificadas: Array<{ fecha: string; motivo: string }>;
};

/**
 * KPI del equipo (dashboard del dueño): retardos, uniforme, horas laboradas contra productivas,
 * inactividad y tiempo extra. Lee lo que ya existe (checador, comidas, fotos de evidencia) y deja
 * todas las cuentas a `kpis-equipo.ts`, que es puro.
 *
 * El alcance es el de la pizarra: dirección ve a toda la empresa, cada jefe su organigrama hacia
 * abajo (más el flujo de despacho) y quien no tiene gente a cargo solo se ve a sí mismo.
 */
@Injectable()
export class KpisEquipoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamBoard: TeamBoardService,
  ) {}

  /** `desde`/`hasta` en `AAAA-MM-DD` (por omisión, hoy), con el tope de días. */
  resolveDias(desde?: string | null, hasta?: string | null, now = new Date()): { desde: string; hasta: string } {
    const r = this.teamBoard.resolveRange(desde, hasta, now);
    const d = workDateKey(r.desde);
    const h = workDateKey(r.hasta);
    if (diasDelRango(d, h).length > KPI_MAX_DIAS) {
      throw new BadRequestException(`El rango máximo es de ${KPI_MAX_DIAS} días`);
    }
    return { desde: d, hasta: h };
  }

  async getEquipo(
    viewer: Viewer,
    companyId: number | null,
    rango: { desde: string; hasta: string },
    soloUserId?: number | null,
  ): Promise<KpisEquipoResponse> {
    const { companyWide, scoped, now } = await this.teamBoard.resolveScope(viewer, companyId);
    const gente = soloUserId ? scoped.filter((u) => u.id === soloUserId) : scoped;
    if (soloUserId && !gente.length) throw new NotFoundException('Usuario fuera de tu alcance');

    const datos = await this.cargar(gente.map((u) => u.id), companyId, rango, null);
    const personas = gente.map((u) => {
      const d = datos.get(u.id) ?? vacio();
      const { totales } = calculaKpisPersona({
        desde: rango.desde,
        hasta: rango.hasta,
        ahora: now,
        horario: d.horario,
        checadas: d.checadas,
        comidas: d.comidas,
        actividades: d.actividades,
        justificadas: d.justificadas.map((j) => j.fecha),
        fechaIngreso: d.fechaIngreso,
      });
      return fila(u, d.horario, totales);
    });

    const totalesEquipo = sumaEquipo(personas.map((p) => p.totales));
    return {
      scope: companyWide ? 'company' : 'subtree',
      desde: rango.desde,
      hasta: rango.hasta,
      generadoAt: now.toISOString(),
      supuestos: supuestosKpi(),
      equipo: { totales: totalesEquipo, ...semaforoKpi(totalesEquipo) },
      personas,
    };
  }

  /** Detalle de una persona, día por día, con los tramos para la línea de tiempo. */
  async getPersona(
    viewer: Viewer,
    companyId: number | null,
    userId: number,
    rango: { desde: string; hasta: string },
  ): Promise<KpisPersonaResponse> {
    const { scoped, now } = await this.teamBoard.resolveScope(viewer, companyId);
    const persona = scoped.find((u) => u.id === userId);
    if (!persona) throw new NotFoundException('Usuario fuera de tu alcance');

    const datos = await this.cargar([userId], companyId, rango, tiposVisibles(viewer));
    const d = datos.get(userId) ?? vacio();
    const { dias, totales } = calculaKpisPersona({
      desde: rango.desde,
      hasta: rango.hasta,
      ahora: now,
      horario: d.horario,
      checadas: d.checadas,
      comidas: d.comidas,
      actividades: d.actividades,
      justificadas: d.justificadas.map((j) => j.fecha),
      fechaIngreso: d.fechaIngreso,
      detalle: true,
    });
    return {
      ...fila(persona, d.horario, totales),
      desde: rango.desde,
      hasta: rango.hasta,
      generadoAt: now.toISOString(),
      supuestos: supuestosKpi(),
      // Lo más reciente arriba: es lo que el jefe viene a ver.
      dias: [...dias].reverse(),
      justificaciones: d.justificadas,
    };
  }

  /**
   * Checadas, comidas y tramos de actividad de estas personas alrededor del rango.
   *
   * Se lee un día de más por cada lado: una entrada de la víspera puede cerrarse pasada la
   * medianoche, y la salida de la última jornada del rango puede caer al día siguiente.
   *
   * `tipos` (el filtro de Luis, que solo coordina servicios) esconde el **título** de las
   * actividades de otro tipo en el detalle, no su tiempo: la productividad es de la persona.
   */
  private async cargar(
    userIds: number[],
    companyId: number | null,
    rango: { desde: string; hasta: string },
    tipos: string[] | null,
  ): Promise<Map<number, DatosPersona>> {
    const out = new Map<number, DatosPersona>();
    if (!userIds.length) return out;

    const ini = new Date(workDayStart(parseWorkDate(rango.desde)).getTime() - DIA_MS);
    const fin = new Date(workDayEnd(parseWorkDate(rango.hasta)).getTime() + DIA_MS);
    const ventana = { gte: ini, lte: fin };
    const tenant = companyId != null ? { companyId } : {};

    const [usuarios, checadas, comidas, asignaciones, evidencias, justificaciones] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          isActive: true,
          roleKey: true,
          tipoContrato: true,
          fechaIngreso: true,
          role: { select: { orgRoleKey: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { userId: { in: userIds }, timestamp: ventana, ...tenant },
        select: { id: true, userId: true, type: true, timestamp: true, cierreAutomatico: true, uniformeOk: true },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.lunchBreak.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: workDateColumn(ini), lte: workDateColumn(fin) },
          ...tenant,
        },
        select: { userId: true, checkinTime: true, checkoutTime: true },
      }),
      this.prisma.activityAssignee.findMany({
        where: {
          userId: { in: userIds },
          ...tenant,
          OR: [
            { inicioRealAt: ventana },
            { finRealAt: ventana },
            { inicioRealAt: { lte: ini }, finRealAt: { gte: fin } },
          ],
        },
        select: { activityId: true, userId: true, inicioRealAt: true, finRealAt: true },
      }),
      this.prisma.activityEvidence.findMany({
        where: {
          userId: { in: userIds },
          ...tenant,
          OR: [
            { entryPhotoUploadedAt: ventana },
            { exitPhotoUploadedAt: ventana },
            { completedAt: ventana },
            { entryPhotoUploadedAt: { lte: ini }, exitPhotoUploadedAt: { gte: fin } },
          ],
        },
        select: {
          activityId: true,
          userId: true,
          status: true,
          entryPhotoUploadedAt: true,
          exitPhotoUploadedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.attendanceJustification.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: workDateColumn(parseWorkDate(rango.desde)), lte: workDateColumn(parseWorkDate(rango.hasta)) },
          ...tenant,
        },
        select: { userId: true, date: true, reason: true },
      }),
    ]);

    // Una fila por persona y actividad, juntando lo que diga la asignación y la evidencia.
    const clave = (userId: number, activityId: number) => `${userId}:${activityId}`;
    const asignacionPor = new Map(asignaciones.map((a) => [clave(a.userId, a.activityId), a]));
    const evidenciaPor = new Map(evidencias.map((e) => [clave(e.userId, e.activityId), e]));
    const claves = new Set([...asignacionPor.keys(), ...evidenciaPor.keys()]);
    const activityIds = [...new Set([...asignaciones, ...evidencias].map((r) => r.activityId))];

    // Las que se encontraron por un lado pero tienen fila del otro fuera de la ventana.
    const [actividades, asignacionesExtra, evidenciasExtra] = activityIds.length
      ? await Promise.all([
          this.prisma.activity.findMany({
            where: { id: { in: activityIds } },
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              coreKind: true,
              fechaFinalizacion: true,
              periodoInicio: true,
              periodoFin: true,
              deletedAt: true,
            },
          }),
          this.prisma.activityAssignee.findMany({
            where: { activityId: { in: activityIds }, userId: { in: userIds } },
            select: { activityId: true, userId: true, inicioRealAt: true, finRealAt: true },
          }),
          this.prisma.activityEvidence.findMany({
            where: { activityId: { in: activityIds }, userId: { in: userIds } },
            select: {
              activityId: true,
              userId: true,
              status: true,
              entryPhotoUploadedAt: true,
              exitPhotoUploadedAt: true,
              completedAt: true,
            },
          }),
        ])
      : [[], [], []];
    for (const a of asignacionesExtra) {
      const k = clave(a.userId, a.activityId);
      if (claves.has(k) && !asignacionPor.has(k)) asignacionPor.set(k, a);
    }
    for (const e of evidenciasExtra) {
      const k = clave(e.userId, e.activityId);
      if (claves.has(k) && !evidenciaPor.has(k)) evidenciaPor.set(k, e);
    }
    const actividadPor = new Map(actividades.map((a) => [a.id, a]));

    for (const u of usuarios) {
      const plantilla = resolveAccessScheduleKey({
        isActive: u.isActive,
        roleKey: u.roleKey,
        orgRoleKey: u.role?.orgRoleKey ?? null,
        tipoContrato: u.tipoContrato,
      });
      out.set(u.id, {
        horario: horarioDePlantilla(plantilla),
        fechaIngreso: u.fechaIngreso ?? null,
        checadas: [],
        comidas: [],
        actividades: [],
        justificadas: [],
      });
    }

    for (const c of checadas) {
      out.get(c.userId)?.checadas.push({
        id: c.id,
        tipo: c.type,
        at: c.timestamp,
        cierreAutomatico: c.cierreAutomatico,
        uniformeOk: c.uniformeOk,
      });
    }
    for (const c of comidas) {
      out.get(c.userId)?.comidas.push({ inicio: c.checkinTime, fin: c.checkoutTime ?? null });
    }
    for (const j of justificaciones) {
      // `date` es `@db.Date`: llega a medianoche UTC y se lee en UTC.
      out.get(j.userId)?.justificadas.push({ fecha: j.date.toISOString().slice(0, 10), motivo: j.reason });
    }
    for (const k of claves) {
      const [userId, activityId] = k.split(':').map(Number);
      const act = actividadPor.get(activityId);
      if (!act || act.deletedAt) continue;
      const asig = asignacionPor.get(k) ?? null;
      const ev = evidenciaPor.get(k) ?? null;
      const cerrada = estatusCerrado(act.estatus);
      const tiempos = tiemposReales({
        inicioRealAt: asig?.inicioRealAt ?? null,
        finRealAt: asig?.finRealAt ?? null,
        entryPhotoUploadedAt: ev?.entryPhotoUploadedAt ?? null,
        exitPhotoUploadedAt: ev?.exitPhotoUploadedAt ?? null,
        evidenciaCompletedAt: ev?.completedAt ?? null,
        fechaFinalizacion: act.fechaFinalizacion,
        cerrada,
      });
      const visible = !tipos || (act.coreKind != null && tipos.includes(act.coreKind));
      const periodo = periodoDeActividad(act);
      out.get(userId)?.actividades.push({
        activityId,
        anNumber: visible ? act.anNumber : null,
        titulo: visible ? act.titulo : 'Actividad de otra área',
        inicio: tiempos.inicio,
        fin: tiempos.fin,
        terminada: cerrada || ev?.status === 'COMPLETED',
        periodoFin: esMultiDia(periodo) ? periodo!.fin : null,
      });
    }

    return out;
  }
}

function vacio(): DatosPersona {
  return {
    horario: horarioDePlantilla(null),
    fechaIngreso: null,
    checadas: [],
    comidas: [],
    actividades: [],
    justificadas: [],
  };
}

function fila(
  u: { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null },
  horario: HorarioKpi,
  totales: TotalesKpi,
): KpiPersonaFila {
  return {
    persona: { id: u.id, nombre: u.nombre, email: u.email, avatarUrl: u.avatarUrl, puesto: u.puesto },
    horario: {
      clave: horario.clave,
      etiqueta: ETIQUETA_HORARIO[horario.clave ?? 'none'] ?? 'Sin horario',
      entrada: horario.entrada,
      graciaMin: horario.graciaMin,
      jornadaOrdinariaMin: horario.jornadaOrdinariaMin,
    },
    totales,
    ...semaforoKpi(totales),
  };
}
