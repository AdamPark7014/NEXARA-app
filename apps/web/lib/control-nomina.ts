/**
 * Control de nómina semanal (Pagos a empleados → «Control semanal»).
 *
 * Funciones puras de la pantalla: fechas de la semana (lunes → domingo), formato de
 * horas y montos, color del lugar del día, filtros y totales de lo que se ve. El
 * cálculo de dinero lo hace la API (`.ai/CONTROL-NOMINA-SPEC.md`): aquí solo se suma
 * lo que llega para el resumen de la vista filtrada, nunca se recalcula un pago.
 */
import { KPIS_PATH } from "@/lib/kpis-equipo";

/* ─── Tipos del contrato (GET employee-payments/control-semanal) ─────────── */

export type EstadoSemana = "borrador" | "revisado" | "cerrado";

export type DiaSemanaControl = {
  fecha: string;
  /** «LUNES», «MARTES»… como en su Excel. */
  nombre: string;
  /** Día del mes con dos cifras («28»). */
  numero: string;
};

export type DiaControl = {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  /** Salida − entrada en bruto, en horas decimales (10:00→18:00 = 8). */
  horas: number;
  lugar: string | null;
  lugarOrigen: "auto" | "manual";
  /** Día laborable sin checada. */
  falta: boolean;
  nota?: string | null;
  /** Quién hizo el ajuste manual y cuándo (opcional en la API). */
  ajustadoPor?: string | null;
  ajustadoAt?: string | null;
};

export type ViaticoControl = {
  id: number | string;
  concepto: string;
  monto: number | null;
  estatus: string;
  fecha?: string | null;
};

export type DescuentoControl = {
  id: number | string;
  concepto: string;
  monto: number | null;
  /** Lo propuso el sistema (falta injustificada). */
  sugerido: boolean;
  /** Un sugerido solo cuenta cuando alguien lo acepta. */
  aceptado?: boolean;
};

export type FilaControl = {
  userId: number;
  nombre: string;
  area: string | null;
  dias: DiaControl[];
  horasTotales: number;
  sueldo: number | null;
  pagoPorHora: number | null;
  divisorHoras: number | null;
  viaticos: number | null;
  viaticosDetalle: ViaticoControl[];
  extrasMonto: number | null;
  extrasMinutosAprobados: number;
  extrasMinutosPendientes: number;
  sueldoPeriodo: number | null;
  descuentos: DescuentoControl[];
  descuentosTotal: number | null;
  subtotal: number | null;
  total: number | null;
  notaFila: string | null;
  /** `auto` = la armó el sistema («* Toda la semana asignado a …»). */
  notaFilaOrigen?: "auto" | "manual" | null;
  /** Pago ya generado para esta semana (cerrar no lo duplica). */
  pagoId?: number | null;
  puesto?: string | null;
};

export type TotalesControl = {
  personas?: number;
  horas?: number;
  sueldoPeriodo?: number | null;
  viaticos?: number | null;
  extras?: number | null;
  subtotal?: number | null;
  descuentos?: number | null;
  total?: number | null;
  faltas?: number;
  [k: string]: unknown;
};

export type PersonaRef = string | { id?: number; nombre?: string | null } | null | undefined;

export type SemanaControl = {
  inicio: string;
  fin: string;
  estado: string;
  cerradaPor?: PersonaRef;
  cerradaAt?: string | null;
  reabiertaPor?: PersonaRef;
  reabiertaAt?: string | null;
  motivoReapertura?: string | null;
};

export type PermisosControl = {
  verMontos?: boolean;
  editar?: boolean;
  cerrar?: boolean;
  reabrir?: boolean;
};

export type ControlSemanal = {
  semana: SemanaControl;
  dias: DiaSemanaControl[];
  filas: FilaControl[];
  totales: TotalesControl;
  /** Fórmulas en texto que manda la API (`pagoPorHora`, `subtotal`, `total`…). */
  formula: Record<string, string> | string[];
  permisos?: PermisosControl;
};

