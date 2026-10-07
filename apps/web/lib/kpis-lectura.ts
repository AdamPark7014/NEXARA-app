/**
 * Lectura de los KPI del equipo para personas: frases en español llano, avisos cortos,
 * el orden del ranking y la escala común de la línea de tiempo por día.
 *
 * Nada de esto recalcula: los números vienen de la API (`apps/api/src/me/kpis-equipo.ts`).
 */
import { fechaCorta, type DiaKpi, type EntregaKpi, type EntregasKpi, type KpiPersonaFila, type TotalesKpi } from "@/lib/kpis-equipo";

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

export type TonoKpi = "ok" | "atencion" | "critico" | "sin_datos";

/**
 * «Tiempo en actividades» (la vieja «productividad»). Ya no pinta el semáforo de la persona;
 * los cortes se quedan para el orden por tiempo: ≥ 70 % bien, ≥ 50 % atención.
 */
export function tonoProductividad(pct: number | null | undefined): TonoKpi {
  if (pct == null || !Number.isFinite(pct)) return "sin_datos";
  if (pct >= 70) return "ok";
  if (pct >= 50) return "atencion";
  return "critico";
}

/** Cumplimiento en tiempo y forma, con los cortes del semáforo de entregas de la API: ≥ 90 % bien, ≥ 75 % atención. */
export function tonoCumplimiento(pct: number | null | undefined): TonoKpi {
  if (pct == null || !Number.isFinite(pct)) return "sin_datos";
  if (pct >= 90) return "ok";
  if (pct >= 75) return "atencion";
  return "critico";
}

/** Para el `title` de la cifra: de qué está hecho el cumplimiento (los pesos vigentes de la API). */
export const PESOS_CUMPLIMIENTO =
  "Entregas a tiempo 20 %, ritmo de entregas 20 %, tiempo adecuado 15 %, siempre con algo 15 %, asistencia puntual 15 %, aprobadas a la primera 10 %, uniforme 5 %; el resultado se multiplica por la carga de trabajo (trabajo entregado ÷ horas en la oficina, meta 50 %) y por los días trabajados de los que debía trabajar";

/** «2.3», «1»: entregas por día con un decimal. */
export function porDiaTexto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (Math.round(n * 10) / 10).toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

/**
 * Las entregas en una frase: «Entregó 18 actividades: 17 a tiempo y 1 tarde; 18 de 18 aprobadas
 * a la primera.» Solo dice lo que aplica (sin tarde, sin vencidas o sin revisiones, se lo calla).
 */
export function entregasEnPalabras(e: EntregasKpi): string {
  const entregadas = e.aTiempo + e.tarde;
  const partes: string[] = [];
  if (entregadas > 0) {
    const todas = entregadas === 1 ? "" : "todas ";
    const como = !e.tarde
      ? `, ${todas}a tiempo`
      : !e.aTiempo
        ? `, ${todas}tarde`
        : `: ${e.aTiempo} a tiempo y ${e.tarde} tarde`;
    partes.push(`Entregó ${plural(entregadas, "actividad", "actividades")}${como}`);
    if (e.sinEntregar) partes.push(`${plural(e.sinEntregar, "venció", "vencieron")} sin entregar`);
  } else if (e.sinEntregar) {
    partes.push(`${plural(e.sinEntregar, "actividad venció", "actividades vencieron")} sin entregar`);
  } else {
    return "No tuvo actividades que entregar en estas fechas.";
  }
  if (e.revisadas) {
    partes.push(`${e.aprobadasALaPrimera} de ${e.revisadas} ${e.revisadas === 1 ? "aprobada" : "aprobadas"} a la primera`);
  }
  if (e.conTiempo) {
    const pasadas = e.conTiempo - (e.enTiempoAdecuado ?? 0);
    partes.push(
      pasadas
        ? `${plural(pasadas, "pasó", "pasaron")} su tiempo máximo (de ${e.conTiempo})`
        : `ninguna pasó su tiempo máximo`,
    );
  }
  return `${partes.join("; ")}.`;
}

/**
 * Ritmo, carga y ocupación en una frase: «Entregó 2.3 por día (el equipo va a 1.8); 29 h de trabajo
 * entregado en 58 h (50 %); con una actividad el 59 % de su jornada.»
 */
export function ritmoEnPalabras(t: TotalesKpi): string {
  const partes: string[] = [];
  if (t.ritmo && t.ritmo.dias > 0) {
    const ref = t.ritmo.referencia != null ? ` (el equipo va a ${porDiaTexto(t.ritmo.referencia)})` : "";
    partes.push(`Entregó ${porDiaTexto(t.ritmo.porDia)} por día${ref}`);
  }
  if (t.carga && t.minutosLaborados > 0) {
    partes.push(`${horasEnPalabras(t.carga.minutos)} de trabajo entregado en ${horasEnPalabras(t.minutosLaborados)} (${t.carga.pct ?? 0} %)`);
  }
  if (t.ocupacion && t.minutosLaborados > 0) {
    partes.push(`con una actividad el ${t.ocupacion.pct ?? 0} % de su jornada`);
  }
  return partes.length ? `${partes.join("; ")}.` : "";
}

