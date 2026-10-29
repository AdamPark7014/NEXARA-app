import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplejidadService } from '../ai/complejidad/complejidad.service.js';
import { mediana, normalizar } from '../ai/complejidad/tiempos-tipicos.js';
import {
  cantidadDelTitulo,
  completarTiempos,
  entregaCalculada,
  estandarDeLectura,
  esAutoasignacion,
  tipoDelTitulo,
  type DatosTiempo,
  type HistorialTitulo,
  type LecturaTitulo,
} from './tiempo-entrega.js';

/** La lectura de un título no cambia en media hora: así la vista previa y el alta dan lo mismo. */
const CACHE_LECTURA_MS = 30 * 60_000;
/** El historial de títulos cambia despacio: una consulta por empresa cada 10 minutos. */
const CACHE_HISTORIAL_MS = 10 * 60_000;
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
  private readonly historiales = new Map<number, { hasta: number; porTitulo: Map<string, Array<{ userId: number; minutos: number }>> }>();

  constructor(
    @Optional() private readonly complejidad?: ComplejidadService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Lo que ya tomó el mismo título (sin acentos ni mayúsculas): primero las veces de la persona, si
   * son 2+; si no, las de cualquiera, si son 2+. Reloj de quien la ejecutó en lo terminado o por
   * validar, sin lo que el sistema cortó solo. null si no hay suficiente.
   */
  async historial(companyId: number, titulo: string | null | undefined, responsableId?: number | null): Promise<HistorialTitulo | null> {
    const clave = normalizar(titulo);
    if (!this.prisma || clave.length < 4) return null;
    let datos = this.historiales.get(companyId);
    if (!datos || datos.hasta < Date.now()) {
      try {
        const filas = await this.prisma.$queryRaw<Array<{ titulo: string; userId: number; minutos: number }>>(Prisma.sql`
          WITH ses AS (
            SELECT s."activityId", s."userId", SUM(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) / 60.0)::float8 AS minutos,
                   BOOL_OR(s."endReason" IN ('TOPE_12H', 'CORTE_DIA')) AS cortada
            FROM activity_work_sessions s
            WHERE s."companyId" = ${companyId} AND s."endedAt" IS NOT NULL AND s."startedAt" >= ${DESDE_OPERACION_REAL}
            GROUP BY 1, 2
          )
          SELECT a.titulo, ses."userId", ses.minutos
          FROM ses JOIN "Activity" a ON a.id = ses."activityId" AND ses."userId" = a."responsableId"
          WHERE a."companyId" = ${companyId} AND a."deletedAt" IS NULL AND a.estatus IN ('Finalizada', 'Por Validar')
            AND NOT ses.cortada AND ses.minutos >= 5`);
        const porTitulo = new Map<string, Array<{ userId: number; minutos: number }>>();
        for (const f of filas) {
          const k = normalizar(f.titulo);
          porTitulo.set(k, [...(porTitulo.get(k) ?? []), { userId: Number(f.userId), minutos: Number(f.minutos) }]);
        }
        datos = { hasta: Date.now() + CACHE_HISTORIAL_MS, porTitulo };
        this.historiales.set(companyId, datos);
      } catch (error) {
        this.logger.warn(`sin historial de títulos: ${(error as Error).message}`);
        return null;
      }
    }
    const todas = datos.porTitulo.get(clave) ?? [];
    const propias = responsableId ? todas.filter((x) => x.userId === responsableId) : [];
    const usar = propias.length >= 2 ? propias : todas.length >= 2 ? todas : null;
    if (!usar) return null;
    return { minutos: mediana(usar.map((x) => x.minutos)) ?? 0, veces: usar.length, propio: usar === propias };
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
    const { cambios, error } = completarTiempos(dto, { lectura, tipicoMin, historial, ahora: new Date() });
    if (error) throw new BadRequestException(error);
    return { ...dto, ...cambios };
  }

  /** Vista previa de la autoasignación: lo que se va a guardar, para enseñarlo en solo lectura. */
  async calcular(companyId: number, a: DatosTiempo & { indicaciones?: string | null }) {
    const conTipo = this.conTipoDelTitulo(a);
    const lectura = await this.lectura(companyId, conTipo);
    const tipicoMin = await this.tipicoMin(companyId, conTipo);
    const historial = await this.historial(companyId, a.titulo, a.responsableId);
    const est = estandarDeLectura(a, lectura, { tipicoMin, duracionAgendaMin: a.tiempoEstimadoMin ?? null, historial });
    const inicio = a.fechaInicio ? new Date(a.fechaInicio) : null;
    const conPeriodo = Boolean(a.periodoInicio && a.periodoFin);
    return {
      tiempoEstandarMin: est.totalMin,
      desglose: est.desglose,
      supuestos: est.supuestos,
      complejidad: est.complejidad,
      unidades: est.unidades,
      fechaEntregaEsperada:
        !conPeriodo && inicio && !Number.isNaN(inicio.getTime()) ? entregaCalculada(inicio, est.totalMin).toISOString() : null,
    };
  }
}
