/**
 * Días festivos y cómo se trabaja cada uno (Adam, 29-10-2026: «que Christian marque días
 * festivos y cuánto se labora ese día o si no se labora»).
 *
 * - Los de ley (LFT art. 74, sin la jornada electoral) salen solos cada año como «no se labora».
 * - Dirección puede cambiarlos (se labora con horario propio o la jornada completa, todo el equipo
 *   o solo algunas personas) y agregar días que da la empresa.
 * - En fin de semana ya es descanso: solo trabaja quien tiene guardia, con su guardia de siempre.
 * - Quien trabaja un festivo cobra salario doble además del sueldo del día (LFT art. 75).
 *
 * Lo usan la nómina, el desempeño, la checada y el recordatorio de entrada. Módulo puro.
 */
import { diaDeLaSemana } from '../guardias/guardias-reglas.js';

export const MODOS_FESTIVO = ['NO_SE_LABORA', 'HORARIO', 'COMPLETA'] as const;
export type ModoFestivo = (typeof MODOS_FESTIVO)[number];
export type OrigenFestivo = 'LEY' | 'EMPRESA';

export const NOMBRE_FESTIVO_MAX = 120;
export const NOTA_FESTIVO_MAX = 300;
/** Días antes del festivo en que sale el aviso por la app. */
export const DIAS_DE_AVISO = 3;

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dos = (n: number) => String(n).padStart(2, '0');

/** Día del mes del n-ésimo lunes (n = 1…5) de un mes. */
function lunesDelMes(anio: number, mes: number, n: number): number {
  const primero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay();
  return 1 + ((8 - primero) % 7) + (n - 1) * 7;
}

export type FestivoDeLey = { fecha: string; nombre: string; fraccion: string };

