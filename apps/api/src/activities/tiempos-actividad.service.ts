import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplejidadService } from '../ai/complejidad/complejidad.service.js';
import { normalizar } from '../ai/complejidad/tiempos-tipicos.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { horarioDePersona } from '../me/kpis-equipo.js';
import { claveConTitulo, historialDeMuestras, personaTipoDeMuestras, type MuestraTiempo } from './aprendizaje-tiempos.js';
import {
  cantidadDelTitulo,
  completarTiempos,
  entregaCalculada,
  estandarDeLectura,
  esAutoasignacion,
  jornadaDeHorario,
  JORNADA_OFICINA,
  minutosDeJornadaRestantes,
  tipoDelTitulo,
  type DatosTiempo,
  type HistorialTitulo,
  type JornadaEntrega,
  type LecturaTitulo,
  type PersonaTipo,
} from './tiempo-entrega.js';

/** La lectura de un título no cambia en media hora: así la vista previa y el alta dan lo mismo. */
const CACHE_LECTURA_MS = 30 * 60_000;
/** El historial de títulos cambia despacio: una consulta por empresa cada 10 minutos. */
const CACHE_HISTORIAL_MS = 10 * 60_000;
/** El horario de una persona cambia poco: se lee una vez cada 10 minutos. */
const CACHE_JORNADA_MS = 10 * 60_000;
/** La semana del 14-09 es la demo sembrada: el historial cuenta desde la siguiente. */
const DESDE_OPERACION_REAL = new Date('2026-09-21T06:00:00Z');

/**
 * Tiempo y entrega de toda actividad nueva (reglas en `tiempo-entrega.ts`). La IA solo lee el título
 * (complejidad, cantidad, destino; la de `ComplejidadService`, por la puerta con Haiku); sin IA, el
 * número que traiga el título. Los minutos los pone la tabla.
 */
@Injectable()
export class TiemposActividadService {
  private readonly logger = new Logger('TiemposActividad');
  private readonly lecturas = new Map<string, { hasta: number; lectura: LecturaTitulo }>();
  private readonly historiales = new Map<number, { hasta: number; muestras: MuestraTiempo[] }>();
  private readonly jornadas = new Map<number, { hasta: number; jornada: JornadaEntrega }>();

