import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { workDateColumn, workDateKey, workDayEnd, workDayStart, parseWorkDate } from '../common/time/workday.js';
import { esMultiDia, periodoDeActividad } from '../activities/actividad-periodo.js';
import { tiposVisibles } from './equipo-alcance.js';
import { estatusCerrado, minutosPlanDeHoras, tiemposReales } from './pizarra-kpi.js';
import { minutosTrabajados } from '../activities/sessions/sesiones-trabajo.js';
import { TeamBoardService } from './team-board.service.js';
import { cerrarSesionesVencidas, leerSesiones } from '../activities/sessions/activity-sessions.service.js';
import { limiteDeEntrega } from '../activities/semaforo-actividad.js';
import {
  calculaKpisPersona,
  conReferencia,
  diasDelRango,
  referenciaDeRitmo,
  topeDeTiempo,
  horarioDePersona,
  horarioDePlantilla,
  semaforoKpi,
  sumaEquipo,
  supuestosKpi,
  type ActividadKpi,
  type AprobacionExtra,
  type ChecadaKpi,
  type ComidaKpi,
  type DiaKpi,
  type EntregaDelRango,
  type EntregaKpi,
  type EstadoExtra,
  type HorarioKpi,
  type SemaforoKpi,
  type TotalesKpi,
} from './kpis-equipo.js';

/** Rango máximo: un trimestre. Más que eso es un reporte, no un tablero. */
export const KPI_MAX_DIAS = 93;
const DIA_MS = 24 * 3_600_000;
/**
 * Cuánto antes del rango se buscan actividades asignadas para medir sus entregas. Una obra
 * larga puede entregarse meses después de asignarse; más atrás que esto no se califica.
 */
const ENTREGAS_ANTES_DIAS = 120;

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };

export type KpiPersona = { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null };

export type KpiHorario = {
  clave: string | null;
  etiqueta: string;
  entrada: string | null;
  salida: string | null;
  graciaMin: number;
  jornadaOrdinariaMin: number | null;
  /** Días laborables (0 = domingo … 6 = sábado). */
  dias: readonly number[];
  /** Alguien le escribió un horario propio; si no, es el de su plantilla. */
  personalizado: boolean;
};

export type KpiPersonaFila = {
  persona: KpiPersona;
  horario: KpiHorario;
  totales: TotalesKpi;
  semaforo: SemaforoKpi;
  motivos: string[];
  /** Solo si se pidieron (`conDias`): el día por día, sin los tramos de la línea de tiempo. */
  dias?: DiaKpi[];
};

export type KpisEquipoResponse = {
  scope: 'company' | 'subtree';
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  equipo: { totales: TotalesKpi; semaforo: SemaforoKpi; motivos: string[] };
  personas: KpiPersonaFila[];
  /** Entregas por día contra las que se mide el ritmo de cada quien (percentil 75 del equipo). */
  ritmoReferencia: number | null;
};

export type KpisPersonaResponse = KpiPersonaFila & {
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  dias: DiaKpi[];
  justificaciones: Array<{ fecha: string; motivo: string }>;
  /** Sus entregas del rango (a tiempo, tarde, sin entregar), lo más reciente arriba. */
  entregas: EntregaDelRango[];
  /** El ritmo del equipo con que se le midió. */
  ritmoReferencia: number | null;
};

