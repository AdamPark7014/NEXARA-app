/**
 * Ninguna actividad sin tiempo ni entrega (Adam, 29-10-2026: «ya no debe haber ninguna actividad que
 * tenga tiempo indefinido de entrega… la autoasignación es fija basándose en el título»).
 *
 * - El tiempo estándar lo calcula la tabla (`ai/estandar/tabla-estandar.ts`) con lo que se lee del
 *   título (la IA propone complejidad, cantidad y destino; aquí no hay IA). Lo que el título no dice
 *   se supone y se escribe en el desglose: 1 unidad, complejidad estándar, traslado aproximado. Sin
 *   regla en la tabla (o en juntas y guardias), la mediana real del tipo, y si no hay, 1 h.
 * - La entrega a más tardar es el inicio más ese tiempo, contando la comida, sin pasar del fin de la
 *   jornada.
 * - En la autoasignación esos valores son fijos; en lo asignado a otro solo se llenan si faltan.
 *
 * Puro, con pruebas.
 */
import { calcularEstandar, reglaDe, TOPE_ESTANDAR_MIN, type Desglose, type ReglaEstandar, type Traslado } from '../ai/estandar/tabla-estandar.js';
import { esComplejidad, type Complejidad } from '../ai/complejidad/tiempos-tipicos.js';
import { workDayAtClock } from '../common/time/workday.js';

/** Sin ruta: ida y vuelta aproximadas dentro de Puebla. */
export const TRASLADO_APROX: Traslado = { idaMin: 30, vueltaMin: 30 };
/** Sin regla ni historial del tipo. */
export const MINUTOS_POR_OMISION = 60;
/** Jornada de NEXARA (Adam, 05-10-2026): comida de 15 a 16, salida a las 18. */
export const COMIDA_DESDE_H = 15;
export const COMIDA_HASTA_H = 16;
export const SALIDA_H = 18;

export type TipoActividad = { coreKind?: string | null; ticketType?: string | null; ticketTypeCustom?: string | null };

/** Lo que se leyó del título (la IA o, sin ella, el número que trae el texto). */
export type LecturaTitulo = { complejidad?: Complejidad | null; cantidad?: number | null; destino?: string | null };

export type EstandarCalculado = {
  totalMin: number;
  desglose: Desglose;
  complejidad: Complejidad | null;
  unidades: { clave: string; cantidad: number } | null;
  /** Lo que el título no decía y se supuso («1 dispositivo», «traslado aproximado»). */
  supuestos: string[];
};

/** «Instalar 4 cámaras» → 4. El primer número entero razonable del texto (no horas ni años). */
export function cantidadDelTitulo(texto: string | null | undefined): number | null {
  const limpio = String(texto ?? '').replace(/\b\d{1,2}[:.]\d{2}\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ');
  const m = /\b(\d{1,3})\b(?!\s*(h|hr|hrs|horas?|min|minutos?|am|pm|%))/i.exec(limpio);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 500 ? n : null;
}

const redondeo5 = (min: number) => Math.max(5, Math.round(min / 5) * 5);

/**
 * Estándar con lo leído del título; lo que falta se supone y queda en el desglose. Siempre da
 * minutos (nunca null). `tipicoMin`: mediana real del tipo, para lo que la tabla no mide.
 */
export function estandarDeLectura(
  tipo: TipoActividad,
  lectura: LecturaTitulo,
  opciones: { traslado?: Traslado | null; tipicoMin?: number | null; duracionAgendaMin?: number | null } = {},
): EstandarCalculado {
  const regla: ReglaEstandar | null = reglaDe(tipo);
  const respaldo = (concepto: string): EstandarCalculado => {
    const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, opciones.tipicoMin ?? MINUTOS_POR_OMISION));
    return {
      totalMin: minutos,
      desglose: [{ concepto, minutos }],
      complejidad: esComplejidad(lectura.complejidad) ? lectura.complejidad : null,
      unidades: null,
      supuestos: opciones.tipicoMin ? [] : ['sin historial del tipo: 1 h'],
    };
  };
  if (!regla) return respaldo(opciones.tipicoMin ? 'Tiempo típico del tipo' : 'Tiempo por omisión');
  if (regla.agenda) {
    const agenda = opciones.duracionAgendaMin && opciones.duracionAgendaMin > 0 ? opciones.duracionAgendaMin : null;
    if (agenda) {
      const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, agenda));
      return { totalMin: minutos, desglose: [{ concepto: `${regla.nombre}: lo que dura en la agenda`, minutos }], complejidad: null, unidades: null, supuestos: [] };
    }
    return respaldo(opciones.tipicoMin ? `${regla.nombre}: tiempo típico` : `${regla.nombre}: tiempo por omisión`);
  }

  const supuestos: string[] = [];
  const unidad = regla.unidades[0] ?? null;
  let cantidad = lectura.cantidad && lectura.cantidad > 0 ? Math.round(lectura.cantidad) : null;
  if (unidad && !cantidad) {
    cantidad = 1;
    // «¿Cuántas partidas?» de la tabla: así concuerda («cuántas partidas», «cuántos equipos»).
    supuestos.push(`el título no dice ${unidad.pregunta.replace(/[¿?]/g, '').toLowerCase()}: se cuenta 1`);
  }
  let complejidad: Complejidad | null = esComplejidad(lectura.complejidad) ? lectura.complejidad : null;
  if (regla.porComplejidad && !complejidad) {
    complejidad = 'ESTANDAR';
    supuestos.push('complejidad estándar');
  }
  let traslado = opciones.traslado ?? null;
  if (regla.destino && !traslado) {
    traslado = TRASLADO_APROX;
    supuestos.push('traslado aproximado (30 min de ida y 30 de vuelta)');
  }
  const r = calcularEstandar(regla, { cantidad, unidad: unidad?.clave ?? null, complejidad, traslado });
  if (r.totalMin == null) return respaldo('Tiempo por omisión');
  return {
    totalMin: r.totalMin,
    desglose: r.desglose,
    complejidad,
    unidades: unidad && cantidad ? { clave: unidad.clave, cantidad } : null,
    supuestos,
  };
}