/* ─── Fechas ─────────────────────────────────────────────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` en hora local (en la tarde de CDMX `toISOString` ya es mañana). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Fecha `YYYY-MM-DD` a mediodía local: así ningún cambio de zona la mueve de día. */
export function fechaDeIso(iso: string): Date {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function esIsoValido(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return isoLocal(fechaDeIso(v)) === v;
}

export function sumarDias(iso: string, n: number): string {
  const d = fechaDeIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/** Lunes de la semana (lunes → domingo) de una fecha. */
export function lunesDe(ref: Date | string = new Date()): string {
  const d = typeof ref === "string" ? fechaDeIso(ref) : new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return isoLocal(d);
}

export const semanaActual = (hoy: Date = new Date()) => lunesDe(hoy);
export const semanaPasada = (hoy: Date = new Date()) => sumarDias(lunesDe(hoy), -7);
export const domingoDe = (lunes: string) => sumarDias(lunes, 6);

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NOMBRES_DIA = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];

/** «28 sep – 4 oct 2026» · «5 – 11 oct 2026» · «29 dic 2025 – 4 ene 2026». */
export function etiquetaSemana(lunes: string): string {
  const a = fechaDeIso(lunes);
  const b = fechaDeIso(domingoDe(lunes));
  const da = a.getDate();
  const db = `${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${da} ${MESES[a.getMonth()]} ${a.getFullYear()} – ${db}`;
  if (a.getMonth() !== b.getMonth()) return `${da} ${MESES[a.getMonth()]} – ${db}`;
  return `${da} – ${db}`;
}

/** Los siete días de la semana con el nombre y número como en su Excel. */
export function diasDeSemana(lunes: string): DiaSemanaControl[] {
  return NOMBRES_DIA.map((nombre, i) => {
    const fecha = sumarDias(lunes, i);
    return { fecha, nombre, numero: fecha.slice(8, 10) };
  });
}

/** Sábado o domingo. */
export function esFinDeSemana(fecha: string): boolean {
  const dow = fechaDeIso(fecha).getDay();
  return dow === 0 || dow === 6;
}

/** «Lunes 28» para lectores de pantalla y menús. */
export function diaLegible(d: Pick<DiaSemanaControl, "nombre" | "numero">): string {
  const n = d.nombre.toLowerCase();
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${d.numero}`;
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

/** «5 oct 2026, 14:20» en hora de Ciudad de México. */
export function fechaHoraCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return FORMATO_FECHA_HORA.format(d).replace(/\./g, "");
}

/* ─── Formatos ───────────────────────────────────────────────────────────── */

/** Horas en decimal con dos cifras, como su Excel: 8 → «8.00», 7.966 → «7.97». */
export function formatoHoras(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  const r = Math.round(h * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

/** Minutos a horas decimales con unidad: 90 → «1.50 h». */
export function formatoMinutos(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  return `${formatoHoras(min / 60)} h`;
}

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatoMoneda(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return MXN.format(Math.round(n * 100) / 100);
}

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Suma ignorando `null`; si todos son `null` (montos ocultos) el resultado es `null`. */
export function sumaONull(valores: ReadonlyArray<number | null | undefined>): number | null {
  let hay = false;
  let s = 0;
  for (const v of valores) {
    if (v == null || !Number.isFinite(v)) continue;
    hay = true;
    s += v;
  }
  return hay ? redondear2(s) : null;
}

/* ─── Lugar del día ──────────────────────────────────────────────────────── */

export type LugarTono =
  | "oficina"
  | "foraneo"
  | "descanso"
  | "falta"
  | "justificada"
  | "guardia"
  | "vacaciones"
  | "otro"
  | "vacio";

/** Lo que se puede elegir a mano en el menú del día (el API recibe el texto tal cual). */
export const LUGARES_EDITABLES = [
  "Oficina",
  "Foráneo",
  "Descanso",
  "Guardia",
  "Vacaciones",
  "Permiso",
  "Falta justificada",
  "Falta",
] as const;

export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Tono (color) del lugar; tolera mayúsculas y acentos («FORANEO» = «Foráneo»). */
export function tonoDeLugar(lugar: string | null | undefined): LugarTono {
  const t = normalizarTexto(lugar);
  if (!t) return "vacio";
  if (t.startsWith("falta")) return t.includes("justific") && !t.includes("injustific") ? "justificada" : "falta";
  if (t.startsWith("oficina")) return "oficina";
  if (t.startsWith("foraneo") || t.startsWith("fuera")) return "foraneo";
  if (t.startsWith("descanso")) return "descanso";
  if (t.startsWith("guardia")) return "guardia";
  if (t.startsWith("vacacion") || t.startsWith("permiso") || t.startsWith("incapacidad")) return "vacaciones";
  return "otro";
}

/**
 * Color de cada lugar con los tokens del sistema (`--ui-*`), que ya cambian solos en
 * modo oscuro. Los acentos del logotipo son color de categoría; la falta va en
 * amarillo suave como en su Excel. Texto ≥ 4.5:1 sobre su fondo en claro (12 px):
 * Foráneo y Guardia usan la tinta `-text` del estado, no la del acento, que se quedaba
 * en 4.0:1.
 */
export const COLOR_LUGAR: Record<LugarTono, { fondo: string; texto: string; borde: string }> = {
  oficina: { fondo: "var(--ui-brand-soft)", texto: "var(--ui-brand-text)", borde: "var(--ui-brand-border)" },
  foraneo: { fondo: "var(--ui-kind-red-bg)", texto: "var(--ui-info-text)", borde: "var(--ui-info-border)" },
  descanso: { fondo: "var(--ui-neutral-bg)", texto: "var(--ui-neutral-text)", borde: "var(--ui-neutral-border)" },
  falta: {
    fondo: "color-mix(in srgb, #facc15 26%, var(--ui-surface))",
    texto: "var(--ui-warning-text)",
    borde: "var(--ui-warning-border)",
  },
  justificada: { fondo: "var(--ui-violet-bg)", texto: "var(--ui-violet-text)", borde: "var(--ui-violet-border)" },
  guardia: { fondo: "var(--ui-kind-obra-bg)", texto: "var(--ui-warning-text)", borde: "var(--ui-warning-border)" },
  vacaciones: { fondo: "var(--ui-kind-acceso-bg)", texto: "var(--ui-kind-acceso-fg)", borde: "var(--ui-violet-border)" },
  otro: { fondo: "var(--ui-surface-2)", texto: "var(--ui-fg-2)", borde: "var(--ui-border-strong)" },
  vacio: { fondo: "transparent", texto: "var(--ui-fg-3)", borde: "var(--ui-border)" },
};

export function colorDeLugar(lugar: string | null | undefined) {
  return COLOR_LUGAR[tonoDeLugar(lugar)];
}

/* ─── Estado de la semana y permisos ─────────────────────────────────────── */

export function normalizarEstado(estado: string | null | undefined): EstadoSemana {
  const t = normalizarTexto(estado);
  if (t.startsWith("cerrad")) return "cerrado";
  if (t.startsWith("revisad")) return "revisado";
  return "borrador";
}

export function nombreDePersona(p: PersonaRef): string | null {
  if (!p) return null;
  if (typeof p === "string") return p.trim() || null;
  return p.nombre?.trim() || null;
}

export function etiquetaEstado(semana: SemanaControl): {
  estado: EstadoSemana;
  label: string;
  tone: "neutral" | "info" | "success";
  detalle: string | null;
} {
  const estado = normalizarEstado(semana.estado);
  if (estado === "cerrado") {
    const quien = nombreDePersona(semana.cerradaPor);
    const cuando = fechaHoraCorta(semana.cerradaAt);
    const detalle = [quien ? `por ${quien}` : "", cuando ? `el ${cuando}` : ""].filter(Boolean).join(" ");
    return { estado, label: "Cerrada", tone: "success", detalle: detalle ? `Cerrada ${detalle}` : null };
  }
  const reabierta = nombreDePersona(semana.reabiertaPor);
  const detalle = reabierta
    ? `Reabierta por ${reabierta}${semana.reabiertaAt ? ` el ${fechaHoraCorta(semana.reabiertaAt)}` : ""}${semana.motivoReapertura ? ` · «${semana.motivoReapertura}»` : ""}`
    : null;
  if (estado === "revisado") return { estado, label: "Revisada", tone: "info", detalle };
  return { estado, label: "Borrador", tone: "neutral", detalle };
}

/** ¿La API mandó montos? `null` en todo = quien mira solo ve horas y lugar. */
export function montosVisibles(datos: Pick<ControlSemanal, "filas" | "permisos">): boolean {
  if (typeof datos.permisos?.verMontos === "boolean") return datos.permisos.verMontos;
  if (datos.filas.length === 0) return true;
  return datos.filas.some((f) => f.total != null || f.sueldo != null || f.subtotal != null);
}

/* ─── Normalización de la respuesta ──────────────────────────────────────── */

const num = (v: unknown, def = 0): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : def;
};
const numONull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Deja la respuesta con la forma exacta que espera la pantalla: arreglos siempre
 * presentes, montos `number | null`, días de la semana aunque la API no los mande.
 */
export function normalizarControl(raw: unknown, semanaPedida: string): ControlSemanal {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.semana && typeof r.semana === "object" ? r.semana : {}) as Record<string, unknown>;
  const inicio = esIsoValido(texto(s.inicio)?.slice(0, 10)) ? String(s.inicio).slice(0, 10) : semanaPedida;
  const dias = Array.isArray(r.dias) && r.dias.length
    ? (r.dias as Record<string, unknown>[]).map((d) => ({
        fecha: String(d.fecha ?? "").slice(0, 10),
        nombre: String(d.nombre ?? "").toUpperCase(),
        numero: String(d.numero ?? String(d.fecha ?? "").slice(8, 10)),
      }))
    : diasDeSemana(inicio);
  const filas = (Array.isArray(r.filas) ? (r.filas as Record<string, unknown>[]) : []).map((f): FilaControl => ({
    userId: num(f.userId),
    nombre: String(f.nombre ?? `#${String(f.userId ?? "")}`),
    area: texto(f.area),
    dias: (Array.isArray(f.dias) ? (f.dias as Record<string, unknown>[]) : []).map((d) => ({
      fecha: String(d.fecha ?? "").slice(0, 10),
      entrada: texto(d.entrada),
      salida: texto(d.salida),
      horas: num(d.horas),
      lugar: texto(d.lugar),
      lugarOrigen: d.lugarOrigen === "manual" ? "manual" : "auto",
      falta: Boolean(d.falta),
      nota: texto(d.nota),
      ajustadoPor: nombreDePersona(d.ajustadoPor as PersonaRef),
      ajustadoAt: texto(d.ajustadoAt),
    })),
    horasTotales: num(f.horasTotales),
    sueldo: numONull(f.sueldo),
    pagoPorHora: numONull(f.pagoPorHora),
    divisorHoras: numONull(f.divisorHoras),
    viaticos: numONull(f.viaticos),
    viaticosDetalle: (Array.isArray(f.viaticosDetalle) ? (f.viaticosDetalle as Record<string, unknown>[]) : []).map((v) => ({
      id: (v.id as number | string) ?? "",
      concepto: String(v.concepto ?? "Viático"),
      monto: numONull(v.monto),
      estatus: String(v.estatus ?? ""),
      fecha: texto(v.fecha),
    })),
    extrasMonto: numONull(f.extrasMonto),
    extrasMinutosAprobados: num(f.extrasMinutosAprobados),
    extrasMinutosPendientes: num(f.extrasMinutosPendientes),
    sueldoPeriodo: numONull(f.sueldoPeriodo),
    descuentos: (Array.isArray(f.descuentos) ? (f.descuentos as Record<string, unknown>[]) : []).map((d) => ({
      id: (d.id as number | string) ?? "",
      concepto: String(d.concepto ?? "Descuento"),
      monto: numONull(d.monto),
      sugerido: Boolean(d.sugerido),
      aceptado: typeof d.aceptado === "boolean" ? d.aceptado : undefined,
    })),
    descuentosTotal: numONull(f.descuentosTotal),
    subtotal: numONull(f.subtotal),
    total: numONull(f.total),
    notaFila: texto(f.notaFila),
    notaFilaOrigen: f.notaFilaOrigen === "auto" || f.notaFilaOrigen === "manual" ? f.notaFilaOrigen : null,
    pagoId: numONull(f.pagoId),
    puesto: texto(f.puesto),
  }));
  const formula = Array.isArray(r.formula)
    ? (r.formula as unknown[]).filter((x): x is string => typeof x === "string")
    : r.formula && typeof r.formula === "object"
      ? Object.fromEntries(
          Object.entries(r.formula as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
        )
      : {};
  return {
    semana: {
      inicio,
      fin: esIsoValido(texto(s.fin)?.slice(0, 10)) ? String(s.fin).slice(0, 10) : domingoDe(inicio),
      estado: String(s.estado ?? "borrador"),
      cerradaPor: (s.cerradaPor as PersonaRef) ?? null,
      cerradaAt: texto(s.cerradaAt),
      reabiertaPor: (s.reabiertaPor as PersonaRef) ?? null,
      reabiertaAt: texto(s.reabiertaAt),
      motivoReapertura: texto(s.motivoReapertura),
    },
    dias,
    filas,
    totales: (r.totales && typeof r.totales === "object" ? r.totales : {}) as TotalesControl,
    formula,
    permisos: r.permisos && typeof r.permisos === "object" ? (r.permisos as PermisosControl) : undefined,
  };
}