/** Descansos obligatorios de un año (LFT art. 74), en orden. */
export function festivosDeLeyDelAnio(anio: number): FestivoDeLey[] {
  const f = (mes: number, dia: number) => `${anio}-${dos(mes)}-${dos(dia)}`;
  const lista: FestivoDeLey[] = [
    { fecha: f(1, 1), nombre: 'Año Nuevo', fraccion: 'I' },
    { fecha: f(2, lunesDelMes(anio, 2, 1)), nombre: 'Día de la Constitución', fraccion: 'II' },
    { fecha: f(3, lunesDelMes(anio, 3, 3)), nombre: 'Natalicio de Benito Juárez', fraccion: 'III' },
    { fecha: f(5, 1), nombre: 'Día del Trabajo', fraccion: 'IV' },
    { fecha: f(9, 16), nombre: 'Día de la Independencia', fraccion: 'V' },
    { fecha: f(11, lunesDelMes(anio, 11, 3)), nombre: 'Día de la Revolución', fraccion: 'VI' },
    { fecha: f(12, 25), nombre: 'Navidad', fraccion: 'VIII' },
  ];
  // Cada seis años, el 1 de octubre en que cambia el Ejecutivo Federal (2024, 2030…).
  if (anio >= 2024 && (anio - 2024) % 6 === 0) {
    lista.push({ fecha: f(10, 1), nombre: 'Transmisión del Poder Ejecutivo Federal', fraccion: 'VII' });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** El festivo de ley de esa fecha, o null. */
export function festivoDeLey(fecha: string): FestivoDeLey | null {
  const m = FECHA_RE.exec(String(fecha ?? '').trim());
  if (!m) return null;
  return festivosDeLeyDelAnio(Number(m[1])).find((x) => x.fecha === fecha) ?? null;
}

/** Lo que guarda `dias_festivos`, ya con la fecha como `AAAA-MM-DD`. */
export type FilaFestivo = {
  id?: number;
  fecha: string;
  nombre: string;
  origen: string;
  modo: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  personas: number[];
  pagoDoble: boolean;
  avisar: boolean;
  nota: string | null;
  actualizadoPorId?: number | null;
  updatedAt?: Date | string | null;
};

export type Festivo = {
  fecha: string;
  nombre: string;
  origen: OrigenFestivo;
  /** Fracción del art. 74 (solo los de ley). */
  fraccion: string | null;
  modo: ModoFestivo;
  horaEntrada: string | null;
  horaSalida: string | null;
  /** Si se labora: vacío = todo el equipo. */
  personas: number[];
  pagoDoble: boolean;
  avisar: boolean;
  nota: string | null;
  /** Hay fila: dirección lo marcó o lo cambió. Un día de ley sin fila es «no se labora». */
  guardado: boolean;
  finDeSemana: boolean;
  actualizadoPorId: number | null;
  actualizadoAt: string | null;
};

const esFinde = (fecha: string) => {
  const d = diaDeLaSemana(fecha);
  return d === 0 || d === 6;
};

const iso = (v: Date | string | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

function modoValido(m: unknown): ModoFestivo {
  return (MODOS_FESTIVO as readonly string[]).includes(String(m)) ? (m as ModoFestivo) : 'NO_SE_LABORA';
}

function desdeFila(fila: FilaFestivo, ley: FestivoDeLey | null): Festivo {
  return {
    fecha: fila.fecha,
    nombre: ley?.nombre ?? (String(fila.nombre ?? '').trim() || 'Día de descanso'),
    origen: ley ? 'LEY' : 'EMPRESA',
    fraccion: ley?.fraccion ?? null,
    modo: modoValido(fila.modo),
    horaEntrada: fila.horaEntrada ?? null,
    horaSalida: fila.horaSalida ?? null,
    personas: [...new Set((fila.personas ?? []).filter((n) => Number.isInteger(n) && n > 0))],
    pagoDoble: fila.pagoDoble !== false,
    avisar: fila.avisar !== false,
    nota: fila.nota?.trim() || null,
    guardado: true,
    finDeSemana: esFinde(fila.fecha),
    actualizadoPorId: fila.actualizadoPorId ?? null,
    actualizadoAt: iso(fila.updatedAt),
  };
}

function deLey(ley: FestivoDeLey): Festivo {
  return {
    fecha: ley.fecha,
    nombre: ley.nombre,
    origen: 'LEY',
    fraccion: ley.fraccion,
    modo: 'NO_SE_LABORA',
    horaEntrada: null,
    horaSalida: null,
    personas: [],
    pagoDoble: true,
    avisar: true,
    nota: null,
    guardado: false,
    finDeSemana: esFinde(ley.fecha),
    actualizadoPorId: null,
    actualizadoAt: null,
  };
}

/** Festivos entre dos fechas (incluidas): los de ley, con lo que dirección cambió, y los de la empresa. */
export function festivosDelRango(desde: string, hasta: string, filas: FilaFestivo[]): Festivo[] {
  const a = FECHA_RE.exec(desde);
  const b = FECHA_RE.exec(hasta);
  if (!a || !b || hasta < desde) return [];
  const porFecha = new Map<string, Festivo>();
  for (let anio = Number(a[1]); anio <= Number(b[1]); anio++) {
    for (const ley of festivosDeLeyDelAnio(anio)) {
      if (ley.fecha >= desde && ley.fecha <= hasta) porFecha.set(ley.fecha, deLey(ley));
    }
  }
  for (const fila of filas) {
    if (!FECHA_RE.test(fila.fecha) || fila.fecha < desde || fila.fecha > hasta) continue;
    porFecha.set(fila.fecha, desdeFila(fila, festivoDeLey(fila.fecha)));
  }
  return [...porFecha.values()].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

export type ComoLeToca = {
  trabaja: boolean;
  /** Horario propio del día; null = el suyo de siempre (o su guardia). */
  horario: { entrada: string; salida: string } | null;
  /** Se le paga como festivo trabajado, si trabaja. */
  pagoDoble: boolean;
};

/** Cómo le toca el festivo a una persona. */
export function comoLeToca(f: Festivo, p: { userId: number; conGuardia?: boolean }): ComoLeToca {
  if (f.finDeSemana) {
    const trabaja = Boolean(p.conGuardia);
    return { trabaja, horario: null, pagoDoble: trabaja && f.pagoDoble };
  }
  if (f.modo === 'NO_SE_LABORA') return { trabaja: false, horario: null, pagoDoble: false };
  const trabaja = f.personas.length === 0 || f.personas.includes(p.userId);
  const horario =
    trabaja && f.modo === 'HORARIO' && f.horaEntrada && f.horaSalida
      ? { entrada: f.horaEntrada, salida: f.horaSalida }
      : null;
  return { trabaja, horario, pagoDoble: trabaja && f.pagoDoble };
}

function minutos(hm: string | null | undefined): number | null {
  const m = HORA_RE.exec(String(hm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Duración del horario propio en minutos (de la entrada a la salida, sin comida). */
export function minutosDeHorario(entrada: string | null | undefined, salida: string | null | undefined): number | null {
  const e = minutos(entrada);
  const s = minutos(salida);
  return e != null && s != null && s > e ? s - e : null;
}

export type DatosFestivo = {
  nombre: string;
  origen: OrigenFestivo;
  modo: ModoFestivo;
  horaEntrada: string | null;
  horaSalida: string | null;
  personas: number[];
  pagoDoble: boolean;
  avisar: boolean;
  nota: string | null;
};

/** Valida lo que manda el formulario. El error va en una frase, lista para la pantalla. */
export function normalizaFestivo(
  fecha: string,
  e: {
    nombre?: unknown;
    modo?: unknown;
    horaEntrada?: unknown;
    horaSalida?: unknown;
    personas?: unknown;
    pagoDoble?: unknown;
    avisar?: unknown;
    nota?: unknown;
  },
): { ok: true; datos: DatosFestivo } | { ok: false; error: string } {
  if (!FECHA_RE.test(String(fecha ?? '')) || diaDeLaSemana(fecha) == null) {
    return { ok: false, error: 'Elige un día válido (AAAA-MM-DD).' };
  }
  const ley = festivoDeLey(fecha);
  const nombre = ley?.nombre ?? String(e.nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!nombre) return { ok: false, error: 'Escribe el nombre del día.' };
  if (nombre.length > NOMBRE_FESTIVO_MAX) return { ok: false, error: `El nombre no puede pasar de ${NOMBRE_FESTIVO_MAX} caracteres.` };

  const modo = String(e.modo ?? 'NO_SE_LABORA');
  if (!(MODOS_FESTIVO as readonly string[]).includes(modo)) return { ok: false, error: 'Elige si se labora ese día.' };
  if (modo !== 'NO_SE_LABORA' && esFinde(fecha)) {
    return { ok: false, error: 'En fin de semana ya es descanso: quien trabaje necesita una guardia (pestaña Guardias).' };
  }

  let horaEntrada: string | null = null;
  let horaSalida: string | null = null;
  if (modo === 'HORARIO') {
    horaEntrada = String(e.horaEntrada ?? '').trim();
    horaSalida = String(e.horaSalida ?? '').trim();
    if (!HORA_RE.test(horaEntrada) || !HORA_RE.test(horaSalida)) {
      return { ok: false, error: 'Escribe la entrada y la salida como HH:MM.' };
    }
    if (minutosDeHorario(horaEntrada, horaSalida) == null) {
      return { ok: false, error: 'La salida tiene que ser después de la entrada.' };
    }
  }

  let personas: number[] = [];
  if (modo !== 'NO_SE_LABORA' && e.personas != null) {
    if (!Array.isArray(e.personas)) return { ok: false, error: 'La lista de personas no es válida.' };
    personas = [...new Set(e.personas.map((x) => Number(x)))];
    if (personas.some((n) => !Number.isInteger(n) || n <= 0)) return { ok: false, error: 'La lista de personas no es válida.' };
  }

  const nota = String(e.nota ?? '').trim() || null;
  if (nota && nota.length > NOTA_FESTIVO_MAX) return { ok: false, error: `La nota no puede pasar de ${NOTA_FESTIVO_MAX} caracteres.` };

  return {
    ok: true,
    datos: {
      nombre,
      origen: ley ? 'LEY' : 'EMPRESA',
      modo: modo as ModoFestivo,
      horaEntrada,
      horaSalida,
      personas,
      pagoDoble: e.pagoDoble !== false,
      avisar: e.avisar !== false,
      nota,
    },
  };
}

/** `AAAA-MM-DD` más `n` días. */
export function sumaDiasFecha(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «el lunes 16» */
export function diaDelFestivo(fecha: string): string {
  const d = diaDeLaSemana(fecha);
  return `el ${d == null ? '' : `${DIAS[d]} `}${Number(fecha.slice(8, 10))}`;
}

/** Aviso por la app, unos días antes, de cómo le toca a cada quien. */
export function avisoDelFestivo(f: Festivo, como: ComoLeToca): { title: string; message: string } {
  const dia = diaDelFestivo(f.fecha);
  const Dia = dia.charAt(0).toUpperCase() + dia.slice(1);
  const nota = f.nota ? ` ${f.nota}` : '';
  if (!como.trabaja) return { title: `${Dia} no se labora`, message: `${f.nombre}. Descanso pagado.` };
  const pago = como.pagoDoble ? 'Festivo trabajado: se paga doble.' : 'Festivo trabajado.';
  if (f.finDeSemana) return { title: `${Dia} tienes guardia en festivo`, message: `${f.nombre}. ${pago}${nota}` };
  if (como.horario) {
    return { title: `${Dia} te toca de ${como.horario.entrada} a ${como.horario.salida}`, message: `${f.nombre}. ${pago}${nota}` };
  }
  return { title: `${Dia} te toca tu jornada completa`, message: `${f.nombre}. ${pago}${nota}` };
}

/** Respuesta de la checada rechazada en un festivo que no se labora. */
export function mensajeFestivoSinLaborar(nombre: string): string {
  return `Hoy es ${nombre}: no se labora. Si te toca trabajar, pide a dirección que te agregue en Días festivos.`;
}