/**
 * Entrega a más tardar: el inicio más el tiempo, sumando la comida (15–16) si la cruza, sin pasar
 * de la salida (18:00) cuando empieza dentro de la jornada. Al menos 5 min después del inicio.
 */
export function entregaCalculada(inicio: Date, minutos: number): Date {
  const comidaDesde = workDayAtClock(inicio, COMIDA_DESDE_H);
  const comidaHasta = workDayAtClock(inicio, COMIDA_HASTA_H);
  const salida = workDayAtClock(inicio, SALIDA_H);
  let fin = new Date(inicio.getTime() + Math.max(5, minutos) * 60_000);
  // Empieza antes de la comida y termina después de que empieza: la hora de comida no cuenta.
  if (inicio < comidaDesde && fin > comidaDesde) fin = new Date(fin.getTime() + (comidaHasta.getTime() - comidaDesde.getTime()));
  // Empieza en la comida: corre desde que acaba.
  else if (inicio >= comidaDesde && inicio < comidaHasta) fin = new Date(comidaHasta.getTime() + Math.max(5, minutos) * 60_000);
  if (inicio < salida && fin > salida) fin = salida;
  const minimo = new Date(inicio.getTime() + 5 * 60_000);
  return fin < minimo ? minimo : fin;
}

/** Lo del alta que decide el tiempo y la entrega. */
export type DatosTiempo = TipoActividad & {
  titulo?: string | null;
  creadoPorId?: number | null;
  responsableId?: number | null;
  tiempoEstimadoMin?: number | null;
  tiempoEstandarMin?: number | null;
  estandarDesglose?: Desglose | null;
  estandarCambiadoMotivo?: string | null;
  complejidad?: string | null;
  complejidadSugerida?: string | null;
  unidades?: { clave: string; cantidad: number } | null;
  fechaInicio?: string | Date | null;
  fechaEntregaEsperada?: string | Date | null;
  fechaMaxima?: string | Date | null;
  periodoInicio?: string | null;
  periodoFin?: string | null;
};

/** Lo que el alta debe guardar para no quedar sin tiempo ni entrega. */
export type TiempoCompletado = {
  tiempoEstimadoMin: number;
  tiempoEstandarMin: number;
  estandarDesglose: Desglose;
  estandarCambiadoMotivo?: string | null;
  complejidad?: Complejidad | null;
  complejidadSugerida?: Complejidad | null;
  unidades?: { clave: string; cantidad: number } | null;
  fechaEntregaEsperada?: string;
  fechaMaxima?: string;
};

const aFecha = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Completa el alta. Autoasignación: tiempo, estándar, complejidad, unidades y entrega salen del
 * título y lo que mande el cliente se ignora. Asignada a otro: se respeta lo que puso quien asigna
 * y solo se llena lo que falta (con periodo, la entrega la pone el periodo). `error` = el tiempo no
 * es el estándar y no dice por qué.
 */