/* ─── Filas: búsqueda de días, filtros y totales ─────────────────────────── */

export function diaDeFila(fila: FilaControl, fecha: string): DiaControl | undefined {
  return fila.dias.find((d) => d.fecha === fecha);
}

export const tieneFaltas = (f: FilaControl) => f.dias.some((d) => d.falta);
export const esForaneo = (f: FilaControl) => f.dias.some((d) => tonoDeLugar(d.lugar) === "foraneo");

export type FiltrosControl = { q: string; area: string; soloFaltas: boolean; soloForaneos: boolean };
export const FILTROS_VACIOS: FiltrosControl = { q: "", area: "", soloFaltas: false, soloForaneos: false };

export const hayFiltros = (f: FiltrosControl) => Boolean(f.q.trim() || f.area || f.soloFaltas || f.soloForaneos);

export function filtrarFilas(filas: FilaControl[], filtros: FiltrosControl): FilaControl[] {
  const q = normalizarTexto(filtros.q);
  return filas.filter((f) => {
    if (q && !normalizarTexto(`${f.nombre} ${f.area ?? ""} ${f.puesto ?? ""}`).includes(q)) return false;
    if (filtros.area && (f.area ?? "") !== filtros.area) return false;
    if (filtros.soloFaltas && !tieneFaltas(f)) return false;
    if (filtros.soloForaneos && !esForaneo(f)) return false;
    return true;
  });
}

