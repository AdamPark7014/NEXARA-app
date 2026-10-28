/**
 * Pizarra · «Línea del día» (28-10, propuesta UI/UX aprobada): una fila por persona con lo que
 * pasó y lo que falta hoy, sobre una regla de horas.
 *
 * Junta dos fuentes que ya existían:
 * - `me/kpis/linea-del-dia` (API): la jornada, la comida y los tramos en que corrió el reloj de
 *   cada actividad. Es el mismo cálculo del detalle por persona de Desempeño.
 * - `me/board` (la Pizarra): lo que sigue abierto. De ahí salen lo programado que aún no
 *   arranca, lo atrasado y desde cuándo alguien está libre.
 *
 * Archivo puro (salvo el `fetch`): todas las cuentas se prueban sin pantalla.
 */
import { erpFetch } from "@/lib/erp-api";
import type { TeamBoardUser } from "@/lib/team-board-api";

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

export type LineaDelDiaPersona = {
  persona: { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null };
  horario: { entrada: string | null; salida: string | null; etiqueta: string };
  dia: {
    entrada: string | null;
    salida: string | null;
    abierta: boolean;
    retardo: boolean;
    minutosTarde: number;
    sinChecada: boolean;
    faltaJustificada: boolean;
    minutosLaborados: number;
    minutosOcupados: number;
    entregasDelDia: number;
    jornada: TramoIso[];
    comida: TramoIso[];
    actividades: ActividadDelDia[];
  } | null;
};

export type LineaDelDiaResponse = {
  fecha: string;
  scope: "company" | "subtree";
  generadoAt: string;
  personas: LineaDelDiaPersona[];
};

