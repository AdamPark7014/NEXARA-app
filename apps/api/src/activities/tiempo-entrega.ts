/**
 * Ninguna actividad sin tiempo ni entrega (Adam, 29-10-2026: «ya no debe haber ninguna actividad que
 * tenga tiempo indefinido de entrega… la autoasignación es fija basándose en el título»).
 *
 * - El tiempo estándar, en este orden (medido contra el tiempo real de 233 actividades terminadas el
 *   29-10: con solo la tabla y «1 unidad» salía 0.22× lo real y 22 % dentro de ×2; así, 0.89× y 52 %):
 *   1. Lo que ha tomado este mismo título (mediana de 2+ veces; primero las de la persona).
 *   2. La tabla (`ai/estandar/tabla-estandar.ts`) con lo que se lee del título (la IA propone
 *      complejidad, cantidad y destino; aquí no hay IA), con el tipo que dice el título si el elegido
 *      no cuadra («tubería» guardada como «Preparación de equipo»).
 *   3. Si el título no dice cuántos: en infraestructura (obra, instalación, cableado) una jornada en
 *      sitio; en lo demás, la mediana real del tipo (y si no hay, 1 unidad).
 *   Lo que se supone se escribe en el desglose. Sin regla en la tabla (o en juntas y guardias), la
 *   mediana real del tipo, y si no hay, 1 h.
 * - La entrega a más tardar es el inicio más ese tiempo, contando la comida, sin pasar del fin de la
 *   jornada de quien la ejecuta (la cuadrilla sale a las 17:00, la oficina a las 18:00).
 * - En la autoasignación esos valores son fijos; en lo asignado a otro solo se llenan si faltan.
 *
 * Puro, con pruebas.
 */
import { calcularEstandar, reglaDe, TOPE_ESTANDAR_MIN, type Desglose, type ReglaEstandar, type Traslado } from '../ai/estandar/tabla-estandar.js';
import { esComplejidad, normalizar, type Complejidad } from '../ai/complejidad/tiempos-tipicos.js';
import { workDayAtClock } from '../common/time/workday.js';
import { aHoraMinuto, aMinutos, MINUTOS_DE_COMIDA, ventanaDeComida } from '../attendance/lunch/ventana-comida.js';

/** Sin ruta: ida y vuelta aproximadas dentro de Puebla. */
export const TRASLADO_APROX: Traslado = { idaMin: 30, vueltaMin: 30 };
/** Sin regla ni historial del tipo. */
export const MINUTOS_POR_OMISION = 60;
/** Entrada, salida y comida de quien ejecuta (`HH:MM`, hora de México). */
export type JornadaEntrega = { entrada: string; salida: string; comidaDesde: string; comidaHasta: string };
/** La oficina (Adam, 05-10-2026): de 10 a 18, comida de 15 a 16. Es la de quien no tiene horario. */
export const JORNADA_OFICINA: JornadaEntrega = { entrada: '10:00', salida: '18:00', comidaDesde: '15:00', comidaHasta: '16:00' };

