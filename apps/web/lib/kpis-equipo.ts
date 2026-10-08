/**
 * KPI del equipo (dashboard del dueño): cumplimiento en tiempo y forma (entregas),
 * retardos, uniforme, horas laboradas contra productivas, inactividad y tiempo extra.
 *
 * Las cuentas las hace la API (`apps/api/src/me/kpis-equipo.ts`); aquí solo hay
 * tipos, llamadas y lo necesario para pintar: formato, orden y la línea de tiempo.
 */
import { erpFetch } from "@/lib/erp-api";
import { rangeQuery, rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";

export type SemaforoKpi = "verde" | "amarillo" | "rojo" | "sin_datos";

export type UniformeKpi = {
  revisadas: number;
  ok: number;
  noOk: number;
  sinRevisar: number;
  pct: number | null;
};

/** Entregas de actividades: el «tiempo y forma». */
export type EntregasKpi = {
  /** Las que se miden en el rango: entregadas en el rango + las que vencieron en el rango sin entregarse. */
  medidas: number;
  /** Entregadas antes de su límite (las que no tienen límite cuentan a tiempo). */
  aTiempo: number;
  /** Entregadas después de su límite. */
  tarde: number;
  /** Su límite ya pasó (dentro del rango) y no la ha entregado. */
  sinEntregar: number;
  /** Con al menos una revisión del jefe. */
  revisadas: number;
  /** Su primera revisión fue «aprobada» (no se la devolvieron). */
  aprobadasALaPrimera: number;
  /** Revisadas que le devolvieron al menos una vez. */
  devueltas: number;
  /** aTiempo ÷ medidas. null sin medidas. */
  pctATiempo: number | null;
  /** aprobadasALaPrimera ÷ revisadas. null sin revisadas. */
  pctALaPrimera: number | null;
  /** Entregadas a las que se les pudo medir el tiempo dedicado (con estimado o máximo, de un día). */
  conTiempo?: number;
  /** De esas, las que no pasaron su tiempo máximo. */
  enTiempoAdecuado?: number;
  pctTiempoAdecuado?: number | null;
  /** Minutos de trabajo entregado: el estimado de lo entregado (sin estimado, su tiempo real hasta 2 h). */
  minutosCarga?: number;
};

/** Entregas por día trabajado; `referencia` = el ritmo del equipo contra el que se mide. */
export type RitmoKpi = { entregadas: number; dias: number; porDia: number | null; referencia: number | null };
/** Minutos sobre las horas trabajadas. */
export type ProporcionKpi = { minutos: number; pct: number | null };

/** Días laborables en que checó a tiempo ÷ días laborables que debía checar (los sin checar cuentan como no). */
export type AsistenciaPuntualKpi = { esperados: number; puntuales: number; pct: number | null };

/** Una de las partes del cumplimiento, con su peso en el promedio. */
export type ParteCumplimiento = {
  /** entregas · forma · tiempo · ritmo · carga · ocupacion · asistencia · uniforme (puede haber más). */
  clave: string;
  /** «Entregas a tiempo», «Ritmo de entregas», «Siempre con algo»… */
  etiqueta: string;
  /** 0–100. */
  pct: number;
  /** Peso en el promedio (suman 100). */
  peso: number;
  /** «17 de 18», «2.3 por día · el equipo va a 1.8». */
  detalle: string;
};

export type TotalesKpi = {
  /*
   * Lo de «tiempo y forma» es opcional en el tipo: una API que aún no lo manda
   * (undefined) deja la pantalla como antes, con la productividad al frente.
   */
  entregas?: EntregasKpi;
  asistenciaPuntual?: AsistenciaPuntualKpi;
  /** Entregas por día trabajado contra el ritmo del equipo. */
  ritmo?: RitmoKpi;
  /** Trabajo entregado (estimado de lo entregado) contra las horas trabajadas. */
  carga?: ProporcionKpi;
  /** Tiempo con una actividad (cada una hasta su tiempo máximo) contra las horas trabajadas. */
  ocupacion?: ProporcionKpi;
  /** De los días que debía trabajar: sin ninguna actividad, con solo una y el promedio por día. */
  actividadDiaria?: { esperados: number; sinActividad: number; conUna: number; promedio: number | null };
  /** Días que debía trabajar y cuántos trabajó (multiplica el cumplimiento). */
  diasDeTrabajo?: {
    esperados: number;
    trabajados: number;
    sinChecar: number;
    sinTrabajo: number;
    sinTrabajar: number;
    pct: number | null;
  };
  /**
   * Cumplimiento en tiempo y forma (0–100): promedio ponderado de sus partes
   * (`cumplimientoPartes`, cada una con su peso; lo que no tiene dato no pesa).
   * null si no tuvo ninguna entrega que medir en el rango.
   */
  cumplimientoPct?: number | null;
  cumplimientoPartes?: ParteCumplimiento[];
  diasConJornada: number;
  diasSinChecada: number;
  faltasJustificadas: number;
  retardos: number;
  minutosTarde: number;
  uniforme: UniformeKpi;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  /** En pantalla es «Tiempo en actividades»: minutos con el reloj de una actividad corriendo ÷ minutos en jornada. */
  productividadPct: number | null;
  minutosExtra: number | null;
  /** Lo que un jefe ya aprobó: lo único que la pre-nómina puede pagar como extra. */
  minutosExtraAprobados: number;
  /** Tiempo extra calculado que nadie ha aprobado ni rechazado todavía. */
  minutosExtraPendientes: number;
  diasExtraPendientes: number;
  jornadasAbiertas: number;
  jornadasSinSalida: number;
  cierresAutomaticos: number;
  actividadesFueraDeJornada: number;
};

export type TramoIso = { inicio: string; fin: string };

export type ActividadDelDia = {
  activityId: number;
  anNumber: string | null;
  titulo: string | null;
  inicio: string;
  fin: string;
  enCurso: boolean;
  minutosEnJornada: number;
};

export type DiaKpi = {
  fecha: string;
  laborable: boolean;
  conJornada: boolean;
  sinChecada: boolean;
  faltaJustificada: boolean;
  entrada: string | null;
  salida: string | null;
  abierta: boolean;
  sinSalida: boolean;
  cierreAutomatico: boolean;
  checadaEntradaId: number | null;
  retardo: boolean;
  minutosTarde: number;
  uniformeOk: boolean | null;
  minutosComida: number;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  productividadPct: number | null;
  minutosExtra: number | null;
  /** Qué decidió el jefe sobre el extra de ese día. null = nadie lo ha visto. */
  extraEstado: "PENDIENTE" | "APROBADO" | "RECHAZADO" | null;
  minutosExtraAprobados: number;
  extraNota: string | null;
  actividadesFueraDeJornada: number;
  tramos?: { jornada: TramoIso[]; comida: TramoIso[]; productivo: TramoIso[]; inactivo: TramoIso[] };
  actividades?: ActividadDelDia[];
};

export type KpiPersonaFila = {
  persona: { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null };
  horario: {
    clave: string | null;
    etiqueta: string;
    entrada: string | null;
    salida: string | null;
    graciaMin: number;
    jornadaOrdinariaMin: number | null;
    dias: number[];
    /** Alguien le escribió un horario propio; si no, es el de su plantilla. */
    personalizado: boolean;
  };
  totales: TotalesKpi;
  semaforo: SemaforoKpi;
  motivos: string[];
  /** Los días laborables (compactos) para la tabla «Actividad por día». */
  actividadPorDia?: ActividadDelDiaFila[];
};

/** Un día de una persona en «Actividad por día». */
export type ActividadDelDiaFila = {
  fecha: string;
  /** trabajado · sin_trabajo (checó y no hizo nada) · sin_checar · justificado · pendiente (hoy, aún no termina). */
  estado: "trabajado" | "sin_trabajo" | "sin_checar" | "justificado" | "pendiente";
  /** Actividades distintas que tocó ese día (con su reloj corriendo o entregadas). */
  actividades: number;
  entregas: number;
};

export type KpisEquipoResponse = {
  scope: "company" | "subtree";
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  equipo: { totales: TotalesKpi; semaforo: SemaforoKpi; motivos: string[] };
  personas: KpiPersonaFila[];
};

/** Una actividad que se mide en el «tiempo y forma» de la persona. */
export type EntregaKpi = {
  activityId: number;
  anNumber: string | null;
  /** «Actividad de otra área» si quien mira no ve ese tipo. */
  titulo: string | null;
  /** ISO; el límite real (fin del periodo, o fecha máxima). */
  limite: string | null;
  /** ISO; cuándo la entregó la persona (no cuándo la aprobó el jefe). */
  entregadaAt: string | null;
  estado: "a_tiempo" | "tarde" | "sin_entregar";
  /** Tarde: entrega − límite; sin entregar: ahora − límite. */
  minutosTarde: number | null;
  /** null = nadie la ha revisado. */
  primeraRevision: "APROBADA" | "DEVUELTA" | null;
  devoluciones: number;
  /** Minutos estimados (plan de la persona o tiempo estimado de la actividad). */
  minutosPlan?: number | null;
  /** Tope de tiempo con que se midió: su máximo, o el estimado + 25 %. */
  minutosMaximo?: number | null;
  /** Lo que de verdad trabajó en ella (sus sesiones de reloj). */
  minutosReales?: number | null;
  /** 'adecuado' = no pasó su tope; null = no se puede medir. */
  tiempo?: "adecuado" | "excedido" | null;
};

export type KpisPersonaResponse = KpiPersonaFila & {
  desde: string;
  hasta: string;
  generadoAt: string;
  supuestos: string[];
  dias: DiaKpi[];
  justificaciones: Array<{ fecha: string; motivo: string }>;
  /** Lo más reciente arriba. Opcional: una API vieja no lo manda. */
  entregas?: EntregaKpi[];
};

export const SEMAFORO_KPI_COLORS: Record<SemaforoKpi, string> = {
  verde: "#16a34a",
  amarillo: "#d97706",
  rojo: "#dc2626",
  sin_datos: "#94a3b8",
};

export const SEMAFORO_KPI_LABELS: Record<SemaforoKpi, string> = {
  verde: "En orden",
  amarillo: "Atención",
  rojo: "Crítico",
  sin_datos: "Sin datos",
};

export const KPIS_PATH = "/erp/asistencias/indicadores";

/**
 * Rango a partir de `?desde=&hasta=` (así «volver» desde el detalle conserva el rango).
 * Si coincide con Hoy / Semana / Mes se muestra ese botón; si no hay rango, la semana.
 */
export function rangoDesdeUrl(
  search: string,
  hoy?: string,
): { preset: RangoPreset; rango: BoardRange } {
  const q = new URLSearchParams(search);
  const valido = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const desde = valido(q.get("desde"));
  const hasta = valido(q.get("hasta"));
  if (!desde || !hasta) return { preset: "semana", rango: rangoDePreset("semana", hoy) };
  for (const p of ["hoy", "semana", "semana_pasada", "mes", "mes_pasado"] as const) {
    const r = rangoDePreset(p, hoy);
    if (r.desde === desde && r.hasta === hasta) return { preset: p, rango: r };
  }
  return { preset: "personalizado", rango: { desde, hasta } };
}

export function fetchKpisEquipo(token: string, rango?: BoardRange): Promise<KpisEquipoResponse> {
  return erpFetch<KpisEquipoResponse>(`me/kpis/equipo${rangeQuery(rango)}`, token);
}

export function fetchKpisPersona(token: string, userId: number, rango?: BoardRange): Promise<KpisPersonaResponse> {
  return erpFetch<KpisPersonaResponse>(`me/kpis/equipo/${userId}${rangeQuery(rango)}`, token);
}

/** ✓ (true), ✗ (false) o sin revisar (null) en la entrada de alguien de su equipo. */
export function marcarUniforme(token: string, attendanceId: number, ok: boolean | null) {
  return erpFetch<{ message: string; data: { id: number; uniformeOk: boolean | null; uniformeRevisadoAt: string | null } }>(
    `attendance/${attendanceId}/uniforme`,
    token,
    { method: "PATCH", body: JSON.stringify({ ok }) },
  );
}

/** Minutos a «7 h 05», «45 min» o «—». Compacto para tablas. */
export function formatHoras(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatPctKpi(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)} %`;
}

/** «2 de 3 con uniforme · 1 sin revisar». */
export function uniformeTexto(u: UniformeKpi): string {
  if (!u.revisadas) return u.sinRevisar ? `${u.sinRevisar} sin revisar` : "Sin entradas";
  const base = `${u.ok} de ${u.revisadas} con uniforme`;
  return u.sinRevisar ? `${base} · ${u.sinRevisar} sin revisar` : base;
}

export type OrdenKpi = "semaforo" | "nombre" | "productividad" | "retardos" | "inactividad" | "uniforme";

export const ORDEN_KPI_LABELS: Record<OrdenKpi, string> = {
  semaforo: "Semáforo (lo urgente primero)",
  productividad: "Menor productividad",
  inactividad: "Más inactividad",
  retardos: "Más retardos",
  uniforme: "Peor uniforme",
  nombre: "Nombre",
};

const PESO_SEMAFORO: Record<SemaforoKpi, number> = { rojo: 0, amarillo: 1, verde: 2, sin_datos: 3 };

/** Orden de la tabla. Los que no tienen dato van al final en cualquier criterio. */
export function ordenaPersonas(personas: KpiPersonaFila[], orden: OrdenKpi): KpiPersonaFila[] {
  const nombre = (a: KpiPersonaFila, b: KpiPersonaFila) => a.persona.nombre.localeCompare(b.persona.nombre, "es");
  const nulosAlFinal = (x: number | null, y: number | null, asc: boolean) => {
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return asc ? x - y : y - x;
  };
  const lista = [...personas];
  lista.sort((a, b) => {
    switch (orden) {
      case "semaforo":
        return (
          PESO_SEMAFORO[a.semaforo] - PESO_SEMAFORO[b.semaforo] ||
          nulosAlFinal(a.totales.productividadPct, b.totales.productividadPct, true) ||
          nombre(a, b)
        );
      case "productividad":
        return nulosAlFinal(a.totales.productividadPct, b.totales.productividadPct, true) || nombre(a, b);
      case "inactividad":
        return b.totales.minutosInactivos - a.totales.minutosInactivos || nombre(a, b);
      case "retardos":
        return (
          b.totales.retardos - a.totales.retardos || b.totales.minutosTarde - a.totales.minutosTarde || nombre(a, b)
        );
      case "uniforme":
        return nulosAlFinal(a.totales.uniforme.pct, b.totales.uniforme.pct, true) || nombre(a, b);
      default:
        return nombre(a, b);
    }
  });
  return lista;
}

export type SegmentoLinea = {
  tipo: "productivo" | "inactivo" | "comida";
  /** Posición y ancho dentro de la barra, en %. */
  izquierdaPct: number;
  anchoPct: number;
  inicio: string;
  fin: string;
};

export type LineaDeTiempo = {
  inicio: number;
  fin: number;
  segmentos: SegmentoLinea[];
  /** Horas en punto para las marcas de la regla. */
  marcas: Array<{ pct: number; at: string }>;
};

const HORA_MS = 3_600_000;

/**
 * Línea de tiempo de un día: productivo, inactivo y comida sobre la jornada.
 * La escala va de la hora en punto anterior a la entrada a la siguiente después
 * de la salida (México no tiene medias horas de desfase: se redondea en UTC).
 */
export function lineaDeTiempo(dia: Pick<DiaKpi, "tramos">): LineaDeTiempo | null {
  const t = dia.tramos;
  if (!t || !t.jornada.length) return null;
  const ms = (iso: string) => new Date(iso).getTime();
  const todos = [...t.jornada, ...t.comida, ...t.productivo, ...t.inactivo];
  const minimo = Math.min(...todos.map((x) => ms(x.inicio)));
  const maximo = Math.max(...todos.map((x) => ms(x.fin)));
  if (!Number.isFinite(minimo) || !Number.isFinite(maximo) || maximo <= minimo) return null;
  const inicio = Math.floor(minimo / HORA_MS) * HORA_MS;
  const fin = Math.max(Math.ceil(maximo / HORA_MS) * HORA_MS, inicio + HORA_MS);
  const largo = fin - inicio;
  const aSegmento = (tipo: SegmentoLinea["tipo"]) => (x: TramoIso): SegmentoLinea => ({
    tipo,
    izquierdaPct: ((ms(x.inicio) - inicio) / largo) * 100,
    anchoPct: ((ms(x.fin) - ms(x.inicio)) / largo) * 100,
    inicio: x.inicio,
    fin: x.fin,
  });
  const segmentos = [
    ...t.inactivo.map(aSegmento("inactivo")),
    ...t.comida.map(aSegmento("comida")),
    ...t.productivo.map(aSegmento("productivo")),
  ].sort((a, b) => a.izquierdaPct - b.izquierdaPct);
  // Una marca por hora; en jornadas largas, cada dos para que quepan.
  const horas = largo / HORA_MS;
  const paso = horas > 12 ? 2 : 1;
  const marcas: LineaDeTiempo["marcas"] = [];
  for (let h = 0; h <= horas; h += paso) {
    const at = inicio + h * HORA_MS;
    marcas.push({ pct: ((at - inicio) / largo) * 100, at: new Date(at).toISOString() });
  }
  return { inicio, fin, segmentos, marcas };
}

/** Hora corta en hora de México («09:05»). */
export function horaMx(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  });
}

/** «Lun 14 sep» a partir de `AAAA-MM-DD` (sin correrse de día por la zona). */
export function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  const texto = dt
    .toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\s+de\s+/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