export function fetchLineaDelDia(token: string, fecha?: string | null): Promise<LineaDelDiaResponse> {
  const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
  return erpFetch<LineaDelDiaResponse>(`me/kpis/linea-del-dia${q}`, token);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hora de México (UTC−6 todo el año desde 2022)
// ─────────────────────────────────────────────────────────────────────────────

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
const MIN = 60_000;

/** `AAAA-MM-DD` del día en México de un instante. */
export function diaMx(ms: number): string {
  return new Date(ms - MX_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante de `HH:MM` en México del día `fecha`. */
export function horaMx(fecha: string, hora: number, minuto = 0): number {
  return Date.parse(`${fecha}T00:00:00Z`) + MX_OFFSET_MS + (hora * 60 + minuto) * MIN;
}

/** «07:56» en México. */
export function hhmmMx(ms: number): string {
  return new Date(ms - MX_OFFSET_MS).toISOString().slice(11, 16);
}

const ms = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bloques de una fila
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - `trabajada`: un tramo con reloj que ya cerró (pausa, foto de salida o entrega).
 * - `en_curso`: su reloj corre ahora.
 * - `programada`: tiene hora de hoy y aún no arranca, en tiempo.
 * - `atrasada`: ya pasó su hora y no arranca.
 * - `comida`, `libre`: sin actividad.
 */
export type TipoBloque = "trabajada" | "en_curso" | "programada" | "atrasada" | "comida" | "libre";

export type Bloque = {
  clave: string;
  tipo: TipoBloque;
  inicio: number;
  fin: number;
  titulo: string;
  detalle: string;
  activityId: number | null;
  coreKind: string | null;
};

export type EstadoFila = "en_jornada" | "salio" | "sin_checar" | "justificado" | "sin_jornada";

export type FilaLinea = {
  userId: number;
  jornada: { inicio: number; fin: number } | null;
  bloques: Bloque[];
  estado: EstadoFila;
  /** «Entró 07:56», «Sin checar · entra 08:00», «Salió 18:20». */
  nota: string;
  retardo: boolean;
};

/** Una actividad que no arranca se dibuja con su plan; sin plan, una hora. */
export const PLAN_POR_OMISION_MIN = 60;
/** Lo más corto que se dibuja: un tramo de dos minutos no se vería. */
export const BLOQUE_MINIMO_MIN = 12;

function duracion(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function armaFila(
  linea: LineaDelDiaPersona | undefined,
  board: TeamBoardUser,
  ahora: number,
  fecha: string,
): FilaLinea {
  const dia = linea?.dia ?? null;
  const porId = new Map((board.openActivities ?? []).map((a) => [a.id, a]));
  const bloques: Bloque[] = [];

  // Jornada: del primer al último tramo; si la API no trae tramos, la checada de la pizarra.
  const tramosJ = (dia?.jornada ?? [])
    .map((t) => ({ inicio: ms(t.inicio), fin: ms(t.fin) }))
    .filter((t): t is { inicio: number; fin: number } => t.inicio != null && t.fin != null);
  let jornada: FilaLinea["jornada"] = tramosJ.length
    ? { inicio: Math.min(...tramosJ.map((t) => t.inicio)), fin: Math.max(...tramosJ.map((t) => t.fin)) }
    : null;
  const entradaBoard = ms(board.entradaHoyAt);
  if (!jornada && entradaBoard != null && diaMx(entradaBoard) === fecha) {
    const salida = ms(board.salidaHoyAt);
    jornada = { inicio: entradaBoard, fin: salida ?? Math.max(ahora, entradaBoard) };
  }

  for (const [i, c] of (dia?.comida ?? []).entries()) {
    const inicio = ms(c.inicio);
    const fin = ms(c.fin);
    if (inicio == null || fin == null || fin <= inicio) continue;
    bloques.push({
      clave: `comida-${i}`,
      tipo: "comida",
      inicio,
      fin,
      titulo: "Comida",
      detalle: `${hhmmMx(inicio)}–${hhmmMx(fin)}`,
      activityId: null,
      coreKind: null,
    });
  }

  const conTramo = new Set<number>();
  for (const a of dia?.actividades ?? []) {
    const inicio = ms(a.inicio);
    const fin = ms(a.fin);
    if (inicio == null || fin == null || fin <= inicio) continue;
    conTramo.add(a.activityId);
    const abierta = porId.get(a.activityId);
    bloques.push({
      clave: `act-${a.activityId}-${a.inicio}`,
      tipo: a.enCurso ? "en_curso" : "trabajada",
      inicio,
      fin,
      titulo: a.titulo || a.anNumber || "Actividad",
      detalle: `${a.anNumber ? `${a.anNumber} · ` : ""}${hhmmMx(inicio)}–${a.enCurso ? "ahora" : hhmmMx(fin)} · ${duracion((fin - inicio) / MIN)}`,
      activityId: a.activityId,
      coreKind: abierta?.coreKind ?? null,
    });
  }

  // Lo programado para hoy que todavía no arranca.
  for (const a of board.openActivities ?? []) {
    if (conTramo.has(a.id) || a.inicioRealAt || a.enCurso || a.enPausa) continue;
    const inicio = ms(a.fechaInicio);
    if (inicio == null || diaMx(inicio) !== fecha) continue;
    const plan = a.minutosPlan && a.minutosPlan > 0 ? a.minutosPlan : PLAN_POR_OMISION_MIN;
    // Ya pasó su hora y no arranca: se dibuja en su ventana programada, en ámbar.
    const atrasada = Boolean(a.atrasada) || inicio < ahora;
    bloques.push({
      clave: `prog-${a.id}`,
      tipo: atrasada ? "atrasada" : "programada",
      inicio,
      fin: inicio + plan * MIN,
      titulo: a.titulo || a.anNumber,
      detalle: atrasada
        ? `${a.anNumber} · era a las ${hhmmMx(inicio)} y no ha iniciado`
        : `${a.anNumber} · ${hhmmMx(inicio)} · ${duracion(plan)} planeadas`,
      activityId: a.id,
      coreKind: a.coreKind ?? null,
    });
  }

  // Libre: en jornada, sin nada corriendo, desde que terminó lo último.
  const libreDesde = ms(board.idleSinceAt);
  const enJornada = Boolean(jornada) && !board.salidaHoyAt;
  if (
    enJornada &&
    libreDesde != null &&
    diaMx(libreDesde) === fecha &&
    libreDesde < ahora &&
    (board.status === "libre" || board.status === "sin_actividad") &&
    !bloques.some((b) => b.tipo === "en_curso")
  ) {
    bloques.push({
      clave: "libre",
      tipo: "libre",
      inicio: libreDesde,
      fin: ahora,
      titulo: "Libre",
      detalle: `Sin actividad desde las ${hhmmMx(libreDesde)} · ${duracion((ahora - libreDesde) / MIN)}`,
      activityId: null,
      coreKind: null,
    });
  }

  bloques.sort((x, y) => x.inicio - y.inicio || x.fin - y.fin);

  const horaEntrada = linea?.horario.entrada ?? null;
  let estado: EstadoFila;
  let nota: string;
  if (dia?.faltaJustificada) {
    estado = "justificado";
    nota = "Falta justificada";
  } else if (jornada && board.salidaHoyAt) {
    estado = "salio";
    nota = `Entró ${hhmmMx(jornada.inicio)} · salió ${hhmmMx(ms(board.salidaHoyAt) ?? jornada.fin)}`;
  } else if (jornada) {
    estado = "en_jornada";
    nota = `Entró ${hhmmMx(jornada.inicio)}${dia?.retardo ? ` · ${dia.minutosTarde} min tarde` : ""}`;
  } else if (horaEntrada && ahora > horaMx(fecha, Number(horaEntrada.slice(0, 2)), Number(horaEntrada.slice(3, 5)))) {
    estado = "sin_checar";
    nota = `Sin checar · entra ${horaEntrada}`;
  } else {
    estado = "sin_jornada";
    nota = horaEntrada ? `Entra ${horaEntrada}` : "Sin horario";
  }

  return { userId: board.id, jornada, bloques, estado, nota, retardo: Boolean(dia?.retardo) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga del día (al asignar)
// ─────────────────────────────────────────────────────────────────────────────

export type CargaDelDia = { texto: string; tono: "libre" | "ocupado" | "neutro" };

/**
 * Una línea para elegir a quién asignarle (28-10): «Libre desde 12:10», «2 abiertas · 3 h
 * planeadas · trabajando», «Sin checar hoy» o «Ya salió». Cuenta lo abierto de hoy o de antes
 * (lo programado para otro día no carga hoy).
 */
export function cargaDelDia(u: TeamBoardUser, ahora: number): CargaDelDia {
  if (u.salidaHoyAt) return { texto: "Ya salió", tono: "neutro" };
  const hoy = diaMx(ahora);
  if (!u.entradaHoyAt || diaMx(Date.parse(u.entradaHoyAt)) !== hoy) return { texto: "Sin checar hoy", tono: "neutro" };
  const abiertas = (u.openActivities ?? []).filter((a) => {
    const inicio = ms(a.fechaInicio);
    return inicio == null || diaMx(inicio) <= hoy;
  });
  if (abiertas.length === 0 || u.status === "libre") {
    const desde = ms(u.idleSinceAt);
    return { texto: desde != null && diaMx(desde) === hoy ? `Libre desde ${hhmmMx(desde)}` : "Libre", tono: "libre" };
  }
  const minutos = abiertas.reduce((s, a) => s + (a.minutosPlan && a.minutosPlan > 0 ? a.minutosPlan : 0), 0);
  const trabajando = abiertas.some((a) => a.enCurso);
  return {
    texto: `${abiertas.length} ${abiertas.length === 1 ? "abierta" : "abiertas"}${minutos ? ` · ${duracion(minutos)} planeadas` : ""}${trabajando ? " · trabajando" : ""}`,
    tono: "ocupado",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Regla de horas
// ─────────────────────────────────────────────────────────────────────────────

export type Ventana = { inicio: number; fin: number; horas: number[] };

/**
 * De 07:00 a 20:00 por omisión; se abre a la hora entera de lo más temprano y de lo más tarde
 * que haya en las filas, sin salir de 05:00–23:00.
 */
export function ventanaDelDia(filas: FilaLinea[], fecha: string): Ventana {
  let desdeH = 7;
  let hastaH = 20;
  for (const f of filas) {
    const tiempos = [f.jornada?.inicio, f.jornada?.fin, ...f.bloques.flatMap((b) => [b.inicio, b.fin])].filter(
      (t): t is number => typeof t === "number" && diaMx(t) === fecha,
    );
    for (const t of tiempos) {
      const h = (t - horaMx(fecha, 0)) / (60 * MIN);
      desdeH = Math.min(desdeH, Math.floor(h));
      hastaH = Math.max(hastaH, Math.ceil(h));
    }
  }
  desdeH = Math.max(5, desdeH);
  hastaH = Math.min(23, Math.max(desdeH + 4, hastaH));
  const horas: number[] = [];
  for (let h = desdeH; h <= hastaH; h++) horas.push(h);
  return { inicio: horaMx(fecha, desdeH), fin: horaMx(fecha, hastaH), horas };
}

/** Posición y ancho en % dentro de la ventana; lo que queda fuera se recorta. */
export function posicion(inicio: number, fin: number, v: Ventana): { left: number; width: number } | null {
  const total = v.fin - v.inicio;
  const a = Math.max(inicio, v.inicio);
  let b = Math.min(fin, v.fin);
  if (b <= a) return null;
  if (b - a < BLOQUE_MINIMO_MIN * MIN) b = Math.min(v.fin, a + BLOQUE_MINIMO_MIN * MIN);
  const left = ((a - v.inicio) / total) * 100;
  const width = ((b - a) / total) * 100;
  return { left: Math.round(left * 100) / 100, width: Math.max(0.6, Math.round(width * 100) / 100) };
}