  constructor(
    @Optional() private readonly complejidad?: ComplejidadService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Lo terminado o por validar de quien la ejecutó: lo que dijo la persona o, si no dijo, su reloj,
   * sin lo que el sistema cortó solo. Lo de varios días no enseña cuánto toma una sola vez.
   */
  private async muestras(companyId: number): Promise<MuestraTiempo[] | null> {
    if (!this.prisma) return null;
    const guardadas = this.historiales.get(companyId);
    if (guardadas && guardadas.hasta >= Date.now()) return guardadas.muestras;
    try {
      const filas = await this.prisma.$queryRaw<
        Array<{ titulo: string; userId: number; minutos: number; coreKind: string | null; ticketType: string | null; ticketTypeCustom: string | null }>
      >(Prisma.sql`
        WITH ses AS (
          SELECT s."activityId", s."userId", SUM(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) / 60.0)::float8 AS minutos,
                 BOOL_OR(s."endReason" IN ('TOPE_12H', 'CORTE_DIA')) AS cortada
          FROM activity_work_sessions s
          WHERE s."companyId" = ${companyId} AND s."endedAt" IS NOT NULL AND s."startedAt" >= ${DESDE_OPERACION_REAL}
          GROUP BY 1, 2
        )
        SELECT a.titulo, a."responsableId" AS "userId", a."coreKind", a."ticketType"::text AS "ticketType", a."ticketTypeCustom",
               COALESCE(d.minutos::float8, ses.minutos) AS minutos
        FROM "Activity" a
        LEFT JOIN ses ON ses."activityId" = a.id AND ses."userId" = a."responsableId"
        LEFT JOIN actividad_tiempo_dicho d ON d."activityId" = a.id AND d."companyId" = a."companyId"
        WHERE a."companyId" = ${companyId} AND a."deletedAt" IS NULL AND a.estatus IN ('Finalizada', 'Por Validar')
          AND a."responsableId" IS NOT NULL
          AND NOT (a."periodoInicio" IS NOT NULL AND a."periodoFin" IS NOT NULL)
          AND (d.minutos IS NOT NULL OR (NOT ses.cortada AND ses.minutos >= 5))`);
      const muestras = filas.map((f) => ({
        titulo: f.titulo,
        userId: Number(f.userId),
        minutos: Number(f.minutos),
        clave: claveConTitulo(f),
      }));
      this.historiales.set(companyId, { hasta: Date.now() + CACHE_HISTORIAL_MS, muestras });
      return muestras;
    } catch (error) {
      this.logger.warn(`sin historial de títulos: ${(error as Error).message}`);
      return null;
    }
  }

  /** Lo que ya tomó este título o uno parecido (`historialDeMuestras`). null si no hay suficiente. */
  async historial(companyId: number, titulo: string | null | undefined, responsableId?: number | null): Promise<HistorialTitulo | null> {
    if (normalizar(titulo).length < 4) return null;
    const muestras = await this.muestras(companyId);
    return muestras ? historialDeMuestras(muestras, titulo, responsableId) : null;
  }

  /** Lo que a quien la ejecuta le toma este tipo de trabajo. */
  private async personaTipo(companyId: number, a: DatosTiempo & { indicaciones?: string | null }): Promise<PersonaTipo | null> {
    if (!a.responsableId) return null;
    const muestras = await this.muestras(companyId);
    return muestras ? personaTipoDeMuestras(muestras, claveConTitulo(a), a.responsableId) : null;
  }

  /**
   * La jornada de quien ejecuta: su horario (`horarioDePersona`, el mismo de retardos y avisos),
   * con la comida a las 5 h de entrar. La cuadrilla (08:00–17:00) entrega antes de las 17:00; sin
   * horario, la oficina.
   */
  async jornada(userId?: number | null): Promise<JornadaEntrega> {
    if (!this.prisma || !userId) return JORNADA_OFICINA;
    const guardada = this.jornadas.get(userId);
    if (guardada && guardada.hasta > Date.now()) return guardada.jornada;
    let jornada = JORNADA_OFICINA;
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          roleKey: true,
          tipoContrato: true,
          role: { select: { orgRoleKey: true } },
          horario: { select: { horaEntrada: true, horaSalida: true, dias: true, graciaMin: true, jornadaOrdinariaMin: true } },
        },
      });
      if (u) {
        const plantilla = resolveAccessScheduleKey({ isActive: true, roleKey: u.roleKey, orgRoleKey: u.role?.orgRoleKey ?? null, tipoContrato: u.tipoContrato });
        jornada = jornadaDeHorario(horarioDePersona(plantilla, u.horario ?? null));
      }
    } catch (error) {
      this.logger.warn(`sin horario de ${userId}: ${(error as Error).message}`);
      return JORNADA_OFICINA;
    }
    this.jornadas.set(userId, { hasta: Date.now() + CACHE_JORNADA_MS, jornada });
    if (this.jornadas.size > 500) this.jornadas.delete(this.jornadas.keys().next().value as number);
    return jornada;
  }

  /** El tipo con el que se calcula: el que dice el título si el elegido no cuadra. */
  private conTipoDelTitulo<T extends DatosTiempo & { indicaciones?: string | null }>(a: T): T {
    const t = tipoDelTitulo(a);
    return t ? { ...a, ...t } : a;
  }

  private tipoDe(a: DatosTiempo): string | null {
    return (a.coreKind ?? '').trim().toLowerCase() === 'servicio' ? (a.ticketType ?? null) : (a.ticketTypeCustom ?? null);
  }

  /** Lo que dice el título del tipo de trabajo, la cantidad y el destino. */
  async lectura(companyId: number, a: DatosTiempo & { indicaciones?: string | null }): Promise<LecturaTitulo> {
    const titulo = String(a.titulo ?? '').trim();
    const clave = [companyId, a.coreKind ?? '', this.tipoDe(a) ?? '', normalizar(titulo), normalizar(a.indicaciones).slice(0, 200)].join('|');
    const guardada = this.lecturas.get(clave);
    if (guardada && guardada.hasta > Date.now()) return guardada.lectura;
    let lectura: LecturaTitulo = { complejidad: null, cantidad: cantidadDelTitulo(titulo), destino: null };
    try {
      const r = await this.complejidad?.sugerir(companyId, {
        coreKind: a.coreKind,
        tipo: this.tipoDe(a),
        titulo,
        indicaciones: a.indicaciones ?? null,
      });
      const s = r?.sugerencia;
      if (s) lectura = { complejidad: s.complejidad, cantidad: s.cantidad ?? lectura.cantidad, destino: s.destino };
    } catch (error) {
      this.logger.warn(`sin lectura del título: ${(error as Error).message}`);
    }
    this.lecturas.set(clave, { hasta: Date.now() + CACHE_LECTURA_MS, lectura });
    if (this.lecturas.size > 500) this.lecturas.delete(this.lecturas.keys().next().value as string);
    return lectura;
  }

  /** Mediana real del tipo (para juntas, guardias y lo que la tabla no mide). */
  private async tipicoMin(companyId: number, a: DatosTiempo): Promise<number | null> {
    try {
      const t = await this.complejidad?.tiempos(companyId, { coreKind: a.coreKind, tipo: this.tipoDe(a) });
      return t?.total.medianaMin ?? null;
    } catch {
      return null;
    }
  }

  /** ¿Hace falta leer el título? En lo asignado con estándar, tiempo y entrega, no. */
  private requiereLectura(dto: DatosTiempo): boolean {
    if (esAutoasignacion(dto)) return true;
    return !(dto.tiempoEstandarMin && dto.tiempoEstimadoMin && (dto.fechaEntregaEsperada || dto.fechaMaxima || dto.periodoFin));
  }

  /** El alta con tiempo y entrega siempre; en autoasignación, fijos desde el título. */
  async completar<T extends DatosTiempo & { indicaciones?: string | null }>(dto: T, companyId: number): Promise<T> {
    const leer = this.requiereLectura(dto);
    const conTipo = this.conTipoDelTitulo(dto);
    const lectura = leer ? await this.lectura(companyId, conTipo) : {};
    const tipicoMin = leer ? await this.tipicoMin(companyId, conTipo) : null;
    const historial = leer ? await this.historial(companyId, dto.titulo, dto.responsableId) : null;
    const personaTipo = leer ? await this.personaTipo(companyId, dto) : null;
    const jornada = await this.jornada(dto.responsableId);
    const { cambios, error } = completarTiempos(dto, { lectura, tipicoMin, historial, personaTipo, jornada, ahora: new Date() });
    if (error) throw new BadRequestException(error);
    return { ...dto, ...cambios };
  }

  /** Vista previa de la autoasignación: lo que se va a guardar, para enseñarlo en solo lectura. */
  async calcular(companyId: number, a: DatosTiempo & { indicaciones?: string | null }) {
    const conTipo = this.conTipoDelTitulo(a);
    const lectura = await this.lectura(companyId, conTipo);
    const tipicoMin = await this.tipicoMin(companyId, conTipo);
    const historial = await this.historial(companyId, a.titulo, a.responsableId);
    const personaTipo = await this.personaTipo(companyId, a);
    const jornada = await this.jornada(a.responsableId);
    const inicio = a.fechaInicio ? new Date(a.fechaInicio) : null;
    const conPeriodo = Boolean(a.periodoInicio && a.periodoFin);
    const est = estandarDeLectura(a, lectura, {
      tipicoMin,
      duracionAgendaMin: a.tiempoEstimadoMin ?? null,
      historial,
      personaTipo,
      quedaDeJornadaMin: conPeriodo ? null : minutosDeJornadaRestantes(inicio && !Number.isNaN(inicio.getTime()) ? inicio : new Date(), jornada),
    });
    return {
      tiempoEstandarMin: est.totalMin,
      desglose: est.desglose,
      supuestos: est.supuestos,
      complejidad: est.complejidad,
      unidades: est.unidades,
      fechaEntregaEsperada:
        !conPeriodo && inicio && !Number.isNaN(inicio.getTime()) ? entregaCalculada(inicio, est.totalMin, jornada).toISOString() : null,
    };
  }
}
