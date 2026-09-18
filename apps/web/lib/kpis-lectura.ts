/**
 * Lectura de los KPI del equipo para personas: frases en español llano, avisos cortos,
 * el orden del ranking y la escala común de la línea de tiempo por día.
 *
 * Nada de esto recalcula: los números vienen de la API (`apps/api/src/me/kpis-equipo.ts`).
 */
import type { DiaKpi, KpiPersonaFila, TotalesKpi } from "@/lib/kpis-equipo";

const ZONA = "America/Mexico_City";

/** «40 h», «29 h 10 min», «45 min». Para frases, no para tablas. */
export function horasEnPalabras(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Mismos cortes que el semáforo de la API (`UMBRALES_KPI`): verde ≥ 70 %, amarillo ≥ 50 %. */
export function tonoProductividad(pct: number | null | undefined): "ok" | "atencion" | "critico" | "sin_datos" {
  if (pct == null || !Number.isFinite(pct)) return "sin_datos";
  if (pct >= 70) return "ok";
  if (pct >= 50) return "atencion";
  return "critico";
}

/**
 * La productividad de una persona (o del equipo) en una o varias frases:
 * «De 40 h en jornada, 29 h estuvo en actividades (73 %). Llegó tarde 2 veces (35 min en total).
 * Uniforme correcto 4 de 5 días.»
 */
export function resumenEnPalabras(t: TotalesKpi, opciones: { conHorario?: boolean } = {}): string {
  const frases: string[] = [];
  if (t.minutosLaborados > 0) {
    const pct = t.productividadPct == null ? "" : ` (${Math.round(t.productividadPct)} %)`;
    frases.push(
      `De ${horasEnPalabras(t.minutosLaborados)} en jornada, ${horasEnPalabras(t.minutosProductivos)} estuvo en actividades${pct}.`,
    );
  } else {
    frases.push("No tiene horas en jornada en estas fechas.");
  }
  if (opciones.conHorario !== false && t.diasConJornada > 0) {
    frases.push(
      t.retardos
        ? `Llegó tarde ${t.retardos === 1 ? "1 vez" : `${t.retardos} veces`} (${horasEnPalabras(t.minutosTarde)} en total).`
        : "Llegó a tiempo todos los días.",
    );
  }
  const u = t.uniforme;
  if (u.revisadas) {
    const extra = u.sinRevisar ? ` (${plural(u.sinRevisar, "día sin revisar", "días sin revisar")})` : "";
    frases.push(`Uniforme correcto ${u.ok} de ${plural(u.revisadas, "día", "días")}${extra}.`);
  } else if (u.sinRevisar) {
    frases.push(`Nadie ha revisado su uniforme (${plural(u.sinRevisar, "entrada", "entradas")}).`);
  }
  if (t.diasSinChecada) frases.push(`${plural(t.diasSinChecada, "día laborable", "días laborables")} sin checar.`);
  if (t.actividadesFueraDeJornada) {
    frases.push(
      t.actividadesFueraDeJornada === 1
        ? "1 actividad la hizo sin checar entrada: no cuenta como productiva."
        : `${t.actividadesFueraDeJornada} actividades las hizo sin checar entrada: no cuentan como productivas.`,
    );
  }
  return frases.join(" ");
}

export type AvisoKpi = { clave: string; texto: string; tono: "warning" | "danger" | "neutral" };

/** Solo lo que pide atención, en corto, para la fila del ranking. Vacío = todo en orden. */
export function avisosDePersona(t: TotalesKpi): AvisoKpi[] {
  const out: AvisoKpi[] = [];
  if (t.retardos) {
    out.push({ clave: "retardos", texto: `${plural(t.retardos, "retardo", "retardos")} · ${horasEnPalabras(t.minutosTarde)}`, tono: "warning" });
  }
  if (t.uniforme.noOk) {
    out.push({ clave: "uniforme", texto: `Uniforme ${t.uniforme.ok}/${t.uniforme.revisadas}`, tono: "warning" });
  }
  if (t.diasSinChecada) {
    out.push({ clave: "sin-checar", texto: `${plural(t.diasSinChecada, "día", "días")} sin checar`, tono: "danger" });
  }
  if (t.actividadesFueraDeJornada) {
    out.push({
      clave: "fuera",
      texto: `${plural(t.actividadesFueraDeJornada, "actividad", "actividades")} sin checar entrada`,
      tono: "warning",
    });
  }
  if (t.uniforme.sinRevisar) {
    out.push({ clave: "sin-revisar", texto: `Uniforme sin revisar (${t.uniforme.sinRevisar})`, tono: "neutral" });
  }
  return out;
}

export type OrdenRanking = "productividad" | "nombre" | "retardos";

/** Ranking: mejor productividad arriba (sin dato al final), por nombre o por retardos. */
export function ordenaRanking(personas: KpiPersonaFila[], orden: OrdenRanking): KpiPersonaFila[] {
  const nombre = (a: KpiPersonaFila, b: KpiPersonaFila) => a.persona.nombre.localeCompare(b.persona.nombre, "es");
  return [...personas].sort((a, b) => {
    if (orden === "nombre") return nombre(a, b);
    if (orden === "retardos") {
      return b.totales.retardos - a.totales.retardos || b.totales.minutosTarde - a.totales.minutosTarde || nombre(a, b);
    }
    const x = a.totales.productividadPct;
    const y = b.totales.productividadPct;
    if (x == null && y == null) return nombre(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || nombre(a, b);
  });
}

// ─── Línea de tiempo por día con una escala común ─────────────────────────

const partesMx = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutos desde la medianoche (hora de México) del día `fecha`; pasa de 1440 si cruza la noche. */
export function minutoDelDia(iso: string, fecha: string): number {
  const p = Object.fromEntries(partesMx.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const [y, m, d] = fecha.split("-").map(Number);
  const dias = Math.round((local - Date.UTC(y, (m ?? 1) - 1, d ?? 1)) / 86_400_000);
  return dias * 1440 + Number(p.hour) * 60 + Number(p.minute);
}

export type EscalaDias = { desde: number; hasta: number; horas: number[] };

/** De la hora en punto antes de la primera entrada a la siguiente después de la última salida (8 h mínimo). */
export function escalaDeDias(dias: Pick<DiaKpi, "fecha" | "tramos">[]): EscalaDias | null {
  let min = Infinity;
  let max = -Infinity;
  for (const d of dias) {
    for (const t of d.tramos?.jornada ?? []) {
      min = Math.min(min, minutoDelDia(t.inicio, d.fecha));
      max = Math.max(max, minutoDelDia(t.fin, d.fecha));
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const desde = Math.floor(min / 60) * 60;
  const hasta = Math.max(Math.ceil(max / 60) * 60, desde + 8 * 60);
  const horas: number[] = [];
  for (let h = desde; h <= hasta; h += 60) horas.push(h);
  return { desde, hasta, horas };
}

export type BloqueDia = {
  tipo: "jornada" | "productivo" | "comida";
  izquierdaPct: number;
  anchoPct: number;
  inicio: string;
  fin: string;
  /** Solo productivo: folios y títulos de las actividades que lo cubren. */
  actividades?: Array<{ anNumber: string | null; titulo: string | null }>;
};

/** Los bloques de un día sobre la escala común: jornada, tiempo en actividades y comida. */
export function bloquesDelDia(dia: Pick<DiaKpi, "fecha" | "tramos" | "actividades">, escala: EscalaDias): BloqueDia[] {
  const largo = escala.hasta - escala.desde;
  const t = dia.tramos;
  if (!t || largo <= 0) return [];
  const bloque = (tipo: BloqueDia["tipo"]) => (x: { inicio: string; fin: string }): BloqueDia => {
    const a = minutoDelDia(x.inicio, dia.fecha);
    const b = minutoDelDia(x.fin, dia.fecha);
    return {
      tipo,
      izquierdaPct: ((a - escala.desde) / largo) * 100,
      anchoPct: (Math.max(0, b - a) / largo) * 100,
      inicio: x.inicio,
      fin: x.fin,
    };
  };
  const productivos = t.productivo.map(bloque("productivo")).map((p) => ({
    ...p,
    actividades: (dia.actividades ?? [])
      .filter((a) => a.inicio < p.fin && a.fin > p.inicio)
      .map((a) => ({ anNumber: a.anNumber, titulo: a.titulo })),
  }));
  return [...t.jornada.map(bloque("jornada")), ...t.comida.map(bloque("comida")), ...productivos];
}

export type ActividadDelRango = {
  fecha: string;
  activityId: number;
  anNumber: string | null;
  titulo: string | null;
  inicio: string;
  fin: string;
  enCurso: boolean;
  /** Del inicio real al fin real (o hasta ahora). */
  minutosReales: number;
  /** Lo que cayó dentro de sus horas laboradas: lo que cuenta como productivo. */
  minutosEnJornada: number;
};

/** Las actividades de todos los días del rango, lo más reciente arriba. */
export function actividadesDelRango(dias: Pick<DiaKpi, "fecha" | "actividades">[]): ActividadDelRango[] {
  const out: ActividadDelRango[] = [];
  for (const d of dias) {
    for (const a of d.actividades ?? []) {
      const reales = Math.max(0, Math.round((new Date(a.fin).getTime() - new Date(a.inicio).getTime()) / 60_000));
      out.push({ fecha: d.fecha, ...a, minutosReales: reales });
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.inicio.localeCompare(b.inicio));
}

/** Por qué una actividad cuenta completa, a medias o nada. */
export function porQueCuenta(a: Pick<ActividadDelRango, "minutosReales" | "minutosEnJornada" | "enCurso">): string {
  const fuera = a.minutosReales - a.minutosEnJornada;
  if (a.minutosEnJornada <= 0) return "No cuenta: fue fuera de su jornada";
  if (fuera <= 1) return a.enCurso ? "Cuenta hasta ahora (sigue abierta)" : "Cuenta completa";
  return `Cuenta ${horasEnPalabras(a.minutosEnJornada)}: ${horasEnPalabras(fuera)} cayeron en comida o fuera de jornada`;
}