function minutosHm(valor?: string | null): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((valor ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function aHm(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * La jornada de un horario (`horarioDePersona`): su entrada y su salida, con su comida. Sin entrada
 * (dirección 24/7) o sin horario, la de la oficina; sin salida, 9 h después de entrar.
 *
 * La comida es la ventana de asistencia (`ventanaDeComida`, una sola regla): quien entra a las 10:00
 * o después come de 15 a 16; quien entra antes (la cuadrilla, 08:00–17:00) tiene una hora libre desde
 * las 5 h de entrar, y para la entrega se supone la primera (13–14).
 */
export function jornadaDeHorario(h?: { entrada?: string | null; salida?: string | null } | null): JornadaEntrega {
  const entrada = minutosHm(h?.entrada);
  if (entrada == null) return JORNADA_OFICINA;
  const salida = minutosHm(h?.salida) ?? entrada + 8 * 60 + MINUTOS_DE_COMIDA;
  const comida = ventanaDeComida(h);
  return {
    entrada: aHm(entrada),
    salida: aHm(salida),
    comidaDesde: comida.desde,
    comidaHasta: aHoraMinuto(aMinutos(comida.desde) + comida.minutos),
  };
}

export type TipoActividad = { coreKind?: string | null; ticketType?: string | null; ticketTypeCustom?: string | null };

/** Lo que tomó antes el mismo título: mediana, cuántas veces y si son de la misma persona. */
export type HistorialTitulo = { minutos: number; veces: number; propio: boolean };

/**
 * Trabajos que el título nombra sin lugar a duda, aunque el tipo elegido diga otro: tubería,
 * charola, registros y cable son cableado y canalización; las facturas, facturación.
 */
const TIPO_POR_TITULO: Array<[RegExp, { coreKind: string; ticketTypeCustom: string }, readonly string[]]> = [
  // «Cotizar tubería» es una cotización: lo comercial no pasa a cableado.
  [/\b(tuberia|charola|canalizacion|registros?|cableado|cable|nodos?)\b/, { coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización' }, ['tarea', '']],
  // Las facturas que la contadora guarda como comercial sí son facturación.
  [/\bfacturas?\b/, { coreKind: 'tarea', ticketTypeCustom: 'Facturación y contabilidad' }, ['tarea', 'comercial', '']],
];

/** El tipo que dice el título si el elegido no cuadra; null si cuadra o no se sabe. Servicio y obra no se tocan. */
export function tipoDelTitulo(a: TipoActividad & { titulo?: string | null; indicaciones?: string | null }) {
  if (!a.titulo) return null;
  const kind = String(a.coreKind ?? '').trim().toLowerCase();
  if (['servicio', 'obra', 'proyecto'].includes(kind)) return null;
  const texto = normalizar(`${a.titulo ?? ''} ${a.indicaciones ?? ''}`);
  const actual = reglaDe(a)?.clave ?? null;
  for (const [patron, tipo, deTipos] of TIPO_POR_TITULO) {
    if (!deTipos.includes(kind) || !patron.test(texto)) continue;
    const clave = reglaDe(tipo)?.clave ?? null;
    return clave && clave !== actual ? tipo : null;
  }
  return null;
}

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
  tipoGuardado: TipoActividad & { titulo?: string | null; indicaciones?: string | null },
  lectura: LecturaTitulo,
  opciones: {
    traslado?: Traslado | null;
    tipicoMin?: number | null;
    duracionAgendaMin?: number | null;
    historial?: HistorialTitulo | null;
  } = {},
): EstandarCalculado {
  // El tipo que dice el título manda sobre uno elegido que no cuadra (solo para calcular).
  const delTitulo = tipoDelTitulo(tipoGuardado);
  const tipo = delTitulo ? { ...tipoGuardado, ...delTitulo } : tipoGuardado;
  const avisoTipo = delTitulo ? [`el título es de ${delTitulo.ticketTypeCustom.toLowerCase()}: se calcula como tal`] : [];
  const regla: ReglaEstandar | null = reglaDe(tipo);
  const respaldo = (concepto: string): EstandarCalculado => {
    const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, opciones.tipicoMin ?? MINUTOS_POR_OMISION));
    return {
      totalMin: minutos,
      desglose: [{ concepto, minutos }],
      complejidad: esComplejidad(lectura.complejidad) ? lectura.complejidad : null,
      unidades: null,
      supuestos: [...avisoTipo, ...(opciones.tipicoMin ? [] : ['sin historial del tipo: 1 h'])],
    };
  };
  const agenda = regla?.agenda && opciones.duracionAgendaMin && opciones.duracionAgendaMin > 0 ? opciones.duracionAgendaMin : null;
  if (regla && agenda) {
    const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, agenda));
    return { totalMin: minutos, desglose: [{ concepto: `${regla.nombre}: lo que dura en la agenda`, minutos }], complejidad: null, unidades: null, supuestos: [] };
  }
  // Lo que ya ha tomado este mismo título es lo que mejor predice (el «Apoyo Biblioteca» de cada día).
  const h = opciones.historial;
  if (h && h.veces >= 2 && h.minutos > 0) {
    const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, h.minutos));
    return {
      totalMin: minutos,
      desglose: [{ concepto: `Lo que ha tomado este mismo título (mediana de ${h.veces} veces${h.propio ? ', tuyas' : ''})`, minutos }],
      complejidad: esComplejidad(lectura.complejidad) ? lectura.complejidad : null,
      unidades: null,
      supuestos: [],
    };
  }
  if (!regla) return respaldo(opciones.tipicoMin ? 'Tiempo típico del tipo' : 'Tiempo por omisión');
  if (regla.agenda) return respaldo(opciones.tipicoMin ? `${regla.nombre}: tiempo típico` : `${regla.nombre}: tiempo por omisión`);

  const supuestos: string[] = [...avisoTipo];
  const unidad = regla.unidades[0] ?? null;
  let cantidad = lectura.cantidad && lectura.cantidad > 0 ? Math.round(lectura.cantidad) : null;
  // «¿Cuántas partidas?» de la tabla: así concuerda («cuántas partidas», «cuántos equipos»).
  const cuantos = unidad ? unidad.pregunta.replace(/[¿?]/g, '').toLowerCase() : '';
  // Infraestructura sin cantidad (tubería, cableado, CCTV): es un día en sitio, no una pieza.
  const enSitio = regla.unidades.find((x) => x.sinBase) ?? null;
  if (enSitio && !cantidad) {
    const r = calcularEstandar(regla, { cantidad: 1, unidad: enSitio.clave });
    return {
      totalMin: r.totalMin ?? enSitio.porUnidadMin,
      desglose: r.desglose,
      complejidad: esComplejidad(lectura.complejidad) ? lectura.complejidad : null,
      unidades: { clave: enSitio.clave, cantidad: 1 },
      supuestos: [...supuestos, `el título no dice ${cuantos}: una jornada en obra`],
    };
  }
  if (unidad && !cantidad && opciones.tipicoMin && opciones.tipicoMin > 0) {
    // Sin cantidad, «1 unidad» se quedaba en una fracción de lo real: la mediana del tipo se acerca más.
    const minutos = redondeo5(Math.min(TOPE_ESTANDAR_MIN, opciones.tipicoMin));
    return {
      totalMin: minutos,
      desglose: [{ concepto: `${regla.nombre}: tiempo típico`, minutos }],
      complejidad: esComplejidad(lectura.complejidad) ? lectura.complejidad : null,
      unidades: null,
      supuestos: [...supuestos, `el título no dice ${cuantos}: tiempo típico del tipo`],
    };
  }
  if (unidad && !cantidad) {
    cantidad = 1;
    supuestos.push(`el título no dice ${cuantos}: se cuenta 1`);
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
 * Entrega a más tardar: el inicio más el tiempo, sumando la comida si la cruza, sin pasar de la
 * salida cuando empieza dentro de la jornada (la de quien ejecuta; por omisión, la de la oficina).
 * Al menos 5 min después del inicio.
 */
export function entregaCalculada(inicio: Date, minutos: number, jornada: JornadaEntrega = JORNADA_OFICINA): Date {
  const a = (hm: string, respaldo: string) => {
    const min = minutosHm(hm) ?? (minutosHm(respaldo) as number);
    return workDayAtClock(inicio, Math.floor(min / 60), min % 60);
  };
  const comidaDesde = a(jornada.comidaDesde, JORNADA_OFICINA.comidaDesde);
  const comidaHasta = a(jornada.comidaHasta, JORNADA_OFICINA.comidaHasta);
  const salida = a(jornada.salida, JORNADA_OFICINA.salida);
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
  ctx: {
    lectura: LecturaTitulo;
    tipicoMin?: number | null;
    traslado?: Traslado | null;
    ahora: Date;
    historial?: HistorialTitulo | null;
    /** La jornada de quien la ejecuta; sin ella, la de la oficina. */
    jornada?: JornadaEntrega | null;
  },
): { cambios: TiempoCompletado; error?: string } {
  const auto = esAutoasignacion(dto);
  const conPeriodo = Boolean(dto.periodoInicio && dto.periodoFin);
  const est = estandarDeLectura(dto, ctx.lectura, {
    traslado: auto ? null : ctx.traslado,
    tipicoMin: ctx.tipicoMin,
    duracionAgendaMin: dto.tiempoEstimadoMin ?? null,
    historial: ctx.historial ?? null,
  });
  const sugerida = esComplejidad(ctx.lectura.complejidad) ? ctx.lectura.complejidad : null;
  const desglose = [...est.desglose, ...est.supuestos.map((s) => ({ concepto: `Supuesto: ${s}`, minutos: 0 }))];
  const entrega = (minutos: number) => {
    if (conPeriodo) return {};
    const inicio = aFecha(dto.fechaInicio) ?? ctx.ahora;
    const iso = entregaCalculada(inicio, minutos, ctx.jornada ?? JORNADA_OFICINA).toISOString();
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