/** Pista de la cifra del equipo: «17 de 18 entregas a tiempo · 0 devueltas». */
export function entregasDelEquipo(e: EntregasKpi | undefined): string {
  if (!e || !e.medidas) return "Sin entregas en estas fechas";
  return `${e.aTiempo} de ${plural(e.medidas, "entrega", "entregas")} a tiempo · ${plural(e.devueltas, "devuelta", "devueltas")}`;
}

/**
 * El texto bajo la barra del ranking: «17/18 a tiempo · 18/18 a la primera · 3 h 10 min en
 * actividades de 24 h». Con `tiempo` (orden «Tiempo en actividades») o con una API que aún
 * no manda entregas, solo las horas.
 */
export function detalleDeFila(t: TotalesKpi, opciones: { tiempo?: boolean } = {}): string {
  const partes: string[] = [];
  const e = t.entregas;
  if (!opciones.tiempo && e) {
    if (e.medidas) {
      partes.push(`${e.aTiempo}/${e.medidas} a tiempo`);
      if (t.ritmo && t.ritmo.dias > 0) partes.push(`${porDiaTexto(t.ritmo.porDia)} por día`);
      if (e.conTiempo) partes.push(`${e.enTiempoAdecuado ?? 0}/${e.conTiempo} en su tiempo`);
      if (t.carga && t.minutosLaborados > 0) partes.push(`carga ${t.carga.pct ?? 0} %`);
      if (e.revisadas) partes.push(`${e.aprobadasALaPrimera}/${e.revisadas} a la primera`);
    } else {
      partes.push("Sin entregas");
    }
  }
  partes.push(
    t.minutosLaborados > 0
      ? `${horasEnPalabras(t.minutosProductivos)} en actividades de ${horasEnPalabras(t.minutosLaborados)}`
      : "Sin jornada",
  );
  return partes.join(" · ");
}

/** Atraso de una entrega: «45 min», «1 h 20 min»; de un día para arriba, «2 días 3 h». */
export function atrasoEnPalabras(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const total = Math.max(0, Math.round(min));
  if (total < 1440) return horasEnPalabras(total);
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  return horas ? `${plural(dias, "día", "días")} ${horas} h` : plural(dias, "día", "días");
}

/** La píldora de estado de una entrega: «A tiempo», «Tarde · 1 h 20 min», «Sin entregar · 2 h». */
export function estadoDeEntrega(e: Pick<EntregaKpi, "estado" | "minutosTarde">): {
  texto: string;
  tono: "success" | "warning" | "danger";
} {
  const atraso = e.minutosTarde != null && e.minutosTarde > 0 ? ` · ${atrasoEnPalabras(e.minutosTarde)}` : "";
  if (e.estado === "tarde") return { texto: `Tarde${atraso}`, tono: "warning" };
  if (e.estado === "sin_entregar") return { texto: `Sin entregar${atraso}`, tono: "danger" };
  return { texto: "A tiempo", tono: "success" };
}

/** Qué pasó en la revisión del jefe: «Aprobada a la primera», «Devuelta ×2», «Sin revisar». */
export function revisionDeEntrega(e: Pick<EntregaKpi, "estado" | "primeraRevision" | "devoluciones">): {
  texto: string;
  tono: "success" | "warning" | "neutral";
} {
  if (e.devoluciones > 1) return { texto: `Devuelta ×${e.devoluciones}`, tono: "warning" };
  if (e.devoluciones === 1 || e.primeraRevision === "DEVUELTA") return { texto: "Devuelta", tono: "warning" };
  if (e.primeraRevision === "APROBADA") return { texto: "Aprobada a la primera", tono: "success" };
  // Lo que no entregó no tiene qué revisar.
  return { texto: e.estado === "sin_entregar" ? "—" : "Sin revisar", tono: "neutral" };
}

/** Día y hora en hora de México, 24 h: «Lun 5 oct 18:00». */
export function fechaHoraMx(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(partesMx.formatToParts(d).map((x) => [x.type, x.value]));
  return `${fechaCorta(`${p.year}-${p.month}-${p.day}`)} ${p.hour}:${p.minute}`;
}

/**
 * Una persona (o el equipo) en frases. Empieza por las entregas, que es lo que más pesa:
 * «Entregó 18 actividades: 17 a tiempo y 1 tarde; 18 de 18 aprobadas a la primera. De 40 h en
 * jornada, 29 h estuvo con el reloj de una actividad corriendo (73 %). Llegó tarde 2 veces
 * (35 min en total). Uniforme correcto 4 de 5 días.»
 */
