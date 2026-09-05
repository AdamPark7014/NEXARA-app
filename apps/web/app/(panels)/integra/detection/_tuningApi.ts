/**
 * Perfil de detección de una cámara — cliente del contrato del servidor.
 *
 * `GET   integra/cameras/:id/detection`   perfil (guardado + efectivo + límites)
 * `PATCH integra/cameras/:id/detection`   edita el perfil. **No** escribe en el equipo
 * `POST  integra/cameras/:id/detection/apply`  escribe el perfil en el equipo
 *
 * Los nombres y los valores de aquí **no son una invención de la pantalla**:
 * son los del contrato (`DetectionProfileDto` / `DetectionPatchDto`). Por eso
 * `alarmConfidence` no se llama `confidence`, `detectionTarget` vale
 * `human,vehicle` y no `both`, y una región es un array plano de vértices en
 * vez de un objeto con id: así se guarda y así se lee.
 *
 * **El endpoint puede no estar publicado todavía.** Se distinguen tres
 * desenlaces y no dos: salió bien, no hay endpoint («aún no disponible») y
 * falló por otra cosa. Un 404 nunca se convierte en un guardado silencioso.
 */

import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import { withSiteQuery } from "../_lib";

/* ── El contrato ──────────────────────────────────────────────────────── */

/** `alarmConfidence`. Cuatro valores; el equipo devuelve el tag con `opt=`. */
export type DetectionConfidence = "low" | "mediumLow" | "mediumHigh" | "high";

/** `detectionTarget` tal cual lo escribe el equipo (Apéndice A.49). */
export type DetectionTarget = "human" | "vehicle" | "human,vehicle";

/** Vértice normalizado 0..1 sobre el encuadre. Mismo espacio que TargetRect. */
export type DetectionPoint = { x: number; y: number };

/** Polígono de detección: array plano de vértices, como lo guarda el servidor. */
export type DetectionRegion = DetectionPoint[];

/**
 * Ventana en la que la detección cuenta.
 *
 * El servidor guarda `schedule` como JSON libre —todavía no le ha puesto forma—
 * así que ésta es la que escribe esta pantalla y la que sabe volver a leer.
 * `days`: 0 domingo … 6 sábado. Vacío = ningún día, nunca «todos».
 */
export type DetectionWindow = {
  /** `HH:MM` en la hora del sitio. */
  start: string;
  /** `HH:MM`. Si es menor que `start`, la ventana cruza la medianoche. */
  end: string;
  days: number[];
};

/** Rangos y catálogos que manda el servidor «para que la UI no invente». */
export type DetectionLimits = {
  sensitivityMin: number;
  sensitivityMax: number;
  sensitivityDefault: number;
  maxRegions: number;
  alarmConfidences: string[];
  detectionTargets: string[];
};

export type DetectionProfile = {
  cameraId: string;
  cameraName: string | null;
  deviceIp: string | null;
  channel: number | null;
  enabled: boolean;
  /** `null` = esta cámara nunca se editó: va con la plantilla de compatibilidad. */
  hasStoredProfile: boolean;
  /** Lo que se le escribiría HOY al equipo, con los defaults ya resueltos. */
  effective: {
    sensitivity: number;
    alarmConfidence: DetectionConfidence;
    detectionTarget: DetectionTarget;
    /** `null` = fotograma completo. Es el comportamiento que hay hoy. */
    regions: DetectionRegion[] | null;
    timeThresholdSec: number;
    eventTypes: string[];
  };
  /** La ventana horaria guardada, si la pantalla la escribió alguna vez. */
  window: DetectionWindow | null;
  /** Cuándo se escribió por última vez en el equipo. `null` = nunca. */
  lastAppliedAt: string | null;
  lastAppliedNote: string | null;
  limits: DetectionLimits;
};

/** Lo que el operador edita en pantalla. */
export type TuningDraft = {
  enabled: boolean;
  sensitivity: number;
  alarmConfidence: DetectionConfidence;
  detectionTarget: DetectionTarget;
  /** Vacío = fotograma completo, que es lo que hay hoy y lo que hace ruido. */
  regions: DetectionRegion[];
  window: DetectionWindow;
};