export function areasDe(filas: FilaControl[]): string[] {
  return [...new Set(filas.map((f) => f.area).filter((a): a is string => Boolean(a)))].sort((a, b) => a.localeCompare(b, "es"));
}

/** Descuentos sugeridos por el sistema que nadie ha aceptado: no restan todavía. */
export function descuentosPendientes(fila: FilaControl): DescuentoControl[] {
  return fila.descuentos.filter((d) => d.sugerido && d.aceptado !== true);
}

export type ResumenControl = {
  personas: number;
  horas: number;
  sueldoPeriodo: number | null;
  viaticos: number | null;
  extras: number | null;
  extrasMinutosAprobados: number;
  extrasMinutosPendientes: number;
  subtotal: number | null;
  descuentos: number | null;
  total: number | null;
  /** Días laborables sin checada (justificados o no). */
  faltas: number;
  faltasInjustificadas: number;
  personasConFalta: number;
  personasForaneas: number;
  descuentosSugeridosPendientes: number;
};

/** Totales de lo que se ve (respeta los filtros); montos `null` si la API los ocultó. */
export function resumenControl(filas: FilaControl[]): ResumenControl {
  let horas = 0;
  let faltas = 0;
  let faltasInjustificadas = 0;
  let personasConFalta = 0;
  let personasForaneas = 0;
  let aprob = 0;
  let pend = 0;
  let sugeridos = 0;
  for (const f of filas) {
    horas += f.horasTotales || 0;
    aprob += f.extrasMinutosAprobados || 0;
    pend += f.extrasMinutosPendientes || 0;
    sugeridos += descuentosPendientes(f).length;
    let falto = false;
    for (const d of f.dias) {
      if (!d.falta) continue;
      falto = true;
      faltas += 1;
      if (tonoDeLugar(d.lugar ?? "Falta") === "falta") faltasInjustificadas += 1;
    }
    if (falto) personasConFalta += 1;
    if (esForaneo(f)) personasForaneas += 1;
  }
  return {
    personas: filas.length,
    horas: redondear2(horas),
    sueldoPeriodo: sumaONull(filas.map((f) => f.sueldoPeriodo)),
    viaticos: sumaONull(filas.map((f) => f.viaticos)),
    extras: sumaONull(filas.map((f) => f.extrasMonto)),
    extrasMinutosAprobados: aprob,
    extrasMinutosPendientes: pend,
    subtotal: sumaONull(filas.map((f) => f.subtotal)),
    descuentos: sumaONull(filas.map((f) => f.descuentosTotal)),
    total: sumaONull(filas.map((f) => f.total)),
    faltas,
    faltasInjustificadas,
    personasConFalta,
    personasForaneas,
    descuentosSugeridosPendientes: sugeridos,
  };
}

