import { erpFetch } from "@/lib/erp-api";

/**
 * Días festivos y cómo se trabaja cada uno. Los de ley (LFT art. 74) vienen solos como «no se
 * labora»; dirección puede cambiarlos y agregar los días que da la empresa. El API decide quién
 * puede editar (`puedeEditar`).
 */

export type ModoFestivo = "NO_SE_LABORA" | "HORARIO" | "COMPLETA";

export type Festivo = {
  /** AAAA-MM-DD */
  fecha: string;
  nombre: string;
  origen: "LEY" | "EMPRESA";
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
  /** Dirección lo marcó o lo cambió. */
  guardado: boolean;
  finDeSemana: boolean;
  actualizadoPorId: number | null;
  actualizadoAt: string | null;
};

export type PersonaFestivo = { id: number; nombre: string; puesto: string | null; avatarUrl: string | null };

export type FestivosRango = {
  desde: string;
  hasta: string;
  hoy: string;
  puedeEditar: boolean;
  personas: PersonaFestivo[];
  items: Festivo[];
};

export type GuardarFestivo = {
  nombre?: string;
  modo: ModoFestivo;
  horaEntrada?: string | null;
  horaSalida?: string | null;
  personas?: number[];
  pagoDoble: boolean;
  avisar: boolean;
  nota?: string | null;
};

export const NOMBRE_FESTIVO_MAX = 120;
export const NOTA_FESTIVO_MAX = 300;
export const DIAS_DE_AVISO = 3;

export function fetchFestivos(token: string, rango: { desde?: string; hasta?: string } = {}) {
  const qs = new URLSearchParams();
  if (rango.desde) qs.set("desde", rango.desde);
  if (rango.hasta) qs.set("hasta", rango.hasta);
  const q = qs.toString();
  return erpFetch<FestivosRango>(`festivos${q ? `?${q}` : ""}`, token);
}

export function guardarFestivo(token: string, fecha: string, body: GuardarFestivo) {
  return erpFetch<Festivo | null>(`festivos/${fecha}`, token, { method: "PUT", body: JSON.stringify(body) });
}

export function quitarFestivo(token: string, fecha: string) {
  return erpFetch<{ quitado: boolean; fecha: string; deLey: boolean }>(`festivos/${fecha}`, token, { method: "DELETE" });
}

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function aUtc(fecha: string): Date | null {
  const m = FECHA_RE.exec(fecha);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === fecha ? d : null;
}

function partes(fecha: string, opciones: Intl.DateTimeFormatOptions): Record<string, string> {
  const d = aUtc(fecha);
  if (!d) return {};
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...opciones }).formatToParts(d)) {
    out[p.type] = p.value.replace(/\.$/, "");
  }
  return out;
}

/** Para la ficha de calendario: «NOV», «16», «lun». */
export function fichaDeFecha(fecha: string): { mes: string; dia: string; semana: string } {
  const p = partes(fecha, { month: "short", day: "numeric", weekday: "short" });
  return { mes: (p.month ?? "").toUpperCase(), dia: p.day ?? "", semana: p.weekday ?? "" };
}

/** «lunes 16 de noviembre» */
export function fechaLarga(fecha: string): string {
  const p = partes(fecha, { weekday: "long", day: "numeric", month: "long" });
  return p.weekday ? `${p.weekday} ${p.day} de ${p.month}` : fecha;
}

/** «lun 2 nov» */
export function fechaCorta(fecha: string): string {
  const p = partes(fecha, { weekday: "short", day: "numeric", month: "short" });
  return p.weekday ? `${p.weekday} ${p.day} ${p.month}` : fecha;
}

/** `AAAA-MM-DD` más `n` días. */
export function sumaDias(fecha: string, n: number): string {
  const d = aUtc(fecha);
  if (!d) return fecha;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas (b − a). */
export function diasEntre(a: string, b: string): number {
  const x = aUtc(a);
  const y = aUtc(b);
  return x && y ? Math.round((y.getTime() - x.getTime()) / 86_400_000) : 0;
}

/** Cómo se trabaja, en palabras: «No se labora», «Se labora 10:00 a 14:00», «Cae en sábado». */
export function comoSeTrabaja(f: Pick<Festivo, "modo" | "horaEntrada" | "horaSalida" | "finDeSemana" | "fecha">): string {
  if (f.finDeSemana) return `Cae en ${partes(f.fecha, { weekday: "long" }).weekday ?? "fin de semana"}`;
  if (f.modo === "HORARIO" && f.horaEntrada && f.horaSalida) return `Se labora ${f.horaEntrada} a ${f.horaSalida}`;
  if (f.modo === "COMPLETA") return "Se labora la jornada completa";
  return "No se labora";
}

/** Quién trabaja, en palabras. */
export function quienTrabaja(f: Pick<Festivo, "modo" | "personas" | "finDeSemana">): string {
  if (f.finDeSemana) return "Solo quien tenga guardia";
  if (f.modo === "NO_SE_LABORA") return "Todo el equipo descansa";
  if (!f.personas.length) return "Todo el equipo";
  return f.personas.length === 1 ? "1 persona · el resto descansa" : `${f.personas.length} personas · el resto descansa`;
}

/** Cómo sale en la nómina, en palabras. */
export function enLaNomina(f: Pick<Festivo, "modo" | "pagoDoble" | "finDeSemana">): string {
  if (f.finDeSemana) return f.pagoDoble ? "Guardia en festivo: pago doble" : "Guardia en festivo";
  if (f.modo === "NO_SE_LABORA") return "Descanso pagado";
  return f.pagoDoble ? "Festivo trabajado: pago doble" : "Festivo trabajado";
}

/** Duración de un horario «HH:MM» → «4 h», «4 h 30 min»; null si no es válido. */
export function duracionHorario(entrada: string | null | undefined, salida: string | null | undefined): string | null {
  const m = (v: string | null | undefined) => {
    const r = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? ""));
    return r ? Number(r[1]) * 60 + Number(r[2]) : null;
  };
  const e = m(entrada);
  const s = m(salida);
  if (e == null || s == null || s <= e) return null;
  const min = s - e;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