/* ── Límites de reserva (los del servidor mandan) ─────────────────────── */

/** Regiones simultáneas que admite el equipo. El servidor manda las suyas. */
export const MAX_REGIONS = 4;
/** Un polígono necesita tres vértices para encerrar algo (lo exige el servidor). */
export const MIN_POINTS = 3;
/** Tope de vértices que se deja dibujar. Guardarraíl de la pantalla. */
export const MAX_POINTS = 10;

export const FALLBACK_LIMITS: DetectionLimits = {
  sensitivityMin: 0,
  sensitivityMax: 100,
  // El mismo 50 del servidor: es el valor del mensaje de ejemplo del fabricante.
  sensitivityDefault: 50,
  maxRegions: MAX_REGIONS,
  alarmConfidences: ["low", "mediumLow", "mediumHigh", "high"],
  detectionTargets: ["human", "vehicle", "human,vehicle"],
};

export const CONFIDENCE_ORDER: DetectionConfidence[] = [
  "low",
  "mediumLow",
  "mediumHigh",
  "high",
];

/**
 * Qué significa cada nivel.
 *
 * Con una advertencia que el servidor documenta y la pantalla no puede callar:
 * `alarmConfidence` es **empírico**. El equipo devuelve el tag, pero el
 * fabricante no lo documenta, así que la dirección del enum no está
 * confirmada. Estas frases dicen lo razonable, no lo verificado.
 */
export const CONFIDENCE_ES: Record<DetectionConfidence, { label: string; hint: string }> = {
  low: {
    label: "Baja",
    hint: "Avisa aunque dude. No se le escapa casi nada y trae falsos positivos.",
  },
  mediumLow: {
    label: "Media-baja",
    hint: "Se inclina a avisar. Útil en escenas oscuras o con gente lejos.",
  },
  mediumHigh: {
    label: "Media-alta",
    hint: "Se inclina a callar. Es lo que el sistema escribe hoy por defecto.",
  },
  high: {
    label: "Alta",
    hint: "Solo avisa si está seguro. El mínimo de ruido y el máximo de escapes.",
  },
};

export const TARGET_ES: Record<DetectionTarget, string> = {
  human: "Solo personas",
  vehicle: "Solo vehículos",
  "human,vehicle": "Personas y vehículos",
};

export const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"] as const;
export const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