const ETIQUETA_HORARIO: Record<string, string> = {
  office_hours: 'Oficina · 10:00 a 18:00',
  contractor: 'Contratista · 10:00 a 18:00',
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
  aprobacionesExtra: AprobacionExtra[];
  entregas: EntregaKpi[];
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
    opciones: { conDias?: boolean } = {},
  ): Promise<KpisEquipoResponse> {
    const { companyWide, scoped, now } = await this.teamBoard.resolveScope(viewer, companyId);
    const gente = soloUserId ? scoped.filter((u) => u.id === soloUserId) : scoped;
    if (soloUserId && !gente.length) throw new NotFoundException('Usuario fuera de tu alcance');

    const datos = await this.cargar(gente.map((u) => u.id), companyId, rango, null);
    const calculadas = gente.map((u) => {
      const d = datos.get(u.id) ?? vacio();
      const { dias, totales } = calculaKpisPersona({
        desde: rango.desde,
        hasta: rango.hasta,
        ahora: now,
        horario: d.horario,
        checadas: d.checadas,
        comidas: d.comidas,
        actividades: d.actividades,
        justificadas: d.justificadas.map((j) => j.fecha),
        aprobacionesExtra: d.aprobacionesExtra,
        entregas: d.entregas,
        fechaIngreso: d.fechaIngreso,
      });
      return { u, d, dias, totales };
    });
    // El ritmo de cada quien se mide contra el del equipo: hace falta ver a todos primero.
    const referencia = referenciaDeRitmo(calculadas.map((c) => c.totales));
    const personas = calculadas.map(({ u, d, dias, totales }): KpiPersonaFila => {
      const t = conReferencia(totales, referencia);
      return opciones.conDias ? { ...fila(u, d.horario, t), dias } : fila(u, d.horario, t);
    });

    const totalesEquipo = conReferencia(sumaEquipo(personas.map((p) => p.totales)), referencia);
    return {
      scope: companyWide ? 'company' : 'subtree',
      desde: rango.desde,
      hasta: rango.hasta,
      generadoAt: now.toISOString(),
      supuestos: supuestosKpi(),
      equipo: { totales: totalesEquipo, ...semaforoKpi(totalesEquipo) },
      personas,
      ritmoReferencia: referencia,
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
    // El detalle propio no esconde lo que le asignaron por ser de otro tipo.
    const tipos = userId === viewer.id ? null : tiposVisibles(viewer);
    // Se lee a todo su equipo: su ritmo se mide contra el mismo que en la lista, y así el % coincide.
    const datos = await this.cargar(scoped.map((u) => u.id), companyId, rango, tipos);
    const ritmoReferencia = referenciaDeRitmo(
      scoped.map((u) => {
        const x = datos.get(u.id) ?? vacio();
        return calculaKpisPersona({
          desde: rango.desde,
          hasta: rango.hasta,
          ahora: now,
          horario: x.horario,
          checadas: x.checadas,
          comidas: x.comidas,
          actividades: x.actividades,
          justificadas: x.justificadas.map((j) => j.fecha),
          entregas: x.entregas,
          fechaIngreso: x.fechaIngreso,
        }).totales;
      }),
    );
    const d = datos.get(userId) ?? vacio();
    const { dias, totales: crudos, entregas } = calculaKpisPersona({
      desde: rango.desde,
      hasta: rango.hasta,
      ahora: now,
      horario: d.horario,
      checadas: d.checadas,
      comidas: d.comidas,
      actividades: d.actividades,
      justificadas: d.justificadas.map((j) => j.fecha),
      aprobacionesExtra: d.aprobacionesExtra,
      entregas: d.entregas,
      fechaIngreso: d.fechaIngreso,
      detalle: true,
    });
    const totales = conReferencia(crudos, ritmoReferencia);
    return {
      ...fila(persona, d.horario, totales),
      desde: rango.desde,
      hasta: rango.hasta,
      generadoAt: now.toISOString(),
      supuestos: supuestosKpi(),
      // Lo más reciente arriba: es lo que el jefe viene a ver.
      dias: [...dias].reverse(),
      justificaciones: d.justificadas,
      entregas,
      ritmoReferencia,
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
          activity: { deletedAt: null },
          OR: [
            { inicioRealAt: ventana },
            { finRealAt: ventana },
            { inicioRealAt: { lte: ini }, finRealAt: { gte: fin } },
          ],
        },
        select: { activityId: true, userId: true, inicioRealAt: true, finRealAt: true, horasPlan: true },
      }),
      this.prisma.activityEvidence.findMany({
        where: {
          userId: { in: userIds },
          ...tenant,
          activity: { deletedAt: null },
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

    // Horario propio y decisiones de horas extra. Van aparte del `Promise.all` de arriba
    // porque son tablas nuevas: un cliente Prisma sin ellas (pruebas con mock) no debe
    // tumbar el tablero entero, solo quedarse sin ese dato.
    const [horarios, aprobaciones] = await Promise.all([
      this.leerHorarios(userIds, companyId),
      this.leerAprobacionesExtra(userIds, rango, companyId),
    ]);

    // Sesiones de trabajo que tocan la ventana. Una actividad iniciada hace semanas no aparece
    // por su `inicioRealAt`, pero sí por la sesión que tuvo esta semana.
    await cerrarSesionesVencidas(this.prisma, { userIds, companyId });
    const sesionesEnVentana = await leerSesiones(this.prisma, { userIds, companyId, desde: ini, hasta: fin });
    const paresConSesion = [...sesionesEnVentana.values()].map((lista) => lista[0]);

    // Una fila por persona y actividad, juntando lo que diga la asignación y la evidencia.
    const clave = (userId: number, activityId: number) => `${userId}:${activityId}`;
    const asignacionPor = new Map(asignaciones.map((a) => [clave(a.userId, a.activityId), a]));
    const evidenciaPor = new Map(evidencias.map((e) => [clave(e.userId, e.activityId), e]));
    const claves = new Set([...asignacionPor.keys(), ...evidenciaPor.keys(), ...sesionesEnVentana.keys()]);
    const activityIds = [
      ...new Set([...asignaciones, ...evidencias, ...paresConSesion].map((r) => r.activityId)),
    ];
    // Todas las sesiones de esas actividades (no solo las de la ventana): si una persona ya
    // tiene sesiones, su intervalo de antes deja de medir aunque caiga dentro del rango.
    const sesiones = await leerSesiones(this.prisma, { userIds, activityIds, companyId });

    // Las que se encontraron por un lado pero tienen fila del otro fuera de la ventana.
    const [actividades, asignacionesExtra, evidenciasExtra] = activityIds.length
      ? await Promise.all([
          this.prisma.activity.findMany({
            where: { id: { in: activityIds }, deletedAt: null },
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              coreKind: true,
              fechaFinalizacion: true,
              periodoInicio: true,
              periodoFin: true,
              tiempoEstimadoMin: true,
              tiempoMaximoMin: true,
              deletedAt: true,
            },
          }),
          this.prisma.activityAssignee.findMany({
            where: { activityId: { in: activityIds }, userId: { in: userIds } },
            select: { activityId: true, userId: true, inicioRealAt: true, finRealAt: true, horasPlan: true },
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
        // Sin fila propia esto devuelve exactamente la plantilla de siempre.
        horario: horarioDePersona(plantilla, horarios.get(u.id) ?? null),
        fechaIngreso: u.fechaIngreso ?? null,
        checadas: [],
        comidas: [],
        actividades: [],
        justificadas: [],
        aprobacionesExtra: aprobaciones.get(u.id) ?? [],
        entregas: [],
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
    // Permisos y vacaciones aprobados: esos días tampoco cuentan como perdidos.
    for (const p of await this.leerPermisos(userIds, rango, companyId)) {
      const d = out.get(p.userId);
      if (d && !d.justificadas.some((j) => j.fecha === p.fecha)) d.justificadas.push({ fecha: p.fecha, motivo: p.motivo });
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
        sesiones: sesiones.get(k) ?? null,
        topeDiarioMin: topeDeTiempo(planDe(asig?.horasPlan, act.tiempoEstimadoMin), act.tiempoMaximoMin),
      });
    }

    // Entregas: lo último que se lee, aparte, para no cambiar el orden de lo de arriba.
    const entregas = await this.leerEntregas(userIds, companyId, ini, fin, tipos);
    for (const [userId, lista] of entregas) {
      const d = out.get(userId);
      if (d) d.entregas = lista;
    }

    return out;
  }

  /**
   * Las actividades de estas personas vistas como entregas: hasta cuándo había que entregarlas
   * (el límite del semáforo), cuándo las entregó cada quien y qué dijo el jefe la primera vez.
   *
   * «Entregada» es lo mismo que en la pizarra: envió su evidencia completa o la actividad se
   * cerró, y la hora es la de SU fin (fin real, foto de salida o evidencia), no la de la
   * aprobación. Quien solo reparte un despacho no entrega nada. Se leen las asignadas hasta
   * `ENTREGAS_ANTES_DIAS` antes del rango; el filtro fino (entregó o venció dentro) es de
   * `entregasDelRango`.
   */
  private async leerEntregas(
    userIds: number[],
    companyId: number | null,
    ini: Date,
    fin: Date,
    tipos: string[] | null,
  ): Promise<Map<number, EntregaKpi[]>> {
    const out = new Map<number, EntregaKpi[]>();
    const desde = new Date(ini.getTime() - ENTREGAS_ANTES_DIAS * DIA_MS);
    const filas = ((await this.prisma.activityAssignee.findMany({
      where: {
        userId: { in: userIds },
        retiradoAt: null,
        ...(companyId != null ? { companyId } : {}),
        activity: { deletedAt: null, cancelledAt: null, fechaAsignacion: { gte: desde, lte: fin } },
      },
      select: {
        activityId: true,
        userId: true,
        rol: true,
        inicioRealAt: true,
        finRealAt: true,
        horasPlan: true,
        activity: {
          select: {
            anNumber: true,
            titulo: true,
            estatus: true,
            coreKind: true,
            assignmentCharge: true,
            fechaInicio: true,
            fechaMaxima: true,
            fechaEntregaEsperada: true,
            fechaFinalizacion: true,
            periodoInicio: true,
            periodoFin: true,
            tiempoEstimadoMin: true,
            tiempoMaximoMin: true,
            activityEvidences: {
              where: { userId: { in: userIds } },
              select: {
                userId: true,
                status: true,
                completedAt: true,
                entryPhotoUploadedAt: true,
                exitPhotoUploadedAt: true,
              },
            },
          },
        },
      },
    })) ?? []);
    const propias = filas.filter(
      (f) =>
        f.activity &&
        !/cancel/i.test(f.activity.estatus ?? '') &&
        !(f.activity.assignmentCharge === 'despacho' && String(f.rol) === 'LEAD'),
    );
    if (!propias.length) return out;

    // Revisiones de su evidencia, en orden: la primera decide «a la primera».
    // (Un cliente Prisma sin la tabla —pruebas con mock— se queda sin revisiones, no sin tablero.)
    const prisma = this.prisma as any;
    const revisiones: Array<{ activityId: number; evidenceUserId: number; decision: string }> =
      typeof prisma?.activityEvidenceReview?.findMany === 'function'
        ? ((await prisma.activityEvidenceReview.findMany({
            where: {
              evidenceUserId: { in: userIds },
              activityId: { in: [...new Set(propias.map((f) => f.activityId))] },
              ...(companyId != null ? { companyId } : {}),
            },
            select: { activityId: true, evidenceUserId: true, decision: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })) ?? [])
        : [];
    // Sus sesiones de reloj: de ahí sale cuánto trabajó de verdad en cada una.
    const sesiones = await leerSesiones(this.prisma, {
      userIds,
      activityIds: [...new Set(propias.map((f) => f.activityId))],
      companyId,
    });
    const ahora = new Date();

    const revisionesPor = new Map<string, string[]>();
    for (const r of revisiones) {
      const k = `${r.evidenceUserId}:${r.activityId}`;
      const lista = revisionesPor.get(k) ?? [];
      lista.push(r.decision);
      revisionesPor.set(k, lista);
    }

    for (const f of propias) {
      const a = f.activity;
      const ev = (a.activityEvidences ?? []).find((e) => e.userId === f.userId) ?? null;
      const cerrada = estatusCerrado(a.estatus);
      const envio = ev?.status === 'COMPLETED';
      const tiempos = tiemposReales({
        inicioRealAt: f.inicioRealAt ?? null,
        finRealAt: f.finRealAt ?? null,
        entryPhotoUploadedAt: ev?.entryPhotoUploadedAt ?? null,
        exitPhotoUploadedAt: ev?.exitPhotoUploadedAt ?? null,
        evidenciaCompletedAt: ev?.completedAt ?? null,
        fechaFinalizacion: a.fechaFinalizacion,
        cerrada,
      });
      const entregadaAt = envio
        ? (tiempos.fin ?? ev?.completedAt ?? a.fechaFinalizacion ?? null)
        : cerrada
          ? (tiempos.fin ?? a.fechaFinalizacion ?? null)
          : null;
      const decisiones = revisionesPor.get(`${f.userId}:${f.activityId}`) ?? [];
      const devuelta = (d: string) => /^DEVUELTA/i.test(d);
      const visible = !tipos || (a.coreKind != null && tipos.includes(a.coreKind));
      const periodo = periodoDeActividad(a);
      const lista = out.get(f.userId) ?? [];
      lista.push({
        activityId: f.activityId,
        anNumber: visible ? a.anNumber : null,
        titulo: visible ? a.titulo : 'Actividad de otra área',
        limite: limiteDeEntrega(a),
        entregadaAt,
        primeraRevision: decisiones.length ? (devuelta(decisiones[0]) ? 'DEVUELTA' : 'APROBADA') : null,
        devoluciones: decisiones.filter(devuelta).length,
        minutosPlan: planDe(f.horasPlan, a.tiempoEstimadoMin),
        minutosMaximo: a.tiempoMaximoMin ?? null,
        minutosReales: minutosTrabajados({
          inicio: tiempos.inicio,
          fin: tiempos.fin,
          sesiones: sesiones.get(`${f.userId}:${f.activityId}`) ?? null,
          ahora,
        }),
        diasPeriodo: periodo ? diasDelRango(periodo.inicio, periodo.fin).length : 1,
      });
      out.set(f.userId, lista);
    }
    return out;
  }

  /**
   * Días de permiso o vacaciones aprobados dentro del rango, uno por fecha. Una tabla vacía o
   * un cliente sin ella (pruebas con mock) devuelve nada: los días cuentan como siempre.
   */
  private async leerPermisos(
    userIds: number[],
    rango: { desde: string; hasta: string },
    companyId: number | null,
  ): Promise<Array<{ userId: number; fecha: string; motivo: string }>> {
    const prisma = this.prisma as any;
    if (typeof prisma?.leaveRequest?.findMany !== 'function') return [];
    const ETIQUETA: Record<string, string> = {
      VACATION: 'Vacaciones',
      SICK: 'Incapacidad',
      PERSONAL: 'Permiso personal',
      MATERNITY: 'Maternidad',
      PATERNITY: 'Paternidad',
      BEREAVEMENT: 'Duelo',
      UNPAID: 'Permiso sin goce',
    };
    try {
      const filas = await prisma.leaveRequest.findMany({
        where: {
          userId: { in: userIds },
          status: 'APPROVED',
          startDate: { lte: workDateColumn(parseWorkDate(rango.hasta)) },
          endDate: { gte: workDateColumn(parseWorkDate(rango.desde)) },
          ...(companyId != null ? { companyId } : {}),
        },
        select: { userId: true, type: true, startDate: true, endDate: true },
      });
      const out: Array<{ userId: number; fecha: string; motivo: string }> = [];
      for (const f of filas ?? []) {
        // `@db.Date`: medianoche UTC, se lee en UTC.
        const ini = f.startDate.toISOString().slice(0, 10);
        const fin = f.endDate.toISOString().slice(0, 10);
        const desde = ini > rango.desde ? ini : rango.desde;
        const hasta = fin < rango.hasta ? fin : rango.hasta;
        for (const fecha of diasDelRango(desde, hasta)) {
          out.push({ userId: f.userId, fecha, motivo: ETIQUETA[f.type] ?? 'Permiso aprobado' });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Horario propio de cada persona, si alguien se lo escribió.
   *
   * El mapa vuelve vacío cuando la tabla no existe todavía o la lectura falla, y eso
   * significa exactamente «manda su plantilla»: es el comportamiento de siempre, así que
   * un fallo aquí no le cambia el retardo ni el tiempo extra a nadie.
   */
  private async leerHorarios(
    userIds: number[],
    companyId: number | null,
  ): Promise<Map<number, {
    horaEntrada: string | null;
    horaSalida: string | null;
    dias: number[];
    graciaMin: number | null;
    jornadaOrdinariaMin: number | null;
  }>> {
    const out = new Map<number, any>();
    const prisma = this.prisma as any;
    if (typeof prisma?.workSchedule?.findMany !== 'function') return out;
    try {
      const filas = await prisma.workSchedule.findMany({
        where: { userId: { in: userIds }, ...(companyId != null ? { companyId } : {}) },
        select: {
          userId: true,
          horaEntrada: true,
          horaSalida: true,
          dias: true,
          graciaMin: true,
          jornadaOrdinariaMin: true,
        },
      });
      for (const f of filas ?? []) {
        out.set(f.userId, {
          horaEntrada: f.horaEntrada ?? null,
          horaSalida: f.horaSalida ?? null,
          dias: Array.isArray(f.dias) ? f.dias : [],
          graciaMin: f.graciaMin ?? null,
          jornadaOrdinariaMin: f.jornadaOrdinariaMin ?? null,
        });
      }
    } catch {
      /* sin horario propio: manda la plantilla */
    }
    return out;
  }

  /** Decisiones de horas extra del rango, por persona y día. */
  private async leerAprobacionesExtra(
    userIds: number[],
    rango: { desde: string; hasta: string },
    companyId: number | null,
  ): Promise<Map<number, AprobacionExtra[]>> {
    const out = new Map<number, AprobacionExtra[]>();
    const prisma = this.prisma as any;
    if (typeof prisma?.overtimeApproval?.findMany !== 'function') return out;
    try {
      const filas = await prisma.overtimeApproval.findMany({
        where: {
          userId: { in: userIds },
          fecha: {
            gte: workDateColumn(parseWorkDate(rango.desde)),
            lte: workDateColumn(parseWorkDate(rango.hasta)),
          },
          ...(companyId != null ? { companyId } : {}),
        },
        select: { userId: true, fecha: true, minutos: true, estado: true, nota: true },
      });
      for (const f of filas ?? []) {
        const lista = out.get(f.userId) ?? [];
        // `fecha` es `@db.Date`: llega a medianoche UTC y se lee en UTC.
        lista.push({
          fecha: f.fecha.toISOString().slice(0, 10),
          minutos: f.minutos,
          estado: f.estado as EstadoExtra,
          nota: f.nota ?? null,
        });
        out.set(f.userId, lista);
      }
    } catch {
      /* sin decisiones: todo el extra queda pendiente, que es lo honesto */
    }
    return out;
  }
}

/** Plan de una persona en una actividad: su `horasPlan` si se lo pusieron, si no el estimado de la actividad. */
function planDe(horasPlan: unknown, tiempoEstimadoMin?: number | null): number | null {
  const n = horasPlan == null ? null : Number(horasPlan);
  return minutosPlanDeHoras(n != null && Number.isFinite(n) ? n : null) ?? tiempoEstimadoMin ?? null;
}

function vacio(): DatosPersona {
  return {
    horario: horarioDePlantilla(null),
    fechaIngreso: null,
    checadas: [],
    comidas: [],
    actividades: [],
    justificadas: [],
    aprobacionesExtra: [],
    entregas: [],
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
      etiqueta: horario.personalizado
        ? `Horario propio${horario.entrada ? ` · entra ${horario.entrada}` : ''}`
        : (ETIQUETA_HORARIO[horario.clave ?? 'none'] ?? 'Sin horario'),
      entrada: horario.entrada,
      salida: horario.salida,
      graciaMin: horario.graciaMin,
      jornadaOrdinariaMin: horario.jornadaOrdinariaMin,
      dias: horario.diasLaborables,
      personalizado: horario.personalizado,
    },
    totales,
    ...semaforoKpi(totales),
  };
}