/** Horas por día (renglón de totales de «Entradas y salidas»). */
export function totalesPorDia(filas: FilaControl[], dias: DiaSemanaControl[]): { horas: number[]; faltas: number[]; total: number } {
  const horas = dias.map(() => 0);
  const faltas = dias.map(() => 0);
  for (const f of filas) {
    dias.forEach((d, i) => {
      const dia = diaDeFila(f, d.fecha);
      if (!dia) return;
      horas[i] += dia.horas || 0;
      if (dia.falta) faltas[i] += 1;
    });
  }
  const r = horas.map(redondear2);
  return { horas: r, faltas, total: redondear2(r.reduce((a, b) => a + b, 0)) };
}

/* ─── Textos explicativos ────────────────────────────────────────────────── */

/** Lo que dice el tooltip de «Pago x hora». */
export function formulaPagoPorHora(fila: Pick<FilaControl, "sueldo" | "pagoPorHora" | "divisorHoras">): string {
  if (fila.sueldo == null && fila.pagoPorHora == null) return "Sin sueldo semanal registrado: no hay pago por hora.";
  const divisor = fila.divisorHoras ?? 48;
  const origen = fila.divisorHoras == null || fila.divisorHoras === 48 ? "sin horario fijo, jornada legal de 48 h" : "horas semanales de su horario";
  return `Sueldo semanal ${formatoMoneda(fila.sueldo)} ÷ ${formatoHoras(divisor)} h (${origen}) = ${formatoMoneda(fila.pagoPorHora)} por hora.`;
}