export function resumenEnPalabras(t: TotalesKpi, opciones: { conHorario?: boolean } = {}): string {
  const frases: string[] = [];
  if (t.entregas) frases.push(entregasEnPalabras(t.entregas));
  const ritmo = ritmoEnPalabras(t);
  if (ritmo) frases.push(ritmo);
  if (t.minutosLaborados > 0) {
    const pct = t.productividadPct == null ? "" : ` (${Math.round(t.productividadPct)} %)`;
    frases.push(
      `De ${horasEnPalabras(t.minutosLaborados)} en jornada, ${horasEnPalabras(t.minutosProductivos)} estuvo con el reloj de una actividad corriendo${pct}.`,
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

export type AvisoKpi = { clave: string; texto: string; tono: "warning" | "danger" | "neutral"; titulo?: string };

/**
 * Solo lo que pide atención, en corto, para la fila del ranking. Vacío = todo en orden.
 * Primero las entregas (lo que más importa: el ranking solo enseña dos avisos), luego la asistencia.
 */
export function avisosDePersona(t: TotalesKpi): AvisoKpi[] {
  const out: AvisoKpi[] = [];
  const e = t.entregas;
  // Lo que más baja el cumplimiento va primero: días perdidos y poca carga multiplican el total.
  const dd = t.diasDeTrabajo;
  if (dd?.sinTrabajar) {
    out.push({
      clave: "sin-trabajar",
      texto: `${plural(dd.sinTrabajar, "día", "días")} sin trabajar`,
      tono: "danger",
      titulo: [
        dd.sinChecar ? `${dd.sinChecar} sin checar` : "",
        dd.sinTrabajo ? `${dd.sinTrabajo} checó y no hizo nada` : "",
      ]
        .filter(Boolean)
        .join(" · ") + " — sin justificar",
    });
  }
  if (t.carga && t.minutosLaborados > 0 && (t.carga.pct ?? 0) < 50) {
    out.push({
      clave: "carga",
      texto: `Carga ${t.carga.pct ?? 0} %`,
      tono: (t.carga.pct ?? 0) < 25 ? "danger" : "warning",
      titulo: "Trabajo entregado (su tiempo estimado) de sus horas en la oficina; debajo de 50 % baja su cumplimiento",
    });
  }
  if (e?.tarde) {
    out.push({ clave: "tarde", texto: `${e.tarde} tarde`, tono: "warning", titulo: "Actividades entregadas después de su límite" });
  }
  if (e?.sinEntregar) {
    out.push({
      clave: "sin-entregar",
      texto: `${e.sinEntregar} sin entregar`,
      tono: "danger",
      titulo: "Actividades cuyo límite ya pasó y no ha entregado",
    });
  }
  if (e?.devueltas) {
    out.push({
      clave: "devueltas",
      texto: plural(e.devueltas, "devuelta", "devueltas"),
      tono: "warning",
      titulo: "Actividades que el jefe le devolvió al revisarlas",
    });
  }
  if (t.retardos) {
    out.push({ clave: "retardos", texto: `${plural(t.retardos, "retardo", "retardos")} · ${horasEnPalabras(t.minutosTarde)}`, tono: "warning" });
  }
  if (t.uniforme.noOk) {
    out.push({ clave: "uniforme", texto: `Uniforme ${t.uniforme.ok}/${t.uniforme.revisadas}`, tono: "warning" });
  }
  // Con la API nueva ya va dentro de «días sin trabajar».
  if (t.diasSinChecada && !dd) {
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

/** `productividad` se conserva como id; en pantalla es «Tiempo en actividades». */
export type OrdenRanking = "cumplimiento" | "productividad" | "nombre" | "retardos";

/** Mayor primero; sin dato (null o una API que no lo manda) al final. */
function mayorPrimero(x: number | null | undefined, y: number | null | undefined): number {
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return y - x;
}

/**
 * Ranking: mejor cumplimiento arriba (a igualdad, más entregas a tiempo), más tiempo en
 * actividades, más retardos o por nombre. Sin dato, siempre al final.
 */
export function ordenaRanking(personas: KpiPersonaFila[], orden: OrdenRanking): KpiPersonaFila[] {
  const nombre = (a: KpiPersonaFila, b: KpiPersonaFila) => a.persona.nombre.localeCompare(b.persona.nombre, "es");
  return [...personas].sort((a, b) => {
    if (orden === "nombre") return nombre(a, b);
    if (orden === "retardos") {
      return b.totales.retardos - a.totales.retardos || b.totales.minutosTarde - a.totales.minutosTarde || nombre(a, b);
    }
    if (orden === "cumplimiento") {
      return (
        mayorPrimero(a.totales.cumplimientoPct, b.totales.cumplimientoPct) ||
        (b.totales.entregas?.aTiempo ?? 0) - (a.totales.entregas?.aTiempo ?? 0) ||
        nombre(a, b)
      );
    }
    return mayorPrimero(a.totales.productividadPct, b.totales.productividadPct) || nombre(a, b);
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

/**
 * Nota corta cuando la actividad NO cuenta completa; vacío cuando sí (la tabla no repite
 * lo obvio, y el «por qué» largo vive en la ⓘ de la tarjeta).
 */
export function porQueCuenta(a: Pick<ActividadDelRango, "minutosReales" | "minutosEnJornada" | "enCurso">): string {
  const fuera = a.minutosReales - a.minutosEnJornada;
  if (a.minutosEnJornada <= 0) return "No cuenta: fuera de jornada";
  if (fuera <= 1) return a.enCurso ? "En curso" : "";
  return `${horasEnPalabras(fuera)} fuera de jornada`;
}
