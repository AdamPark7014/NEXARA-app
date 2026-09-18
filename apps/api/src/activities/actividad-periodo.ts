/**
 * Periodo de una actividad: del día de inicio al día de fin, los dos incluidos.
 *
 * Regla del dueño (18-09): «al crear un proyecto se define el tiempo de ejecución
 * y con base en el mismo se designan los periodos de las actividades, para no
 * realizar la carga de estas de manera diaria cuando el tiempo se prolonga».
 *
 * Antes una actividad solo tenía un instante (`fechaInicio = fechaMaxima =
 * fechaEntregaEsperada`, así lo manda el formulario): a la hora citada ya estaba
 * «vencida», el semáforo se ponía rojo, la pizarra la marcaba «Atrasado» y el SLA
 * avisaba a dirección. Un trabajo de diez días obligaba a cerrarla y cargar otra
 * cada mañana. Con periodo, la actividad se queda en la pizarra todos los días
 * hasta su fin («Día 3 de 10 · termina vie 25 sep») y nada la da por tarde antes.
 *
 * Los días son de calendario y viajan como `AAAA-MM-DD`. En la base viven en
 * columnas `@db.Date`, que Prisma entrega a medianoche UTC: se leen en UTC. «Hoy»
 * es el día laboral de la empresa (`workDateKey`), nunca el del servidor.
 *
 * Archivo puro: sin Prisma ni Nest, para probarlo sin base de datos.
 */
import { parseWorkDate, workDateKey, workDayAtClock, workDayEnd } from '../common/time/workday.js';

const MS_DIA = 86_400_000;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Un periodo más largo que esto es un error de captura (un año de más), no un plan. */
export const MAX_DIAS_PERIODO = 366;

/** Hora de inicio por omisión cuando el periodo no trae hora (la jornada arranca a las 9). */
export const HORA_INICIO_POR_OMISION = 9;

export type Periodo = { inicio: string; fin: string };

/**
 * programada: todavía no empieza. en_curso: hoy cae dentro. vencida: ya pasó el
 * último día y sigue abierta. cerrada: se terminó (el periodo solo se informa).
 */
export type EstadoPeriodo = 'programada' | 'en_curso' | 'vencida' | 'cerrada';

/** Lo que devuelven `me/activities`, la pizarra y el detalle; las apps pintan `etiqueta`. */
export type PeriodoDto = Periodo & {
  /** Días del periodo (M en «Día N de M»). */
  dias: number;
  /** N en «Día N de M» mientras corre; null antes de empezar o después de terminar. */
  dia: number | null;
  estado: EstadoPeriodo;
  /** «Día 3 de 10 · termina vie 25 sep», «Empieza lun 28 sep · 5 días»… */
  etiqueta: string;
  /** Más de un día: el tiempo estimado por jornada no aplica. */
  multiDia: boolean;
};

// ---------------------------------------------------------------------------
// Días de calendario
// ---------------------------------------------------------------------------

function numeroDia(clave: string): number {
  const [y, m, d] = clave.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_DIA;
}

function claveDeNumero(n: number): string {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

/**
 * `AAAA-MM-DD` de un valor de columna `@db.Date` (medianoche UTC) o de un texto
 * que empieza así («2026-09-21» o «2026-09-21T00:00:00.000Z»). null si no es un día real.
 */
export function claveDia(valor: unknown): string | null {
  if (valor == null || valor === '') return null;
  let clave: string | null = null;
  if (typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    clave = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  } else if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    clave = valor.toISOString().slice(0, 10);
  }
  if (!clave) return null;
  // «2026-02-31» no existe: al ir y volver cambia de día.
  return claveDeNumero(numeroDia(clave)) === clave ? clave : null;
}

export function sumarDias(clave: string, dias: number): string {
  return claveDeNumero(numeroDia(clave) + dias);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return numeroDia(hasta) - numeroDia(desde);
}

/** Días que abarca el periodo, contando el primero y el último. */
export function diasDelPeriodo(p: Periodo): number {
  return diasEntre(p.inicio, p.fin) + 1;
}

