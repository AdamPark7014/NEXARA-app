/**
 * Control de nómina semanal (lunes → domingo).
 *
 * Adam lo pidió el 05-10-2026 a partir de sus dos Excel hechos a mano —«CONTROL DE ENTRADAS Y
 * SALIDAS» y «CONTROL DE NOMINA NEXARA»—, «perfeccionado y mejorando la forma en que se hace».
 * Hoy se teclea todo: el lugar de cada día, «00:00» en amarillo cuando alguien no checó, el
 * sueldo y el pago por hora en $0.00. Aquí el sistema lo arma solo con lo que ya sabe y la
 * persona de nómina solo revisa, ajusta lo excepcional y cierra.
 *
 * Archivo puro a propósito (sin Prisma ni Nest), como `sugerencia-nomina.ts` y
 * `kpis-equipo.ts`: los números de una nómina tienen que poder probarse sin base de datos.
 * No se inventa ninguna fórmula: el pago por hora es `divisorDeHorario` (sugerencia de
 * nómina), el sueldo devengado es el mismo «semanal ÷ 7 × días», el extra se paga ×2 como en
 * `prenomina-amount.ts`, y las horas netas llegan de los KPI.
 */
import { WORKDAY_TIMEZONE, workDateKey } from '../common/time/workday.js';
import { diaDeLaSemana, diasDelRango, horaValida, pct, sumaDias } from '../me/kpis-equipo.js';
import { horas } from './pre-nomina.js';
import { OT_MULTIPLIER, roundMoney } from './prenomina-amount.js';
import { divisorDeHorario, ventanaDeCalculo, type Divisor } from './sugerencia-nomina.js';

// ─────────────────────────────────────────────────────────────────────────────
// Semana
// ─────────────────────────────────────────────────────────────────────────────

/** Nombres de día tal como los escribe su Excel (0 = domingo). */
export const NOMBRES_DIA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'] as const;

export type DiaDeSemana = { fecha: string; nombre: string; numero: string };

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿`AAAA-MM-DD` es una fecha real? (`2026-02-30` no lo es). */
export function fechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = FECHA_RE.exec(valor.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === valor.trim();
}

/** El lunes de la semana que contiene `fecha`. */
export function lunesDe(fecha: string): string {
  const dow = diaDeLaSemana(fecha);
  return sumaDias(fecha, dow === 0 ? -6 : 1 - dow);
}

/** Domingo de la semana que empieza en `lunes`. */
export function domingoDe(lunes: string): string {
  return sumaDias(lunes, 6);
}

/** Los siete días, con el nombre y el número como encabezan su Excel («LUNES» / «28»). */
export function diasDeLaSemana(lunes: string): DiaDeSemana[] {
  return diasDelRango(lunes, domingoDe(lunes)).map((fecha) => ({
    fecha,
    nombre: NOMBRES_DIA[diaDeLaSemana(fecha)],
    numero: fecha.slice(8, 10),
  }));
}