/** Ventana de reserva mientras el perfil no traiga una. */
export const DEFAULT_WINDOW: DetectionWindow = {
  start: "00:00",
  end: "23:59",
  days: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Qué significa el número de sensibilidad, en consecuencias.
 *
 * Un `0–100` desnudo no le dice nada a nadie: hasta hoy el sistema escribía
 * 100 —el techo— en las dieciséis cámaras porque alguien lo puso en el código,
 * y nadie sabía que eso quiere decir «avisa con cualquier cambio de píxeles».
 * El control enseña siempre esta frase junto al número.
 */
export function sensitivityMeaning(n: number): { label: string; hint: string } {
  if (n <= 20) {
    return {
      label: "Muy sorda",
      hint: "Solo objetivos grandes y cercanos. Se le escapan personas al fondo.",
    };
  }
  if (n <= 45) {
    return {
      label: "Baja",
      hint: "Exige un objetivo claro. Buena para exteriores con vegetación o lluvia.",
    };
  }
  if (n <= 70) {
    return {
      label: "Equilibrada",
      hint: "El 50 es el valor del ejemplo del fabricante y el que el servidor toma por defecto.",
    };
  }
  if (n <= 90) {
    return {
      label: "Alta",
      hint: "Detecta movimiento sutil. Sombras, reflejos y cortinas empiezan a contar.",
    };
  }
  return {
    label: "Al máximo",
    hint: "Cualquier cambio en la escena dispara. Es lo que el sistema escribía a ciegas en todas las cámaras y la causa directa del ruido.",
  };
}

/* ── Lectura defensiva de la respuesta ───────────────────────────────── */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isConfidence(v: unknown): v is DetectionConfidence {
  return v === "low" || v === "mediumLow" || v === "mediumHigh" || v === "high";
}

function isTarget(v: unknown): v is DetectionTarget {
  return v === "human" || v === "vehicle" || v === "human,vehicle";
}

function readPoint(v: unknown): DetectionPoint | null {
  if (!isRecord(v)) return null;
  const x = Number(v.x);
  const y = Number(v.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

/**
 * Polígonos tal y como los sanea el servidor: array de arrays de vértices,
 * mínimo tres cada uno, tope de `max`. Devuelve `null` cuando no queda ninguno
 * — que es la señal de «fotograma completo», no la de «vacío».
 */
export function readRegions(v: unknown, max = MAX_REGIONS): DetectionRegion[] | null {
  if (!Array.isArray(v)) return null;
  const out: DetectionRegion[] = [];
  for (const raw of v) {
    if (!Array.isArray(raw)) continue;
    const pts: DetectionPoint[] = [];
    for (const p of raw) {
      const point = readPoint(p);
      if (point) pts.push(point);
    }
    if (pts.length >= MIN_POINTS) out.push(pts.slice(0, MAX_POINTS));
    if (out.length >= max) break;
  }
  return out.length ? out : null;
}

/** La ventana horaria que esta pantalla guarda en `schedule`. */
export function readWindow(v: unknown): DetectionWindow | null {
  if (!isRecord(v)) return null;
  const start = typeof v.start === "string" && HHMM.test(v.start) ? v.start : null;
  const end = typeof v.end === "string" && HHMM.test(v.end) ? v.end : null;
  if (!start || !end) return null;
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6))]
        .map((d) => Math.floor(d))
        .sort((a, b) => a - b)
    : [];
  return { start, end, days };
}

function readLimits(v: unknown): DetectionLimits {
  if (!isRecord(v)) return FALLBACK_LIMITS;
  const num = (k: string, fallback: number) =>
    typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : fallback;
  const strs = (k: string, fallback: string[]) =>
    Array.isArray(v[k]) && (v[k] as unknown[]).every((s) => typeof s === "string")
      ? (v[k] as string[])
      : fallback;
  return {
    sensitivityMin: num("sensitivityMin", FALLBACK_LIMITS.sensitivityMin),
    sensitivityMax: num("sensitivityMax", FALLBACK_LIMITS.sensitivityMax),
    sensitivityDefault: num("sensitivityDefault", FALLBACK_LIMITS.sensitivityDefault),
    maxRegions: num("maxRegions", FALLBACK_LIMITS.maxRegions),
    alarmConfidences: strs("alarmConfidences", FALLBACK_LIMITS.alarmConfidences),
    detectionTargets: strs("detectionTargets", FALLBACK_LIMITS.detectionTargets),
  };
}

/**
 * `DetectionProfileDto` → lo que la pantalla necesita.
 *
 * Se lee `effective`, no `stored`: es lo que el servidor le escribiría HOY al
 * equipo, que es lo que el operador tiene que ver y corregir. `stored` solo
 * sirve para saber si esta cámara se editó alguna vez.
 */
