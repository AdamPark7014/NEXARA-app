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
 * Día de la empresa (`AAAA-MM-DD`) de una fecha capturada o de un instante.
 *
 * `new Date().toISOString().slice(0, 10)` da el día del servidor, que corre en UTC: de las 18:00
 * de México en adelante ya es «mañana», y con esa fecha se guardaban pólizas, facturas y órdenes.
 *  - Sin valor, o ilegible: hoy en la empresa.
 *  - Un día sin hora (`AAAA-MM-DD`, o medianoche UTC exacta, como llegan las columnas de solo
 *    día): ese día tal cual. Convertirlo lo mandaría al día anterior.
 *  - Un instante con hora: el día en que cae en la zona de la empresa.
 */
export function workDateKeyOf(
  valor?: Date | string | null,
  ahora: Date = new Date(),
  tz = WORKDAY_TIMEZONE,
): string {
  if (valor == null || valor === '') return workDateKey(ahora, tz);
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return valor.trim();
  const instante = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(instante.getTime())) return workDateKey(ahora, tz);
  if (instante.getTime() % 86_400_000 === 0) return instante.toISOString().slice(0, 10);
  return workDateKey(instante, tz);
}

/**
 * Año, mes (1 a 12) y día del calendario de la empresa en ese instante.
 *
 * `now.getFullYear()`, `getMonth()` y `getDate()` leen el reloj del servidor (UTC): de las 18:00 de
 * México en adelante ya es mañana, y la tarde del último día del mes ya es el mes siguiente.
 */
export function workDateParts(
  instante: Date,
  tz = WORKDAY_TIMEZONE,
): { year: number; month: number; day: number } {
  const p = partesEn(instante, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/** Suma días a un día `AAAA-MM-DD` por calendario, sin pasar por la hora de ningún reloj. */
export function addDaysToKey(dia: string, dias: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Las claves de los últimos `n` días de la empresa, del más viejo a hoy. Para las gráficas «últimos
 * 14 días»: armadas con el reloj del servidor terminaban en mañana a partir de las 18:00.
 */
export function ultimosDiasLaborales(ahora: Date, n: number, tz = WORKDAY_TIMEZONE): string[] {
  const hoy = workDateKey(ahora, tz);
  return Array.from({ length: n }, (_, i) => addDaysToKey(hoy, i - (n - 1)));
}

/** Hora (0–23) y día de la semana (0 = domingo) de un instante en la zona. */
export function workClock(instante: Date, tz = WORKDAY_TIMEZONE): { hour: number; weekday: number } {
  const p = partesEn(instante, tz);
  return { hour: p.hour, weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
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

/** Instante de un reloj civil (hora:minuto) dentro del día laboral de `instante`. */
export function workDayAtClock(
  instante: Date,
  hour: number,
  minute = 0,
  tz = WORKDAY_TIMEZONE,
): Date {
  return new Date(workDayStart(instante, tz).getTime() + (hour * 60 + minute) * 60_000);
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
 * Instante UTC en que empieza el mes en curso, en la zona de la empresa.
 *
 * `new Date(y, m, 1)` daba medianoche del servidor —UTC—, que en México es el
 * último día del mes anterior a las 18:00: los informes mensuales arrastraban
 * seis horas del mes previo.
 */
export function workMonthStart(instante: Date, tz = WORKDAY_TIMEZONE): Date {
  const p = partesEn(instante, tz);
  return workDayStart(new Date(Date.UTC(p.year, p.month - 1, 1, 12, 0, 0)), tz);
}

/** Un mes de la empresa: sus dos extremos como instantes y su año y número (1 a 12). */
export type MesLaboral = { year: number; month: number; start: Date; end: Date };

/**
 * El mes `month` (1 a 12) del año `year`, de su primer instante al último en la zona de la
 * empresa. Acepta meses fuera de rango y los acomoda: el 0 es diciembre del año anterior.
 */
export function workMonthOf(year: number, month: number, tz = WORKDAY_TIMEZONE): MesLaboral {
  const start = workDayStart(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)), tz);
  const siguiente = workDayStart(new Date(Date.UTC(year, month, 1, 12, 0, 0)), tz);
  const p = partesEn(new Date(start.getTime() + 12 * 3_600_000), tz);
  return { year: p.year, month: p.month, start, end: new Date(siguiente.getTime() - 1) };
}

/**
 * El mes de la empresa que contiene a `instante`.
 *
 * `new Date(y, m, 1)` y `now.getMonth()` leen el reloj del servidor (UTC): la tarde del último
 * día del mes ya contaban el mes siguiente, y lo cerrado esa tarde se sumaba al mes equivocado.
 */
export function workMonth(instante: Date, tz = WORKDAY_TIMEZONE): MesLaboral {
  const p = partesEn(instante, tz);
  return workMonthOf(p.year, p.month, tz);
}

/**
 * Filtro `{ gte, lte }` de un mes para una columna que guarda solo el día (`@db.Date`, o una fecha
 * capturada sin hora): esas viven a medianoche UTC, así que el mes es el calendario tal cual.
 */
export function calendarMonthColumnRange(year: number, month: number): { gte: Date; lte: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

/** Igual, para el año en curso. */
export function workYearStart(instante: Date, tz = WORKDAY_TIMEZONE): Date {
  const p = partesEn(instante, tz);
  return workDayStart(new Date(Date.UTC(p.year, 0, 1, 12, 0, 0)), tz);
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

/**
 * Último instante del día laboral `AAAA-MM-DD`, para cerrar un rango «del día X al día Y».
 *
 * Los reportes armaban el tope con `${dia}T23:59:59.999Z` (o sin la `Z`, que en el servidor es
 * lo mismo): el día terminaba a las 18:00 de México, así que lo registrado esa tarde quedaba
 * fuera del reporte de su día y aparecía en el del siguiente. Un valor que ya trae hora se
 * respeta tal cual.
 */
export function parseWorkDateEnd(valor: string, tz = WORKDAY_TIMEZONE): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return new Date(valor);
  return workDayEnd(parseWorkDate(valor, tz), tz);
}

/**
 * Filtro `{ gte, lte }` para una columna con hora (`DateTime`) a partir de un rango de días de
 * la empresa. Para una columna `@db.Date` no sirve: esas guardan el día a medianoche UTC.
 * Un extremo vacío o ilegible no se filtra; sin ningún extremo válido devuelve `undefined`, que
 * Prisma lee como «sin filtro» (antes una fecha ilegible llegaba a la consulta y tronaba).
 */
export function workDateRange(
  desde?: string | null,
  hasta?: string | null,
  tz = WORKDAY_TIMEZONE,
): { gte?: Date; lte?: Date } | undefined {
  const rango: { gte?: Date; lte?: Date } = {};
  const inicio = desde?.trim() ? parseWorkDate(desde, tz) : null;
  const fin = hasta?.trim() ? parseWorkDateEnd(hasta, tz) : null;
  if (inicio && !Number.isNaN(inicio.getTime())) rango.gte = inicio;
  if (fin && !Number.isNaN(fin.getTime())) rango.lte = fin;
  return rango.gte || rango.lte ? rango : undefined;
}