/** `2026-09-28` → «28/09». */
export function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** Concepto del pago que genera el cierre: «Nómina semana 28/09–04/10». */
export function conceptoPagoSemana(lunes: string): string {
  return `Nómina semana ${ddmm(lunes)}–${ddmm(domingoDe(lunes))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Horas en bruto (las de su Excel)
// ─────────────────────────────────────────────────────────────────────────────

const RELOJ = new Map<string, Intl.DateTimeFormat>();

/** Instante → «HH:MM» en hora de México. */
export function horaLocal(valor: string | Date | null | undefined, tz: string = WORKDAY_TIMEZONE): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  let f = RELOJ.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    RELOJ.set(tz, f);
  }
  const partes = f.formatToParts(d);
  const hh = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = partes.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

/** Minutos de la entrada a la salida, con la comida dentro. Sin una de las dos: 0. */
export function minutosBrutos(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined,
): number {
  if (!entrada || !salida) return 0;
  const e = (entrada instanceof Date ? entrada : new Date(entrada)).getTime();
  const s = (salida instanceof Date ? salida : new Date(salida)).getTime();
  if (!Number.isFinite(e) || !Number.isFinite(s) || s <= e) return 0;
  // Minuto contra minuto, como se resta a mano «17:58 − 10:00»: los segundos no cuentan, así
  // la celda HORAS del Excel (fórmula sobre las horas HH:MM) da exactamente lo mismo.
  return Math.max(0, Math.floor(s / 60_000) - Math.floor(e / 60_000));
}

/**
 * HORAS de su Excel: salida − entrada en bruto, en decimal con dos cifras
 * (10:00 → 18:00 = 8.00; 10:00 → 17:58 = 7.97). La comida va dentro, como en su formato, y
 * contra la duración de su horario se decide si cumplió (sueldo completo o proporcional).
 */
export function horasBrutas(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined,
): number {
  return horas(minutosBrutos(entrada, salida));
}

// ─────────────────────────────────────────────────────────────────────────────
// Lugar del día
// ─────────────────────────────────────────────────────────────────────────────

export const LUGARES = [
  'Oficina',
  'Foráneo',
  'Descanso',
  'Falta',
  'Falta justificada',
  'Guardia',
  'Vacaciones',
  'Permiso',
] as const;

export type Lugar = (typeof LUGARES)[number];

/** Minúsculas, sin acentos ni signos, espacios simples. */
export function normalizaTexto(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lo que escribió alguien («foraneo», «FALTA JUSTIFICADA») → el lugar canónico, o null. */
export function lugarValido(valor: unknown): Lugar | null {
  if (typeof valor !== 'string') return null;
  const clave = normalizaTexto(valor);
  return LUGARES.find((l) => normalizaTexto(l) === clave) ?? null;
}

/** Días que no se exigen ni se descuentan: el sueldo no espera horas de ellos. */
const LUGARES_SIN_HORAS_ESPERADAS: ReadonlySet<Lugar | null> = new Set<Lugar | null>([
  'Falta',
  'Falta justificada',
  'Vacaciones',
  'Permiso',
  'Descanso',
]);

/** Un día sin checada con alguno de estos lugares no se pinta de amarillo: está explicado. */
const LUGARES_QUE_NO_SON_FALTA: ReadonlySet<Lugar | null> = new Set<Lugar | null>([
  'Falta justificada',
  'Vacaciones',
  'Permiso',
  'Descanso',
  'Guardia',
]);

export type ChecadaLugar = {
  tipo: string;
  /** `Attendance.sitioNombre`: el sitio permitido más cercano al checar. */
  sitioNombre: string | null;
  /** `Attendance.fueraDeSitio`: no cayó en ningún sitio permitido. */
  fueraDeSitio: boolean;
};

export type EntradaLugar = {
  /** Día laborable según su horario (L–V en la plantilla de oficina). */
  laborable: boolean;
  /** El día ya terminó (antes de hoy en México). */
  pasado: boolean;
  /** Antes de su ingreso no se le esperaba. */
  antesDeIngreso?: boolean;
  checadas: ChecadaLugar[];
  /** Nombre del sitio de la oficina (`sitioOficina().nombre`). */
  oficina: string;
  guardia?: boolean;
  justificada?: boolean;
  /** Permiso aprobado (`LeaveRequest`) que cubre el día. */
  permiso?: 'Vacaciones' | 'Permiso' | null;
  /** Actividad del día en una ciudad fuera de Puebla y su zona metropolitana. */
  actividadForanea?: boolean;
  /** Viático de hospedaje que cubre el día. */
  hospedaje?: boolean;
};

export type LugarAutomatico = { lugar: Lugar | null; motivo: string };

/**
 * Dónde trabajó ese día, sin que nadie lo teclee.
 *
 * 1. Guardia programada → «Guardia».
 * 2. Con checada: en la geocerca de la oficina → «Oficina»; en el sitio de una actividad o
 *    sucursal, o fuera de todo sitio → «Foráneo»; sin ubicación, manda la actividad del día o
 *    el hospedaje (→ «Foráneo») y si no hay nada, «Oficina».
 * 3. Sin checada: sábado/domingo (o día no laborable de su horario) → «Descanso»; vacaciones o
 *    permiso aprobado → «Vacaciones»/«Permiso»; falta justificada → «Falta justificada»; con
 *    actividad foránea u hospedaje → «Foráneo» (sin checada sigue en amarillo, pero no se
 *    sugiere descontarlo); si no, «Falta». Hoy y los días por venir quedan vacíos.
 */
export function lugarAutomatico(e: EntradaLugar): LugarAutomatico {
  if (e.guardia) return { lugar: 'Guardia', motivo: 'Guardia programada' };

  const oficina = normalizaTexto(e.oficina || 'Oficina');
  if (e.checadas.length) {
    const enOficina = e.checadas.some((c) => !c.fueraDeSitio && normalizaTexto(c.sitioNombre) === oficina);
    if (enOficina) return { lugar: 'Oficina', motivo: 'Checó en la geocerca de la oficina' };
    const fuera = e.checadas.find((c) => c.fueraDeSitio);
    if (fuera) {
      return { lugar: 'Foráneo', motivo: 'Checó fuera de los sitios permitidos' };
    }
    const enSitio = e.checadas.find((c) => c.sitioNombre && normalizaTexto(c.sitioNombre) !== oficina);
    if (enSitio) return { lugar: 'Foráneo', motivo: `Checó en el sitio de ${enSitio.sitioNombre}` };
    if (e.actividadForanea) return { lugar: 'Foráneo', motivo: 'Actividad del día fuera de Puebla' };
    if (e.hospedaje) return { lugar: 'Foráneo', motivo: 'Viático de hospedaje ese día' };
    return { lugar: 'Oficina', motivo: 'Checada sin ubicación: se supone oficina' };
  }

  if (!e.laborable) return { lugar: 'Descanso', motivo: 'Día de descanso sin checada ni guardia' };
  if (e.permiso) return { lugar: e.permiso, motivo: `${e.permiso} aprobado` };
  if (e.justificada) return { lugar: 'Falta justificada', motivo: 'Falta justificada por dirección' };
  if (e.antesDeIngreso) return { lugar: null, motivo: 'Antes de su ingreso' };
  if (!e.pasado) return { lugar: null, motivo: 'El día no ha terminado' };
  if (e.actividadForanea) return { lugar: 'Foráneo', motivo: 'Sin checada, con actividad fuera de Puebla' };
  if (e.hospedaje) return { lugar: 'Foráneo', motivo: 'Sin checada, con viático de hospedaje' };
  return { lugar: 'Falta', motivo: 'Día laborable sin checada' };
}

/**
 * Amarillo de su Excel: día laborable ya pasado, sin checada y sin nada que lo explique
 * (vacaciones, permiso, justificación, descanso o guardia).
 */
export function esFalta(e: {
  laborable: boolean;
  pasado: boolean;
  antesDeIngreso?: boolean;
  conChecada: boolean;
  lugar: Lugar | null;
}): boolean {
  return e.laborable && e.pasado && !e.antesDeIngreso && !e.conChecada && !LUGARES_QUE_NO_SON_FALTA.has(e.lugar);
}

// ─────────────────────────────────────────────────────────────────────────────
// Foráneo: ciudad fuera de Puebla y su zona metropolitana
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Municipios de la zona metropolitana de Puebla (INEGI/CONAPO, lado poblano) y los nombres
 * con que se suelen capturar. Una actividad en cualquiera de ellos no es foránea.
 */
export const ZONA_METROPOLITANA_PUEBLA: readonly string[] = [
  'puebla',
  'puebla de zaragoza',
  'heroica puebla de zaragoza',
  'h puebla de zaragoza',
  'ciudad de puebla',
  'cholula',
  'san andres cholula',
  'san pedro cholula',
  'cholula de rivadavia',
  'santa isabel cholula',
  'cuautlancingo',
  'amozoc',
  'amozoc de mota',
  'coronango',
  'ocoyucan',
  'santa clara ocoyucan',
  'juan c bonilla',
  'san miguel xoxtla',
  'tlaltenango',
  'huejotzingo',
  'domingo arenas',
  'calpan',
  'chiautzingo',
  'san felipe teotlalcingo',
  'san martin texmelucan',
  'san salvador el verde',
  'acajete',
  'tepatlaxco de hidalgo',
  'san gregorio atzompa',
  'angelopolis',
  'lomas de angelopolis',
].map(normalizaTexto);

const ESTADOS_PUEBLA = new Set(['puebla', 'pue']);

/**
 * ¿La ciudad de la actividad queda fuera de Puebla y su zona metropolitana?
 *
 * Con ciudad: «Puebla, Pue.» se lee hasta la coma; foránea si no es de la zona. Sin ciudad
 * pero con estado: foránea si el estado no es Puebla. Sin ninguno no se puede afirmar nada.
 */
export function esCiudadForanea(lugar: { ciudad?: string | null; estado?: string | null }): boolean {
  const ciudad = normalizaTexto(String(lugar.ciudad ?? '').split(',')[0]);
  if (ciudad) return !ZONA_METROPOLITANA_PUEBLA.includes(ciudad);
  const estado = normalizaTexto(lugar.estado);
  if (estado) return !ESTADOS_PUEBLA.has(estado);
  return false;
}

export type ActividadNomina = {
  id: number;
  titulo?: string | null;
  cliente?: string | null;
  sucursal?: string | null;
  ciudad?: string | null;
  estado?: string | null;
};

/** El nombre de la obra o cliente para la nota «Toda la semana asignado a …». */
export function destinoDeActividad(a: ActividadNomina): string | null {
  const cliente = a.cliente?.trim() || null;
  const sucursal = a.sucursal?.trim() || null;
  if (cliente && sucursal) {
    return normalizaTexto(sucursal).includes(normalizaTexto(cliente)) ? sucursal : `${cliente} · ${sucursal}`;
  }
  return cliente ?? sucursal ?? (a.titulo?.trim() || null);
}

/**
 * Nota automática de la fila: «* Toda la semana asignado a Hotel Casa Azul».
 *
 * Sale cuando cada día laborable ya transcurrido (sin contar vacaciones, permisos,
 * justificaciones ni descansos) fue «Foráneo» y todos comparten la misma obra o cliente.
 * Con menos de dos días no es «toda la semana».
 */
export function notaSemanaAsignada(
  dias: Array<{ lugar: Lugar | null; laborable: boolean; evaluable: boolean; destinos: string[] }>,
): string | null {
  // Una falta sí cuenta (y rompe el «toda la semana»); lo que está explicado, no.
  const considerados = dias.filter(
    (d) =>
      d.laborable && d.evaluable && d.lugar != null && (d.lugar === 'Falta' || !LUGARES_SIN_HORAS_ESPERADAS.has(d.lugar)),
  );
  if (considerados.length < 2) return null;
  if (!considerados.every((d) => d.lugar === 'Foráneo')) return null;
  const visibles = new Map<string, string>();
  let comunes: string[] | null = null;
  for (const d of considerados) {
    const claves = new Set<string>();
    for (const destino of d.destinos) {
      const clave = normalizaTexto(destino);
      if (!clave) continue;
      claves.add(clave);
      if (!visibles.has(clave)) visibles.set(clave, destino.trim());
    }
    const previas: string[] = comunes ?? [...claves];
    comunes = previas.filter((c) => claves.has(c));
    if (!comunes.length) return null;
  }
  const elegido = [...(comunes ?? [])].sort()[0];
  return elegido ? `* Toda la semana asignado a ${visibles.get(elegido)}` : null;
}

/** Fechas que hacen «del día» una actividad (las mismas que usa la geocerca al checar). */
export type FechasActividad = {
  /** `fechaAsignacion`, `fechaInicio`, `fechaMaxima`, `fechaEntregaEsperada`. */
  fechas: Array<Date | string | null | undefined>;
  /** Periodo de varios días (`AAAA-MM-DD`, ambos incluidos). */
  periodoInicio?: string | null;
  periodoFin?: string | null;
};

/**
 * Días de la semana en que la actividad es «del día» para quien la tiene asignada: misma regla
 * que `sitiosPermitidos` de asistencia (asignada, iniciada, con fecha máxima o de entrega ese
 * día, o con un periodo que lo cubre).
 */
export function diasDeActividad(a: FechasActividad, dias: string[], tz: string = WORKDAY_TIMEZONE): string[] {
  const claves = new Set<string>();
  for (const f of a.fechas) {
    if (!f) continue;
    const d = f instanceof Date ? f : new Date(f);
    if (!Number.isNaN(d.getTime())) claves.add(workDateKey(d, tz));
  }
  const ini = a.periodoInicio && fechaValida(a.periodoInicio) ? a.periodoInicio : null;
  const fin = a.periodoFin && fechaValida(a.periodoFin) ? a.periodoFin : ini;
  return dias.filter((dia) => claves.has(dia) || (ini != null && fin != null && dia >= ini && dia <= fin));
}

/**
 * Días que cubre un viático de hospedaje: el periodo de su actividad (o de las actividades entre
 * las que se repartió); sin periodo, solo el día en que se solicitó.
 */
export function diasDeHospedaje(
  v: { fechaSolicitud: Date | string; periodos: Array<{ inicio: string | null; fin: string | null }> },
  dias: string[],
  tz: string = WORKDAY_TIMEZONE,
): string[] {
  const periodos = v.periodos.filter((p) => p.inicio && fechaValida(p.inicio));
  if (periodos.length) {
    return dias.filter((dia) => periodos.some((p) => dia >= p.inicio! && dia <= (p.fin && fechaValida(p.fin) ? p.fin : p.inicio!)));
  }
  const d = v.fechaSolicitud instanceof Date ? v.fechaSolicitud : new Date(v.fechaSolicitud);
  if (Number.isNaN(d.getTime())) return [];
  const clave = workDateKey(d, tz);
  return dias.filter((dia) => dia === clave);
}

// ─────────────────────────────────────────────────────────────────────────────
// Área
// ─────────────────────────────────────────────────────────────────────────────

export type Area = 'Operación' | 'Administrativo';

const ROLES_OPERACION = new Set([
  'arquitecto',
  'dir_operaciones',
  'coord_operaciones',
  'ing_campo',
  'ing_soporte',
  'enc_soporte',
]);
const DEPARTAMENTO_OPERACION = /operac|campo|soporte|obra|instala|tecnic|servicio|noc\b/;

/** ÁREA/ACTIVIDAD de su Excel: por rol (operación, campo, soporte) y, si no, por departamento. */
export function areaDe(p: { roleKey?: string | null; departamento?: string | null }): Area {
  if (p.roleKey && ROLES_OPERACION.has(p.roleKey)) return 'Operación';
  if (DEPARTAMENTO_OPERACION.test(normalizaTexto(p.departamento))) return 'Operación';
  return 'Administrativo';
}

// ─────────────────────────────────────────────────────────────────────────────
// Dinero
// ─────────────────────────────────────────────────────────────────────────────

export type HorarioNomina = {
  etiqueta?: string | null;
  /** Hora de entrada y de salida de su horario (`HH:MM`), si las tiene. */
  entrada?: string | null;
  salida?: string | null;
  jornadaOrdinariaMin: number | null;
  dias: readonly number[];
  personalizado: boolean;
};

const minutosDeReloj = (hhmm?: string | null): number | null => {
  const valida = horaValida(hhmm);
  if (!valida) return null;
  const [h, m] = valida.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Lo que dura un día de su horario de la entrada a la salida, con la comida dentro (las HORAS de
 * su Excel): oficina 10:00 → 18:00 = 480 min. Sin horas de entrada y salida, la jornada del
 * divisor (8 h).
 *
 * Por qué en bruto y no las 8 h netas de los KPI: quien cumple 10:00 → 18:00 y come una hora
 * lleva 7 h netas, y comparar 35 h netas contra 40 h le pagaría el 87.5 % de su sueldo por
 * cumplir su horario exacto. Bruto contra bruto, cumplir es cumplir.
 */
export function jornadaBrutaMin(horario: HorarioNomina, divisor: Divisor): number {
  const e = minutosDeReloj(horario.entrada);
  const s = minutosDeReloj(horario.salida);
  if (e != null && s != null && s > e) return s - e;
  return divisor.jornadaMin;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const dinero = (n: number) => MXN.format(n);

/** Sueldo semanal válido (> 0) o null. */
export function sueldoValido(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type PagoPorHora = {
  /** Sin redondear: con esto se calculan los extras. */
  pagoPorHora: number | null;
  divisorHoras: number;
  divisor: Divisor;
  formula: string;
};

/**
 * Pago por hora = sueldo semanal ÷ horas semanales de su horario. Es `divisorDeHorario` de la
 * sugerencia de nómina: plantilla de oficina 8 h × 5 días = 40 h; sin horario fijo, 48 h.
 */
export function pagoPorHora(sueldoSemanal: number | null, horario: HorarioNomina): PagoPorHora {
  const divisor = divisorDeHorario(horario);
  const sueldo = sueldoValido(sueldoSemanal);
  if (sueldo == null) {
    return {
      pagoPorHora: null,
      divisorHoras: divisor.horasSemanales,
      divisor,
      formula: `Sin sueldo semanal capturado: no hay pago por hora (se dividiría entre ${divisor.horasSemanales} h).`,
    };
  }
  const ph = sueldo / divisor.horasSemanales;
  return {
    pagoPorHora: ph,
    divisorHoras: divisor.horasSemanales,
    divisor,
    formula: `${dinero(sueldo)} ÷ ${divisor.horasSemanales} h (${divisor.etiqueta}) = ${dinero(roundMoney(ph))} por hora`,
  };
}

/** Sueldo de un día: semanal ÷ 7, el séptimo día incluido (como la sugerencia de nómina). */
export function sueldoDiario(sueldoSemanal: number | null): number | null {
  const s = sueldoValido(sueldoSemanal);
  return s == null ? null : s / 7;
}

/** `minutos`: de la entrada a la salida (en bruto), las mismas de la columna HORAS. */
export type DiaParaSueldo = { fecha: string; lugar: Lugar | null; minutos: number };

export type SueldoPeriodo = {
  sueldoPeriodo: number | null;
  /** Sueldo ÷ 7 × días transcurridos (todo el sueldo en una semana ya cerrada). */
  devengado: number | null;
  minutosEsperados: number;
  minutosLaborados: number;
  cumplimientoPct: number | null;
  explicacion: string;
};

/**
 * Sueldo del periodo, como la sugerencia de nómina vigente: el sueldo devengado (semanal ÷ 7
 * × días transcurridos) completo si cumplió su jornada, o la parte proporcional a lo que
 * trabajó (factor = horas trabajadas ÷ horas esperadas, sin pasar de 1).
 *
 * Las horas se comparan en bruto: las HORAS de su Excel contra la duración de su horario
 * (`jornadaBrutaMin`), para que cumplir el horario sea cumplir.
 *
 * La diferencia con la sugerencia: aquí las faltas injustificadas NO se esperan (no bajan el
 * proporcional) porque se descuentan aparte, un renglón por día que alguien acepta. Si no,
 * la misma falta se cobraría dos veces. Vacaciones, permisos, justificaciones y descansos
 * tampoco se esperan.
 */
export function sueldoDelPeriodo(e: {
  sueldoSemanal: number | null;
  divisor: Divisor;
  /** Duración de un día esperado; por omisión la del divisor. */
  jornadaMin?: number;
  semana: { desde: string; hasta: string };
  hoy: string;
  fechaIngreso?: string | null;
  dias: DiaParaSueldo[];
}): SueldoPeriodo {
  const sueldo = sueldoValido(e.sueldoSemanal);
  const ventana = ventanaDeCalculo(e.semana, e.hoy, e.fechaIngreso);
  const enVentana = (f: string) => ventana.dias > 0 && f >= ventana.desde && f <= ventana.hasta;
  const porFecha = new Map(e.dias.map((d) => [d.fecha, d]));
  const laborados = e.dias.filter((d) => enVentana(d.fecha)).reduce((s, d) => s + Math.max(0, d.minutos || 0), 0);
  const faltas = e.dias.filter((d) => enVentana(d.fecha) && d.lugar === 'Falta').length;
  const esperadosDias =
    ventana.dias > 0
      ? diasDelRango(ventana.desde, ventana.hasta).filter(
          (f) => e.divisor.dias.includes(diaDeLaSemana(f)) && !LUGARES_SIN_HORAS_ESPERADAS.has(porFecha.get(f)?.lugar ?? null),
        ).length
      : 0;
  const jornada = e.jornadaMin && e.jornadaMin > 0 ? e.jornadaMin : e.divisor.jornadaMin;
  const esperados = esperadosDias * jornada;
  const cumplimientoPct = pct(laborados, esperados);
  const notaFaltas =
    faltas > 0
      ? ` ${faltas} falta(s) injustificada(s) no bajan este monto: se descuentan aparte (descuento sugerido).`
      : '';

  if (sueldo == null) {
    return {
      sueldoPeriodo: null,
      devengado: null,
      minutosEsperados: esperados,
      minutosLaborados: laborados,
      cumplimientoPct,
      explicacion: 'Sin sueldo semanal capturado en RH: captúralo para calcular el pago.',
    };
  }
  if (ventana.dias === 0) {
    return {
      sueldoPeriodo: 0,
      devengado: 0,
      minutosEsperados: 0,
      minutosLaborados: laborados,
      cumplimientoPct: null,
      explicacion: 'La semana apenas empieza: todavía no hay días completos que pagar.',
    };
  }

  const devengado = (sueldo / 7) * ventana.dias;
  const base = ventana.dias === 7 ? 'su sueldo semanal' : `${ventana.dias}/7 de su sueldo (devengado a la fecha)`;
  if (esperados <= 0) {
    return {
      sueldoPeriodo: roundMoney(devengado),
      devengado: roundMoney(devengado),
      minutosEsperados: 0,
      minutosLaborados: laborados,
      cumplimientoPct: null,
      explicacion: `Sin días que exigir horas: se toma ${base}.${notaFaltas}`,
    };
  }
  const factor = Math.min(1, laborados / esperados);
  const sueldoPeriodo = roundMoney(devengado * factor);
  const explicacion =
    factor >= 1
      ? `Cumplió su horario (${horas(laborados)} h de ${horas(esperados)} h): ${base}.${notaFaltas}`
      : `Trabajó ${horas(laborados)} h de ${horas(esperados)} h de su horario: ${base} × ${Math.round(factor * 1000) / 10} %.${notaFaltas}`;
  return {
    sueldoPeriodo,
    devengado: roundMoney(devengado),
    minutosEsperados: esperados,
    minutosLaborados: laborados,
    cumplimientoPct,
    explicacion,
  };
}

/** EXTRAS: minutos APROBADOS × pago por hora × 2 (`OT_MULTIPLIER` de la pre-nómina). */
export function montoExtras(minutosAprobados: number, pagoHora: number | null): number | null {
  if (pagoHora == null || !Number.isFinite(pagoHora)) return null;
  const min = Math.max(0, Number(minutosAprobados) || 0);
  return roundMoney((min / 60) * pagoHora * OT_MULTIPLIER);
}

export type DescuentoSugerido = { fecha: string; concepto: string; monto: number };

/** «Falta injustificada · LUNES 28/09». */
export function conceptoFalta(fecha: string): string {
  return `Falta injustificada · ${NOMBRES_DIA[diaDeLaSemana(fecha)]} ${ddmm(fecha)}`;
}

/**
 * Un descuento sugerido por cada día con lugar «Falta» (sin checada ni nada que lo explique):
 * su sueldo de un día. No se aplica solo; alguien lo acepta. Las faltas ya aceptadas no se
 * vuelven a sugerir.
 */
export function descuentosSugeridos(e: {
  sueldoSemanal: number | null;
  dias: Array<{ fecha: string; lugar: Lugar | null }>;
  yaAceptadas?: Iterable<string>;
}): DescuentoSugerido[] {
  const diario = sueldoDiario(e.sueldoSemanal);
  if (diario == null) return [];
  const aceptadas = new Set(e.yaAceptadas ?? []);
  return e.dias
    .filter((d) => d.lugar === 'Falta' && !aceptadas.has(d.fecha))
    .map((d) => ({ fecha: d.fecha, concepto: conceptoFalta(d.fecha), monto: roundMoney(diario) }));
}

/** SUBTOTAL = sueldo del periodo + viáticos + extras; TOTAL = SUBTOTAL − DESCUENTOS. */
export function totalesDeFila(e: {
  sueldoPeriodo: number | null;
  viaticos: number;
  extrasMonto: number | null;
  descuentosTotal: number;
}): { subtotal: number; total: number } {
  const subtotal = roundMoney((e.sueldoPeriodo ?? 0) + (e.viaticos || 0) + (e.extrasMonto ?? 0));
  return { subtotal, total: roundMoney(subtotal - (e.descuentosTotal || 0)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Día y fila del control
// ─────────────────────────────────────────────────────────────────────────────

export type AjusteManual = {
  lugar: Lugar;
  nota?: string | null;
  porId?: number | null;
  por?: string | null;
  at?: string | Date | null;
};

export type EntradaDia = EntradaLugar & {
  fecha: string;
  /** Primera entrada y última salida del día (ISO), las mismas que emparejan los KPI. */
  entrada: string | null;
  salida: string | null;
  /** Horas netas de comida que midieron los KPI. */
  minutosLaborados: number;
  /** Destinos (obra/cliente) de las actividades del día, para la nota de la fila. */
  destinos?: string[];
  manual?: AjusteManual | null;
};

export type DiaControl = {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  /** Salida − entrada en bruto, 2 decimales. */
  horas: number;
  /** Horas netas de comida (las de los KPI y la pre-nómina). Informativas. */
  horasNetas: number;
  lugar: Lugar | null;
  /** Lo que diría el sistema sin el ajuste manual. */
  lugarAuto: Lugar | null;
  lugarOrigen: 'auto' | 'manual';
  /** Por qué el sistema eligió `lugarAuto`. */
  motivoLugar: string;
  /** Amarillo: laborable, ya pasó, sin checada y sin nada que lo explique. */
  falta: boolean;
  laborable: boolean;
  nota: string | null;
  ajuste: { porId: number | null; por: string | null; at: string | null } | null;
};

export function diaControl(
  e: EntradaDia,
): DiaControl & { evaluable: boolean; destinos: string[]; minutosLaborados: number; minutosBrutos: number; sinSalida: boolean } {
  const auto = lugarAutomatico(e);
  const lugar = e.manual?.lugar ?? auto.lugar;
  const conChecada = e.checadas.length > 0 || Boolean(e.entrada);
  const entrada = horaLocal(e.entrada);
  const salida = horaLocal(e.salida);
  const notaAuto = e.entrada && !e.salida ? (e.pasado ? 'Sin salida registrada' : 'Jornada abierta') : null;
  const at = e.manual?.at ? (e.manual.at instanceof Date ? e.manual.at.toISOString() : String(e.manual.at)) : null;
  return {
    fecha: e.fecha,
    entrada,
    salida,
    horas: horasBrutas(e.entrada, e.salida),
    horasNetas: horas(Math.max(0, e.minutosLaborados || 0)),
    lugar,
    lugarAuto: auto.lugar,
    lugarOrigen: e.manual ? 'manual' : 'auto',
    motivoLugar: auto.motivo,
    falta: esFalta({ laborable: e.laborable, pasado: e.pasado, antesDeIngreso: e.antesDeIngreso, conChecada, lugar }),
    laborable: e.laborable,
    nota: e.manual?.nota?.trim() || notaAuto,
    ajuste: e.manual ? { porId: e.manual.porId ?? null, por: e.manual.por ?? null, at } : null,
    evaluable: e.pasado || conChecada,
    destinos: e.destinos ?? [],
    minutosLaborados: Math.max(0, e.minutosLaborados || 0),
    minutosBrutos: minutosBrutos(e.entrada, e.salida),
    sinSalida: Boolean(e.entrada && !e.salida && e.pasado),
  };
}

export type ViaticoNomina = {
  id: number;
  concepto: string;
  monto: number;
  estatus: string;
  categoria?: string | null;
  fecha?: string | null;
};

/** Un descuento guardado (manual o sugerido que alguien aceptó). */
export type DescuentoNomina = {
  id: number;
  concepto: string;
  monto: number;
  sugerido: boolean;
  fecha?: string | null;
};

/**
 * Un renglón de DESCUENTOS en la respuesta. Los guardados llevan `aceptado: true` y cuentan en
 * `descuentosTotal`; las faltas sugeridas que nadie ha aceptado van con `aceptado: false` y un
 * id de texto (`sugerido-AAAA-MM-DD`), se ven pero no restan.
 */
export type DescuentoFila = {
  id: number | string;
  concepto: string;
  monto: number;
  sugerido: boolean;
  aceptado: boolean;
  fecha: string | null;
};

export type EntradaFila = {
  userId: number;
  nombre: string;
  puesto?: string | null;
  numeroEmpleado?: string | null;
  area: Area;
  semana: { inicio: string; fin: string };
  hoy: string;
  fechaIngreso?: string | null;
  horario: HorarioNomina;
  sueldoSemanal: number | null;
  dias: EntradaDia[];
  viaticos: ViaticoNomina[];
  extrasMinutosAprobados: number;
  extrasMinutosPendientes: number;
  extrasDiasPendientes?: number;
  descuentos: DescuentoNomina[];
  /** null/undefined = nota automática; '' = sin nota a propósito. */
  notaManual?: string | null;
};

export type FilaControl = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  area: Area;
  horario: string;
  dias: DiaControl[];
  horasTotales: number;
  horasNetasTotales: number;
  faltas: number;
  faltasInjustificadas: number;
  sueldo: number | null;
  pagoPorHora: number | null;
  divisorHoras: number;
  divisor: string;
  formulaPagoPorHora: string;
  viaticos: number | null;
  viaticosDetalle: ViaticoNomina[];
  extrasMonto: number | null;
  extrasMinutosAprobados: number;
  extrasMinutosPendientes: number;
  extrasDiasPendientes: number;
  sueldoPeriodo: number | null;
  sueldoPeriodoExplicacion: string;
  cumplimientoPct: number | null;
  /** Guardados (`aceptado: true`, cuentan) y sugeridos por aceptar (`aceptado: false`, no cuentan). */
  descuentos: DescuentoFila[];
  /** Faltas injustificadas por aceptar: NO cuentan en `descuentosTotal` hasta que alguien las acepta. */
  descuentosSugeridos: DescuentoSugerido[];
  descuentosTotal: number | null;
  descuentosSugeridosTotal: number | null;
  subtotal: number | null;
  total: number | null;
  notaFila: string | null;
  notaFilaOrigen: 'auto' | 'manual';
  avisos: string[];
};

/** La fila completa de una persona: horas, lugares, dinero y la nota. */
export function filaControl(e: EntradaFila): FilaControl {
  const dias = e.dias.map(diaControl);
  const sueldo = sueldoValido(e.sueldoSemanal);
  const ph = pagoPorHora(sueldo, e.horario);
  const periodo = sueldoDelPeriodo({
    sueldoSemanal: sueldo,
    divisor: ph.divisor,
    jornadaMin: jornadaBrutaMin(e.horario, ph.divisor),
    semana: { desde: e.semana.inicio, hasta: e.semana.fin },
    hoy: e.hoy,
    fechaIngreso: e.fechaIngreso,
    dias: dias.map((d) => ({ fecha: d.fecha, lugar: d.lugar, minutos: d.minutosBrutos })),
  });
  const viaticos = roundMoney(e.viaticos.reduce((s, v) => s + (Number(v.monto) || 0), 0));
  const extrasMonto = montoExtras(e.extrasMinutosAprobados, ph.pagoPorHora);
  const guardados: DescuentoFila[] = e.descuentos.map((d) => ({
    id: d.id,
    concepto: d.concepto,
    monto: roundMoney(Number(d.monto) || 0),
    sugerido: Boolean(d.sugerido),
    aceptado: true,
    fecha: d.fecha ?? null,
  }));
  const descuentosTotal = roundMoney(guardados.reduce((s, d) => s + d.monto, 0));
  const aceptadas = guardados.filter((d) => d.sugerido && d.fecha).map((d) => String(d.fecha));
  const sugeridos = descuentosSugeridos({ sueldoSemanal: sueldo, dias, yaAceptadas: aceptadas });
  const descuentos: DescuentoFila[] = [
    ...guardados,
    ...sugeridos.map((s) => ({
      id: `sugerido-${s.fecha}`,
      concepto: s.concepto,
      monto: s.monto,
      sugerido: true,
      aceptado: false,
      fecha: s.fecha,
    })),
  ];
  const { subtotal, total } = totalesDeFila({
    sueldoPeriodo: periodo.sueldoPeriodo,
    viaticos,
    extrasMonto,
    descuentosTotal,
  });

  const manual = e.notaManual != null;
  const notaFila = manual ? e.notaManual!.trim() || null : notaSemanaAsignada(dias);

  const faltas = dias.filter((d) => d.falta).length;
  const injustificadas = dias.filter((d) => d.lugar === 'Falta').length;
  const avisos: string[] = [];
  if (sueldo == null) avisos.push('Sin sueldo semanal capturado: el sueldo y los extras quedan en $0.');
  if (e.extrasMinutosPendientes > 0) {
    avisos.push(`${horas(e.extrasMinutosPendientes)} h de tiempo extra sin aprobar: no se pagan hasta que un jefe las apruebe.`);
  }
  if (sugeridos.length) {
    avisos.push(`${sugeridos.length} falta(s) injustificada(s) con descuento sugerido por aceptar.`);
  } else if (injustificadas > 0 && sueldo == null) {
    avisos.push(`${injustificadas} falta(s) injustificada(s): sin sueldo no se puede sugerir el descuento.`);
  }
  const sinSalida = dias.filter((d) => d.sinSalida).length;
  if (sinSalida) avisos.push(`${sinSalida} día(s) sin salida registrada: sus horas quedan en 0.00.`);

  return {
    userId: e.userId,
    nombre: e.nombre,
    puesto: e.puesto ?? null,
    numeroEmpleado: e.numeroEmpleado ?? null,
    area: e.area,
    horario: e.horario.etiqueta ?? '',
    dias: dias.map(({ evaluable: _e, destinos: _d, minutosLaborados: _m, minutosBrutos: _b, sinSalida: _s, ...d }) => d),
    horasTotales: roundMoney(dias.reduce((s, d) => s + d.horas, 0)),
    horasNetasTotales: horas(dias.reduce((s, d) => s + d.minutosLaborados, 0)),
    faltas,
    faltasInjustificadas: injustificadas,
    sueldo,
    pagoPorHora: ph.pagoPorHora != null ? roundMoney(ph.pagoPorHora) : null,
    divisorHoras: ph.divisorHoras,
    divisor: ph.divisor.etiqueta,
    formulaPagoPorHora: ph.formula,
    viaticos,
    viaticosDetalle: e.viaticos.map((v) => ({ ...v, monto: roundMoney(Number(v.monto) || 0) })),
    extrasMonto,
    extrasMinutosAprobados: Math.max(0, e.extrasMinutosAprobados || 0),
    extrasMinutosPendientes: Math.max(0, e.extrasMinutosPendientes || 0),
    extrasDiasPendientes: Math.max(0, e.extrasDiasPendientes || 0),
    sueldoPeriodo: periodo.sueldoPeriodo,
    sueldoPeriodoExplicacion: periodo.explicacion,
    cumplimientoPct: periodo.cumplimientoPct,
    descuentos,
    descuentosSugeridos: sugeridos,
    descuentosTotal,
    descuentosSugeridosTotal: roundMoney(sugeridos.reduce((s, d) => s + d.monto, 0)),
    subtotal,
    total,
    notaFila,
    notaFilaOrigen: manual ? 'manual' : 'auto',
    avisos,
  };
}

/** Orden de su Excel: alfabético por nombre. */
export function ordenaFilas<T extends { nombre: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

export type TotalesControl = {
  personas: number;
  horasTotales: number;
  faltas: number;
  faltasInjustificadas: number;
  sinSueldo: number;
  conAvisos: number;
  extrasMinutosAprobados: number;
  extrasMinutosPendientes: number;
  sueldo: number | null;
  sueldoPeriodo: number | null;
  viaticos: number | null;
  extrasMonto: number | null;
  descuentosTotal: number | null;
  descuentosSugeridosTotal: number | null;
  subtotal: number | null;
  total: number | null;
};

/** El pie de la tabla. Los montos nulos (sin sueldo) no suman. */
export function totalesControl(filas: FilaControl[]): TotalesControl {
  const s = (f: (x: FilaControl) => number | null) => roundMoney(filas.reduce((acc, x) => acc + (f(x) ?? 0), 0));
  return {
    personas: filas.length,
    horasTotales: s((f) => f.horasTotales),
    faltas: filas.reduce((a, f) => a + f.faltas, 0),
    faltasInjustificadas: filas.reduce((a, f) => a + f.faltasInjustificadas, 0),
    sinSueldo: filas.filter((f) => f.sueldo == null).length,
    conAvisos: filas.filter((f) => f.avisos.length > 0).length,
    extrasMinutosAprobados: filas.reduce((a, f) => a + f.extrasMinutosAprobados, 0),
    extrasMinutosPendientes: filas.reduce((a, f) => a + f.extrasMinutosPendientes, 0),
    sueldo: s((f) => f.sueldo),
    sueldoPeriodo: s((f) => f.sueldoPeriodo),
    viaticos: s((f) => f.viaticos),
    extrasMonto: s((f) => f.extrasMonto),
    descuentosTotal: s((f) => f.descuentosTotal),
    descuentosSugeridosTotal: s((f) => f.descuentosSugeridosTotal),
    subtotal: s((f) => f.subtotal),
    total: s((f) => f.total),
  };
}

/**
 * Quien no ve montos (RH, o la empresa reservó «Pagos a personal» a otros roles) recibe las
 * horas y los lugares, y todo lo que sea dinero en null (las listas, vacías).
 */
export function ocultarMontos(f: FilaControl): FilaControl {
  return {
    ...f,
    sueldo: null,
    pagoPorHora: null,
    formulaPagoPorHora: 'Montos reservados.',
    viaticos: null,
    viaticosDetalle: [],
    extrasMonto: null,
    sueldoPeriodo: null,
    sueldoPeriodoExplicacion: 'Montos reservados.',
    descuentos: [],
    descuentosSugeridos: [],
    descuentosTotal: null,
    descuentosSugeridosTotal: null,
    subtotal: null,
    total: null,
    avisos: f.avisos.filter((a) => !/sueldo|descuento/i.test(a)),
  };
}

export function ocultarMontosTotales(t: TotalesControl): TotalesControl {
  return {
    ...t,
    sinSueldo: 0,
    sueldo: null,
    sueldoPeriodo: null,
    viaticos: null,
    extrasMonto: null,
    descuentosTotal: null,
    descuentosSugeridosTotal: null,
    subtotal: null,
    total: null,
  };
}

/** Las reglas en palabras, para la vista y para la hoja «Cómo se calcula». */
export function formulaControl(): {
  lugar: string;
  horas: string;
  pagoPorHora: string;
  sueldoPeriodo: string;
  viaticos: string;
  extras: string;
  descuentos: string;
  subtotal: string;
  total: string;
  cierre: string;
} {
  return {
    lugar:
      'Lugar del día: checada dentro de la geocerca de la oficina = Oficina; en el sitio de una actividad o sucursal, fuera de todo sitio, con actividad del día fuera de Puebla y su zona metropolitana o con viático de hospedaje = Foráneo; guardia programada = Guardia; sábado/domingo sin checada = Descanso; vacaciones o permiso aprobado = Vacaciones/Permiso; falta justificada por dirección = Falta justificada; día laborable sin checada = Falta. Cualquier celda se corrige a mano y queda quién y cuándo.',
    horas:
      'HORAS = salida − entrada en bruto (con la comida dentro), en decimal con 2 cifras: 10:00 → 18:00 = 8.00. Sin checada en día laborable: 00:00 · 00:00 · 0.00 en amarillo. Las horas netas (sin comida) son las de los indicadores y se muestran aparte.',
    pagoPorHora:
      'PAGO X HORA = sueldo semanal ÷ horas semanales de su horario (jornada × días laborables; oficina L–V 8 h = 40 h). Sin horario fijo: ÷ 48 h (jornada diurna legal).',
    sueldoPeriodo:
      'SUELDO del periodo = sueldo semanal ÷ 7 × días transcurridos (la semana completa = su sueldo), completo si cumplió su horario o proporcional: horas trabajadas (las de la columna HORAS) ÷ horas de su horario en los días que se le esperaba (oficina 10:00 → 18:00 = 8 h por día). Faltas injustificadas, vacaciones, permisos y descansos no se esperan; las faltas se descuentan aparte.',
    viaticos: 'VIÁTICOS = suma de sus viáticos Aprobados o Pagados con fecha de solicitud en la semana (monto aprobado; si no hay, el solicitado).',
    extras:
      'EXTRAS = horas extra APROBADAS por un jefe × pago por hora × 2. Las pendientes se muestran aparte y no se pagan hasta aprobarlas.',
    descuentos:
      'DESCUENTOS = renglones capturados por nómina más los sugeridos que alguien aceptó. Cada falta injustificada sugiere descontar un día de sueldo (semanal ÷ 7); nunca se aplica solo.',
    subtotal: 'SUBTOTAL = sueldo del periodo + viáticos + extras.',
    total: 'TOTAL = SUBTOTAL − DESCUENTOS.',
    cierre:
      'Cerrar la semana congela las cifras y genera un pago en Borrador por persona en «Pagos a empleados» (sin duplicar si ya existe uno para ese periodo). Una semana cerrada no se edita: se reabre con motivo.',
  };
}

/** Desglose que va en la nota del pago en Borrador. */
export function notaDePago(f: FilaControl, lunes: string): string {
  const aceptados = f.descuentos.filter((d) => d.aceptado);
  const partes = [
    `${conceptoPagoSemana(lunes)} (control semanal).`,
    `Horas: ${f.horasTotales.toFixed(2)} en bruto, ${f.horasNetasTotales.toFixed(2)} netas.`,
    `Sueldo del periodo: ${dinero(f.sueldoPeriodo ?? 0)} (${f.sueldoPeriodoExplicacion})`,
    `Viáticos: ${dinero(f.viaticos ?? 0)}.`,
    `Extras: ${dinero(f.extrasMonto ?? 0)} (${horas(f.extrasMinutosAprobados)} h aprobadas × pago por hora × ${OT_MULTIPLIER}).`,
    `Descuentos: ${dinero(f.descuentosTotal ?? 0)}${aceptados.length ? ` (${aceptados.map((d) => `${d.concepto} ${dinero(d.monto)}`).join('; ')})` : ''}.`,
    `Subtotal: ${dinero(f.subtotal ?? 0)} · Total: ${dinero(f.total ?? 0)}.`,
  ];
  if (f.faltas) partes.push(`Faltas: ${f.faltas}.`);
  if (f.notaFila) partes.push(f.notaFila);
  return partes.join('\n');
}

/** Un motivo de reapertura tiene que decir algo (mismo mínimo que las correcciones de hora). */
export const MOTIVO_MIN = 10;