export function parseProfile(raw: unknown, cameraId: string): DetectionProfile {
  const src = isRecord(raw) ? raw : {};
  const limits = readLimits(src.limits);
  const eff = isRecord(src.effective) ? src.effective : {};
  const stored = isRecord(src.stored) ? src.stored : null;

  const sensitivity =
    typeof eff.sensitivity === "number" && Number.isFinite(eff.sensitivity)
      ? Math.round(Math.min(limits.sensitivityMax, Math.max(limits.sensitivityMin, eff.sensitivity)))
      : limits.sensitivityDefault;

  return {
    cameraId: typeof src.cameraId === "string" ? src.cameraId : cameraId,
    cameraName: typeof src.cameraName === "string" ? src.cameraName : null,
    deviceIp: typeof src.deviceIp === "string" ? src.deviceIp : null,
    channel: typeof src.channel === "number" ? src.channel : null,
    enabled: src.enabled !== false,
    hasStoredProfile: stored !== null,
    effective: {
      sensitivity,
      alarmConfidence: isConfidence(eff.alarmConfidence) ? eff.alarmConfidence : "mediumHigh",
      detectionTarget: isTarget(eff.detectionTarget) ? eff.detectionTarget : "human",
      regions: readRegions(eff.regions, limits.maxRegions),
      timeThresholdSec:
        typeof eff.timeThresholdSec === "number" && Number.isFinite(eff.timeThresholdSec)
          ? eff.timeThresholdSec
          : 0,
      eventTypes:
        Array.isArray(eff.eventTypes) && eff.eventTypes.every((t) => typeof t === "string")
          ? (eff.eventTypes as string[])
          : [],
    },
    window: readWindow(stored?.schedule),
    lastAppliedAt: typeof src.lastAppliedAt === "string" ? src.lastAppliedAt : null,
    lastAppliedNote: typeof src.lastAppliedNote === "string" ? src.lastAppliedNote : null,
    limits,
  };
}

/** Perfil → borrador editable. */
export function draftFromProfile(p: DetectionProfile): TuningDraft {
  return {
    enabled: p.enabled,
    sensitivity: p.effective.sensitivity,
    alarmConfidence: p.effective.alarmConfidence,
    detectionTarget: p.effective.detectionTarget,
    // `null` del servidor = fotograma completo; en pantalla eso es «sin regiones».
    regions: p.effective.regions ?? [],
    window: p.window ?? DEFAULT_WINDOW,
  };
}

/**
 * Borrador → cuerpo del PATCH, con los nombres del contrato.
 *
 * `regions: null` no es «no mandes nada»: es la forma que tiene el contrato de
 * decir «fotograma completo». Por eso una lista vacía se traduce a `null` y no
 * se omite el campo.
 */
export function patchFromDraft(d: TuningDraft): Record<string, unknown> {
  return {
    enabled: d.enabled,
    sensitivity: d.sensitivity,
    alarmConfidence: d.alarmConfidence,
    detectionTarget: d.detectionTarget,
    regions: d.regions.length ? d.regions : null,
    schedule: d.window,
  };
}

/* ── Validación antes de guardar ─────────────────────────────────────── */

/**
 * Qué impide guardar, en frases que un operador pueda leer. Se comprueba antes
 * de salir por la red para no gastar un viaje en un error evidente; si el
 * servidor rechaza algo más, gana el servidor y su mensaje se enseña tal cual.
 */
export function tuningProblems(d: TuningDraft, limits = FALLBACK_LIMITS): string[] {
  const out: string[] = [];
  if (d.regions.length > limits.maxRegions) {
    out.push(`La cámara admite ${limits.maxRegions} regiones y hay ${d.regions.length}.`);
  }
  for (const [i, r] of d.regions.entries()) {
    if (r.length < MIN_POINTS) {
      out.push(`La región ${i + 1} tiene ${r.length} vértices y necesita ${MIN_POINTS}.`);
    }
    if (r.length > MAX_POINTS) {
      out.push(`La región ${i + 1} pasa de ${MAX_POINTS} vértices.`);
    }
  }
  if (!HHMM.test(d.window.start) || !HHMM.test(d.window.end)) {
    out.push("La ventana horaria necesita dos horas válidas (HH:MM).");
  }
  if (d.window.days.length === 0) {
    out.push("Sin días marcados la detección no cuenta nunca. Marca al menos uno.");
  }
  if (d.sensitivity < limits.sensitivityMin || d.sensitivity > limits.sensitivityMax) {
    out.push(`La sensibilidad va de ${limits.sensitivityMin} a ${limits.sensitivityMax}.`);
  }
  return out;
}

/* ── Transporte ───────────────────────────────────────────────────────── */

/** Tres desenlaces, no dos. `unavailable` es el que evita la mentira. */
export type TuningResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unavailable"; status: number }
  | { kind: "error"; message: string; status: number };