/** «vie 25 sep»: corto y sin depender del ICU del servidor (unos dicen «sept.», otros «sep»). */
export function fechaCorta(clave: string): string {
  const d = new Date(numeroDia(clave) * MS_DIA);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Valor para una columna `@db.Date`. */
export function columnaDia(clave: string): Date {
  return new Date(numeroDia(clave) * MS_DIA);
}

/** Instante en que arranca el periodo: su primer día a la hora dada, en hora de la empresa. */
export function inicioDelPeriodo(clave: string, hora = HORA_INICIO_POR_OMISION, minuto = 0): Date {
  return workDayAtClock(parseWorkDate(clave), hora, minuto);
}

/** Último instante del periodo: el fin de su último día, en hora de la empresa. */
export function finDelPeriodo(clave: string): Date {
  return workDayEnd(parseWorkDate(clave));
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export type PeriodoValidado = { periodo: Periodo | null; error?: undefined } | { periodo?: undefined; error: string };

/**
 * Lee el periodo que manda un cliente. Sin inicio ni fin no hay periodo (una
 * actividad de un solo instante, como siempre); con uno solo, es un error.
 */
export function validarPeriodo(inicio: unknown, fin: unknown): PeriodoValidado {
  const vacio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
  if (vacio(inicio) && vacio(fin)) return { periodo: null };
  if (vacio(inicio) || vacio(fin)) return { error: 'El periodo necesita día de inicio y día de fin' };
  const a = claveDia(inicio);
  const b = claveDia(fin);
  if (!a || !b) return { error: 'Las fechas del periodo no son válidas (usa AAAA-MM-DD)' };
  if (b < a) return { error: 'El día de fin no puede ser anterior al día de inicio' };
  if (diasDelPeriodo({ inicio: a, fin: b }) > MAX_DIAS_PERIODO) {
    return { error: 'Un periodo no puede pasar de un año' };
  }
  return { periodo: { inicio: a, fin: b } };
}

/** El periodo guardado de una actividad (columnas `periodoInicio`/`periodoFin`), si lo tiene. */
export function periodoDeActividad(a: {
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
} | null | undefined): Periodo | null {
  if (!a) return null;
  const inicio = claveDia(a.periodoInicio);
  const fin = claveDia(a.periodoFin);
  if (!inicio || !fin || fin < inicio) return null;
  return { inicio, fin };
}

/**
 * Columnas que se guardan con un periodo. La fecha máxima y la entrega esperada
 * son el fin del último día: así el semáforo, la pizarra y los avisos de SLA
 * —que ya miran esas columnas— no la dan por tarde antes de tiempo.
 *
 * El inicio programado se respeta si cae dentro del periodo (trae la hora que
 * eligió quien asignó); si no, es el primer día a las 9:00.
 */
export function camposDePeriodo(
  periodo: Periodo,
  fechaInicio?: Date | string | null,
): {
  periodoInicio: Date;
  periodoFin: Date;
  fechaInicio: Date;
  fechaMaxima: Date;
  fechaEntregaEsperada: Date;
} {
  const fin = finDelPeriodo(periodo.fin);
  let inicio: Date | null = null;
  if (fechaInicio) {
    const d = fechaInicio instanceof Date ? fechaInicio : new Date(fechaInicio);
    if (!Number.isNaN(d.getTime())) {
      const dia = workDateKey(d);
      if (dia >= periodo.inicio && dia <= periodo.fin) inicio = d;
    }
  }
  return {
    periodoInicio: columnaDia(periodo.inicio),
    periodoFin: columnaDia(periodo.fin),
    fechaInicio: inicio ?? inicioDelPeriodo(periodo.inicio),
    fechaMaxima: fin,
    fechaEntregaEsperada: fin,
  };
}

// ---------------------------------------------------------------------------
// Lectura: «Día N de M»
// ---------------------------------------------------------------------------

export function esMultiDia(p: Periodo | null | undefined): boolean {
  return Boolean(p && diasDelPeriodo(p) > 1);
}

/** ¿Empieza después de `hoy`? Entonces todavía no se le exige nada. */
export function periodoFuturo(p: Periodo | null | undefined, hoy: string): boolean {
  return Boolean(p && p.inicio > hoy);
}

/** ¿El periodo toca el rango de días `[desde, hasta]` (ambos incluidos)? */
export function periodoTocaRango(p: Periodo, desde: string, hasta: string): boolean {
  return p.inicio <= hasta && p.fin >= desde;
}

/** ¿Dos periodos comparten al menos un día? */
export function periodosSeEmpalman(a: Periodo, b: Periodo): boolean {
  return periodoTocaRango(a, b.inicio, b.fin);
}

export function estadoDelPeriodo(p: Periodo, hoy: string, cerrada = false): EstadoPeriodo {
  if (cerrada) return 'cerrada';
  if (hoy < p.inicio) return 'programada';
  if (hoy > p.fin) return 'vencida';
  return 'en_curso';
}

/** N en «Día N de M», o null si hoy no cae dentro del periodo. */
export function diaDelPeriodo(p: Periodo, hoy: string): number | null {
  if (hoy < p.inicio || hoy > p.fin) return null;
  return diasEntre(p.inicio, hoy) + 1;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * La frase del periodo, igual en web, Android e iOS (las apps solo la pintan):
 * - «Empieza mañana · 5 días» / «Empieza lun 28 sep · 5 días»
 * - «Día 3 de 10 · termina vie 25 sep» / «Día 10 de 10 · termina hoy»
 * - «Terminaba vie 25 sep · 2 días de atraso»
 * - «Del mié 16 sep al vie 25 sep» (ya cerrada)
 */
export function etiquetaDelPeriodo(p: Periodo, hoy: string, cerrada = false): string {
  const dias = diasDelPeriodo(p);
  switch (estadoDelPeriodo(p, hoy, cerrada)) {
    case 'cerrada':
      return dias === 1 ? `El ${fechaCorta(p.inicio)}` : `Del ${fechaCorta(p.inicio)} al ${fechaCorta(p.fin)}`;
    case 'programada': {
      const cuando = diasEntre(hoy, p.inicio) === 1 ? 'mañana' : fechaCorta(p.inicio);
      return `Empieza ${cuando} · ${plural(dias, 'día', 'días')}`;
    }
    case 'vencida': {
      const atraso = diasEntre(p.fin, hoy);
      return `Terminaba ${fechaCorta(p.fin)} · ${plural(atraso, 'día', 'días')} de atraso`;
    }
    default: {
      const n = diaDelPeriodo(p, hoy) as number;
      const termina = p.fin === hoy ? 'termina hoy' : `termina ${fechaCorta(p.fin)}`;
      return `Día ${n} de ${dias} · ${termina}`;
    }
  }
}

/** El periodo listo para responder, o null si la actividad no tiene periodo. */
export function periodoDto(
  a: { periodoInicio?: Date | string | null; periodoFin?: Date | string | null } | null | undefined,
  ahora: Date = new Date(),
  cerrada = false,
): PeriodoDto | null {
  const p = periodoDeActividad(a);
  if (!p) return null;
  const hoy = workDateKey(ahora);
  return {
    ...p,
    dias: diasDelPeriodo(p),
    dia: cerrada ? null : diaDelPeriodo(p, hoy),
    estado: estadoDelPeriodo(p, hoy, cerrada),
    etiqueta: etiquetaDelPeriodo(p, hoy, cerrada),
    multiDia: esMultiDia(p),
  };
}

/**
 * Límite contra el que se mide «vencida»: el fin del periodo si lo hay, si no la
 * fecha máxima de siempre. (Con periodo coinciden; esto cubre filas que alguien
 * editó por otro camino.)
 */
export function limiteDeActividad(a: {
  fechaMaxima?: Date | null;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
}): Date | null {
  const p = periodoDeActividad(a);
  return p ? finDelPeriodo(p.fin) : (a.fechaMaxima ?? null);
}

// ---------------------------------------------------------------------------
// Etapas del proyecto → periodos encadenados
// ---------------------------------------------------------------------------

export type EtapaParaPeriodo = { id: number; plannedDate?: Date | string | null };

export type EtapaConPeriodo = Periodo & {
  id: number;
  dias: number;
  /** La fecha planeada caía antes de que terminara la etapa anterior: se recorrió. */
  ajustada: boolean;
};

/** Duración por omisión de una etapa sin fecha ni nada contra qué repartir. */
export const DIAS_ETAPA_SIN_FECHA = 7;

/**
 * Periodos por etapa: cada una empieza el día siguiente a que termina la anterior
 * (la primera, el día que arranca el proyecto) y termina en su fecha planeada.
 *
 * - Sin fecha planeada, se reparten por igual los días que quedan hasta la
 *   siguiente etapa con fecha (o hasta el fin del proyecto); si no hay contra qué
 *   repartir, una semana.
 * - Una fecha planeada anterior a donde va la cadena se recorre (`ajustada`): la
 *   etapa dura al menos un día y la siguiente no se encima.
 *
 * Es solo la propuesta: la pantalla deja moverla antes de confirmar.
 */
export function encadenarEtapas(
  etapas: EtapaParaPeriodo[],
  inicioProyecto: Date | string,
  finProyecto?: Date | string | null,
): EtapaConPeriodo[] {
  const arranque = claveDia(inicioProyecto);
  if (!arranque) return [];
  const finDelProyecto = claveDia(finProyecto ?? null);
  const fechas = etapas.map((e) => claveDia(e.plannedDate ?? null));

  const salida: EtapaConPeriodo[] = [];
  let cursor = arranque;
  for (let i = 0; i < etapas.length; i++) {
    const planeada = fechas[i];
    let fin: string;
    let ajustada = false;
    if (planeada) {
      ajustada = planeada < cursor;
      fin = ajustada ? cursor : planeada;
    } else {
      // Cuántas etapas seguidas sin fecha hay desde aquí, y contra qué fecha se reparten.
      let sinFecha = 0;
      let ancla: string | null = null;
      let anclaEsEtapa = false;
      for (let j = i; j < etapas.length; j++) {
        if (fechas[j]) {
          ancla = fechas[j];
          anclaEsEtapa = true;
          break;
        }
        sinFecha++;
      }
      if (!ancla) ancla = finDelProyecto;
      if (ancla && ancla >= cursor) {
        // Si el ancla es otra etapa, esa necesita al menos su propio día.
        const disponibles = diasEntre(cursor, ancla) + 1 - (anclaEsEtapa ? 1 : 0);
        const cada = Math.max(1, Math.floor(disponibles / sinFecha));
        fin = sumarDias(cursor, cada - 1);
      } else {
        fin = sumarDias(cursor, DIAS_ETAPA_SIN_FECHA - 1);
      }
    }
    const periodo = { inicio: cursor, fin };
    salida.push({ id: etapas[i].id, ...periodo, dias: diasDelPeriodo(periodo), ajustada });
    cursor = sumarDias(fin, 1);
  }
  return salida;
}