export function completarTiempos(
  dto: DatosTiempo,
  ctx: { lectura: LecturaTitulo; tipicoMin?: number | null; traslado?: Traslado | null; ahora: Date },
): { cambios: TiempoCompletado; error?: string } {
  const auto = esAutoasignacion(dto);
  const conPeriodo = Boolean(dto.periodoInicio && dto.periodoFin);
  const est = estandarDeLectura(dto, ctx.lectura, {
    traslado: auto ? null : ctx.traslado,
    tipicoMin: ctx.tipicoMin,
    duracionAgendaMin: dto.tiempoEstimadoMin ?? null,
  });
  const sugerida = esComplejidad(ctx.lectura.complejidad) ? ctx.lectura.complejidad : null;
  const desglose = [...est.desglose, ...est.supuestos.map((s) => ({ concepto: `Supuesto: ${s}`, minutos: 0 }))];
  const entrega = (minutos: number) => {
    if (conPeriodo) return {};
    const inicio = aFecha(dto.fechaInicio) ?? ctx.ahora;
    const iso = entregaCalculada(inicio, minutos).toISOString();
    return { fechaEntregaEsperada: iso, fechaMaxima: iso };
  };

  if (auto) {
    return {
      cambios: {
        tiempoEstimadoMin: est.totalMin,
        tiempoEstandarMin: est.totalMin,
        estandarDesglose: desglose,
        estandarCambiadoMotivo: null,
        complejidad: est.complejidad,
        complejidadSugerida: sugerida,
        unidades: est.unidades,
        ...entrega(est.totalMin),
      },
    };
  }

  const dioEstandar = dto.tiempoEstandarMin != null && dto.tiempoEstandarMin > 0;
  const estandar = dioEstandar ? Number(dto.tiempoEstandarMin) : est.totalMin;
  const estimado = dto.tiempoEstimadoMin != null && dto.tiempoEstimadoMin > 0 ? Number(dto.tiempoEstimadoMin) : estandar;
  const cambios: TiempoCompletado = {
    tiempoEstimadoMin: estimado,
    tiempoEstandarMin: estandar,
    estandarDesglose: dioEstandar && dto.estandarDesglose?.length ? dto.estandarDesglose : desglose,
  };
  if (!dto.complejidad && est.complejidad) cambios.complejidad = est.complejidad;
  if (!dto.complejidadSugerida && sugerida) cambios.complejidadSugerida = sugerida;
  if (!dto.unidades && est.unidades && !dioEstandar) cambios.unidades = est.unidades;
  const fee = aFecha(dto.fechaEntregaEsperada);
  const max = aFecha(dto.fechaMaxima);
  if (!conPeriodo) {
    if (!fee && !max) Object.assign(cambios, entrega(estimado));
    else if (!fee) cambios.fechaEntregaEsperada = max!.toISOString();
    else if (!max) cambios.fechaMaxima = fee.toISOString();
  }
  // Quien asigna conocía el estándar y puso otro tiempo: tiene que decir por qué (§8).
  const error =
    dioEstandar && dto.tiempoEstimadoMin != null && Number(dto.tiempoEstimadoMin) !== estandar && !String(dto.estandarCambiadoMotivo ?? '').trim()
      ? 'El tiempo no es el estándar: escribe por qué lo cambiaste.'
      : undefined;
  return { cambios, error };
}

/** La creó quien la ejecuta. */
export function esAutoasignacion(a: { creadoPorId?: number | null; responsableId?: number | null }): boolean {
  return a.creadoPorId != null && a.creadoPorId === a.responsableId;
}

/**
 * Parámetros de tiempo y entrega: en la autoasignación los pone el sistema, y en lo asignado solo
 * los cambia un superior de quien la ejecuta.
 */
export const CAMPOS_PARAMETROS = [
  'tiempoEstimadoMin',
  'tiempoEstandarMin',
  'estandarDesglose',
  'estandarCambiadoMotivo',
  'complejidad',
  'unidades',
  'destino',
  'trasladoMin',
  'trasladoModo',
  'fechaEntregaEsperada',
  'fechaMaxima',
] as const;
export type CampoParametro = (typeof CAMPOS_PARAMETROS)[number];

function mismoValor(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date || (typeof a === 'string' && typeof b === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a))) {
    const ta = a == null ? NaN : new Date(a as string | Date).getTime();
    const tb = b == null ? NaN : new Date(b as string | Date).getTime();
    return ta === tb;
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return String(a ?? '') === String(b ?? '');
}

/** Qué parámetros cambia una edición (los que llegan iguales a lo guardado no cuentan). */
export function parametrosCambiados(prev: Partial<Record<CampoParametro, unknown>>, dto: Record<string, unknown>): CampoParametro[] {
  return CAMPOS_PARAMETROS.filter((k) => k in dto && dto[k] !== undefined && !mismoValor(prev[k], dto[k]));
}