/**
 * ¿Falta la ruta, o contestó el endpoint?
 *
 * Importa distinguirlo porque el propio endpoint también devuelve 404: cuando
 * la cámara no está en el espejo. Nest contesta `Cannot GET /ruta` cuando no
 * hay manejador; un 404 con mensaje propio viene del controlador y significa
 * otra cosa muy distinta, así que se enseña como error, no como «aún no está».
 */
export function isRouteMissing(status: number, message: string): boolean {
  if (status === 405 || status === 501) return true;
  if (status !== 404) return false;
  const m = message.trim();
  return m === "" || /^cannot\s+(get|patch|post|put|delete)\b/i.test(m) || /^HTTP 404$/.test(m);
}

async function readMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (isRecord(body)) {
      const m = body.message;
      if (typeof m === "string" && m.trim()) return m;
      if (Array.isArray(m) && typeof m[0] === "string") return m.join(". ");
      if (isRecord(m) && typeof m.message === "string") return m.message;
      const d = body.detail;
      if (typeof d === "string" && d.trim()) return d;
    }
  } catch {
    /* cuerpo vacío o no-JSON: el código de estado ya dice bastante */
  }
  if (res.status === 401) return "La sesión caducó. Vuelve a entrar.";
  return `HTTP ${res.status}`;
}

function detectionPath(cameraId: string, suffix = ""): string {
  return `integra/cameras/${encodeURIComponent(cameraId)}/detection${suffix}`;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(
    withTenantHeaders({ "Content-Type": "application/json", ...(init?.headers || {}) }),
  );
  return fetch(buildApiUrl(withSiteQuery(path)), { ...init, credentials: "include", headers });
}

/** Envuelve una llamada en los tres desenlaces. */
async function run(
  path: string,
  cameraId: string,
  init?: RequestInit,
): Promise<TuningResult<DetectionProfile>> {
  let res: Response;
  try {
    res = await call(path, init);
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "No se pudo hablar con el servidor",
      status: 0,
    };
  }
  if (!res.ok) {
    const message = await readMessage(res);
    if (isRouteMissing(res.status, message)) return { kind: "unavailable", status: res.status };
    return { kind: "error", message, status: res.status };
  }
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return {
      kind: "error",
      message: "El servidor respondió algo que no es JSON.",
      status: res.status,
    };
  }
  return { kind: "ok", data: parseProfile(raw, cameraId) };
}

export function fetchProfile(cameraId: string): Promise<TuningResult<DetectionProfile>> {
  return run(detectionPath(cameraId), cameraId);
}

/** Guarda el perfil. **No** escribe en el equipo: para eso está `applyProfile`. */
export function saveProfile(
  cameraId: string,
  draft: TuningDraft,
): Promise<TuningResult<DetectionProfile>> {
  return run(detectionPath(cameraId), cameraId, {
    method: "PATCH",
    body: JSON.stringify(patchFromDraft(draft)),
  });
}

export type ApplyOutcome = { applied: boolean; note: string };

/**
 * Escribe el perfil guardado en la cámara.
 *
 * Es un paso aparte en el contrato y también en pantalla: guardar cambia la
 * fila, aplicar cambia el equipo. Confundirlos dejaría al operador creyendo
 * que la cámara ya está sintonizada cuando solo lo está la base de datos.
 */
export async function applyProfile(cameraId: string): Promise<TuningResult<ApplyOutcome>> {
  let res: Response;
  try {
    res = await call(detectionPath(cameraId, "/apply"), { method: "POST" });
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "No se pudo hablar con el servidor",
      status: 0,
    };
  }
  if (!res.ok) {
    const message = await readMessage(res);
    if (isRouteMissing(res.status, message)) return { kind: "unavailable", status: res.status };
    return { kind: "error", message, status: res.status };
  }
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }
  const src = isRecord(raw) ? raw : {};
  return {
    kind: "ok",
    data: {
      applied: src.applied === true,
      note: typeof src.note === "string" ? src.note : "",
    },
  };
}