const ETIQUETA_FORMULA: Record<string, string> = {
  lugar: "Lugar del día",
  pagoPorHora: "Pago por hora",
  sueldoPeriodo: "Sueldo del periodo",
  viaticos: "Viáticos",
  extras: "Extras",
  descuentos: "Descuentos",
  subtotal: "Subtotal",
  total: "Total",
};
const ORDEN_FORMULA = Object.keys(ETIQUETA_FORMULA);

/** `horasExtra` → «Horas extra». */
function humanizarClave(clave: string): string {
  const t = clave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Renglones de «Cómo se calcula», en el orden en que se lee la tabla. */
export function lineasFormula(formula: ControlSemanal["formula"]): Array<{ clave: string; etiqueta: string | null; texto: string }> {
  if (Array.isArray(formula)) return formula.filter(Boolean).map((t, i) => ({ clave: String(i), etiqueta: null, texto: t }));
  return Object.entries(formula ?? {})
    .filter(([, t]) => typeof t === "string" && t.trim())
    .sort(([a], [b]) => {
      const ia = ORDEN_FORMULA.indexOf(a);
      const ib = ORDEN_FORMULA.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([clave, t]) => ({
      clave,
      etiqueta: ETIQUETA_FORMULA[clave] ?? humanizarClave(clave),
      texto: t,
    }));
}

export type ResumenCierre = {
  /** Pagos en Borrador que se crearán (total > 0 y sin pago previo). */
  pagos: number;
  total: number;
  sinMonto: number;
  yaGenerados: number;
  extrasMinutosPendientes: number;
  descuentosSinAceptar: number;
};

export function resumenCierre(filas: FilaControl[]): ResumenCierre {
  let pagos = 0;
  let total = 0;
  let sinMonto = 0;
  let yaGenerados = 0;
  let pend = 0;
  let sug = 0;
  for (const f of filas) {
    pend += f.extrasMinutosPendientes || 0;
    sug += descuentosPendientes(f).length;
    if (f.pagoId != null) {
      yaGenerados += 1;
      continue;
    }
    if (f.total == null || f.total <= 0) {
      sinMonto += 1;
      continue;
    }
    pagos += 1;
    total += f.total;
  }
  return { pagos, total: redondear2(total), sinMonto, yaGenerados, extrasMinutosPendientes: pend, descuentosSinAceptar: sug };
}

const personas = (n: number) => (n === 1 ? "1 persona" : `${n} personas`);

/** Mensaje del diálogo «Cerrar semana y generar pagos». */
export function textoConfirmacionCierre(r: ResumenCierre, etiqueta: string): string {
  const partes: string[] = [];
  partes.push(
    r.pagos === 0
      ? `No se creará ningún pago: nadie tiene un total mayor a $0 sin pago previo en la semana ${etiqueta}.`
      : `Se ${r.pagos === 1 ? "creará 1 pago" : `crearán ${r.pagos} pagos`} en Borrador en «Pagos a empleados» por un total de ${formatoMoneda(r.total)} (semana ${etiqueta}), uno por persona con el desglose en el concepto.`,
  );
  const avisos: string[] = [];
  if (r.yaGenerados) avisos.push(`${personas(r.yaGenerados)} ya ${r.yaGenerados === 1 ? "tiene" : "tienen"} pago de esta semana y no se duplica.`);
  if (r.sinMonto) avisos.push(`${personas(r.sinMonto)} sin monto a pagar (sin sueldo o en $0) no ${r.sinMonto === 1 ? "genera" : "generan"} pago.`);
  if (r.extrasMinutosPendientes) avisos.push(`Hay ${formatoMinutos(r.extrasMinutosPendientes)} extra pendientes de aprobar que no entran.`);
  if (r.descuentosSinAceptar)
    avisos.push(
      `${r.descuentosSinAceptar === 1 ? "Hay 1 descuento sugerido sin aceptar que no se aplica" : `Hay ${r.descuentosSinAceptar} descuentos sugeridos sin aceptar que no se aplican`}.`,
    );
  if (avisos.length) partes.push(avisos.join(" "));
  partes.push("La semana quedará cerrada y ya no se podrá editar, salvo que alguien con permiso la reabra.");
  return partes.join("\n\n");
}

export type ResultadoCierre = {
  creados?: number;
  omitidos?: number;
  existentes?: number;
  [k: string]: unknown;
};

/** Aviso tras cerrar, con lo que respondió la API (o lo previsto si no dice nada). */
export function textoResultadoCierre(res: ResultadoCierre | null | undefined, previsto: ResumenCierre): string {
  const creados = typeof res?.creados === "number" ? res.creados : previsto.pagos;
  const existentes = typeof res?.existentes === "number" ? res.existentes : 0;
  const omitidos = typeof res?.omitidos === "number" ? res.omitidos : 0;
  const partes = [
    creados === 0
      ? "Semana cerrada. No se creó ningún pago nuevo."
      : `Semana cerrada. Se ${creados === 1 ? "creó 1 pago" : `crearon ${creados} pagos`} en Borrador.`,
  ];
  if (existentes) partes.push(`${existentes === 1 ? "1 ya existía" : `${existentes} ya existían`} y no se duplicó.`);
  if (omitidos) partes.push(`${personas(omitidos)} sin monto no ${omitidos === 1 ? "generó" : "generaron"} pago.`);
  return partes.join(" ");
}

/** Detalle de KPIs de la persona, donde se aprueban sus horas extra de la semana. */
export function enlaceAprobarExtras(userId: number, inicio: string, fin: string): string {
  const q = new URLSearchParams({ desde: inicio, hasta: fin });
  return `${KPIS_PATH}/${userId}?${q}`;
}

export const MOTIVO_REAPERTURA_MINIMO = 10;
