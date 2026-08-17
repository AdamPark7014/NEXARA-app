/**
 * La jornada laboral, medida en la zona horaria de la empresa.
 *
 * El contenedor corre en UTC, y el código calculaba el día con
 * `setHours(0,0,0,0)` sobre hora local — que ahí **es** UTC. Con la empresa
 * operando en México eso parte jornadas normales en dos: una entrada a las
 * 16:07 y su salida a las 19:18 del mismo día caen en días UTC distintos,
 * porque la salida ya es 01:18 UTC del siguiente.
 *
 * En los datos de producción **10 de 15 registros** caían en un día distinto
 * según se midiera en UTC o en hora de México. El síntoma eran jornadas que
 * nunca cerraban y horas repartidas al día equivocado, y de ahí sale la nómina.
 *
 * El resto del sistema ya usaba `America/Mexico_City` para fechas en informes y
 * notificaciones; esto sólo hace que la asistencia diga lo mismo.
 */

/** Zona de la jornada. Configurable por si la empresa opera en otra. */
export const WORKDAY_TIMEZONE = process.env.WORKDAY_TZ?.trim() || 'America/Mexico_City';

type Partes = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const FORMATEADORES = new Map<string, Intl.DateTimeFormat>();

function formateador(tz: string): Intl.DateTimeFormat {
  let f = FORMATEADORES.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    FORMATEADORES.set(tz, f);
  }
  return f;
}

/** Componentes de fecha y hora de un instante, vistos desde la zona. */
function partesEn(instante: Date, tz = WORKDAY_TIMEZONE): Partes {
  const p = formateador(tz).formatToParts(instante);
  const val = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  // `hour: '2-digit'` con hour12:false devuelve 24 a medianoche en algunos ICU.
  const hora = val('hour') % 24;
  return {
    year: val('year'),
    month: val('month'),
    day: val('day'),
    hour: hora,
    minute: val('minute'),
    second: val('second'),
  };
}

/**
 * Desfase de la zona respecto a UTC en ese instante, en milisegundos.
 *
 * Se calcula leyendo la hora local y comparándola con el instante: así funciona
 * con cualquier zona sin tabla de desfases. México ya no cambia de horario,
 * pero el cálculo no lo da por hecho.
 */
function desfaseMs(instante: Date, tz = WORKDAY_TIMEZONE): number {
  const p = partesEn(instante, tz);
  const comoSiFueraUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Los milisegundos no los da el formateador; se conservan del instante.
  return comoSiFueraUtc - (instante.getTime() - instante.getMilliseconds());
}

/** Día de calendario de un instante en la zona, como `AAAA-MM-DD`. */
export function workDateKey(instante: Date, tz = WORKDAY_TIMEZONE): string {
  const p = partesEn(instante, tz);
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${dosDigitos(p.month)}-${dosDigitos(p.day)}`;
}

/**
 * Instante UTC en que empieza (00:00) el día laboral que contiene a `instante`.
 *
 * Dos pasadas: la primera aproxima con el desfase del instante dado, la segunda
 * lo recalcula ya en la medianoche estimada. Eso resuelve bien los días en que
 * la zona cambia de horario, donde el desfase de las 00:00 no es el mismo que
 * el de las 18:00.
 */
export function workDayStart(instante: Date, tz = WORKDAY_TIMEZONE): Date {
  const p = partesEn(instante, tz);
  const medianocheLocal = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  let t = medianocheLocal - desfaseMs(instante, tz);
  t = medianocheLocal - desfaseMs(new Date(t), tz);
  return new Date(t);
}

/** Último milisegundo del día laboral que contiene a `instante`. */
export function workDayEnd(instante: Date, tz = WORKDAY_TIMEZONE): Date {
  const inicioSiguiente = workDayStart(
    new Date(workDayStart(instante, tz).getTime() + 36 * 3_600_000),
    tz,
  );
  return new Date(inicioSiguiente.getTime() - 1);
}

/** Principio y fin del día laboral, para filtrar por rango. */
export function workDayBounds(instante: Date, tz = WORKDAY_TIMEZONE): { start: Date; end: Date } {
  return { start: workDayStart(instante, tz), end: workDayEnd(instante, tz) };
}

/**
 * Valor para una columna `@db.Date`.
 *
 * Postgres guarda ahí una fecha sin hora, y Prisma la deriva de los componentes
 * **UTC** del `Date` que recibe. Así que hay que entregar el instante cuya
 * fecha UTC coincide con el día laboral, no el inicio real de la jornada: ese
 * cae a las 06:00 UTC y, aunque el día coincide, dejarlo así invita a confundir
 * las dos cosas.
 */
export function workDateColumn(instante: Date, tz = WORKDAY_TIMEZONE): Date {
  const p = partesEn(instante, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0));
}

/**
 * Interpreta `AAAA-MM-DD` como un día laboral de la zona.
 *
 * Antes `new Date(y, m-1, d)` lo tomaba como medianoche local del servidor
 * —UTC—, así que pedir "el 5 de agosto" devolvía un rango corrido seis horas.
 */
export function parseWorkDate(valor: string, tz = WORKDAY_TIMEZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return new Date(valor);
  const [, y, mes, d] = m;
  // Se ancla a mediodía UTC para caer sin ambigüedad dentro del día buscado en
  // cualquier zona, y de ahí se resuelve el inicio real.
  const anclaje = new Date(Date.UTC(Number(y), Number(mes) - 1, Number(d), 12, 0, 0));
  return workDayStart(anclaje, tz);
}
