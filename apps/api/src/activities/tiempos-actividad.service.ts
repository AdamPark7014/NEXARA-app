import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ComplejidadService } from '../ai/complejidad/complejidad.service.js';
import { normalizar } from '../ai/complejidad/tiempos-tipicos.js';
import {
  cantidadDelTitulo,
  completarTiempos,
  entregaCalculada,
  estandarDeLectura,
  esAutoasignacion,
  type DatosTiempo,
  type LecturaTitulo,
} from './tiempo-entrega.js';

/** La lectura de un título no cambia en media hora: así la vista previa y el alta dan lo mismo. */
const CACHE_LECTURA_MS = 30 * 60_000;

/**
 * Tiempo y entrega de toda actividad nueva (reglas en `tiempo-entrega.ts`). La IA solo lee el título
 * (complejidad, cantidad, destino; la de `ComplejidadService`, por la puerta con Haiku); sin IA, el
 * número que traiga el título. Los minutos los pone la tabla.
 */
@Injectable()
export class TiemposActividadService {
  private readonly logger = new Logger('TiemposActividad');
  private readonly lecturas = new Map<string, { hasta: number; lectura: LecturaTitulo }>();

  constructor(@Optional() private readonly complejidad?: ComplejidadService) {}

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
    const lectura = this.requiereLectura(dto) ? await this.lectura(companyId, dto) : {};
    const tipicoMin = this.requiereLectura(dto) ? await this.tipicoMin(companyId, dto) : null;
    const { cambios, error } = completarTiempos(dto, { lectura, tipicoMin, ahora: new Date() });
    if (error) throw new BadRequestException(error);
    return { ...dto, ...cambios };
  }

  /** Vista previa de la autoasignación: lo que se va a guardar, para enseñarlo en solo lectura. */
  async calcular(companyId: number, a: DatosTiempo & { indicaciones?: string | null }) {
    const lectura = await this.lectura(companyId, a);
    const tipicoMin = await this.tipicoMin(companyId, a);
    const est = estandarDeLectura(a, lectura, { tipicoMin, duracionAgendaMin: a.tiempoEstimadoMin ?? null });
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
