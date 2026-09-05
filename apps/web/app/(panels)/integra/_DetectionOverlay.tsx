"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import BadgeIcon from "@mui/icons-material/Badge";
import BlockIcon from "@mui/icons-material/Block";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import FaceIcon from "@mui/icons-material/Face";
import GroupsIcon from "@mui/icons-material/Groups";
import PersonIcon from "@mui/icons-material/Person";
import SensorsIcon from "@mui/icons-material/Sensors";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import { getActiveIntegraSiteId, integraApi, withSiteQuery } from "./_lib";
import det from "./_detection.module.css";
import styles from "./integra.module.css";

/**
 * Recuadros sobre el video, encima de quien la cámara acaba de detectar.
 *
 * Vienen del propio equipo (`TargetRect` 0..1). Identidad real solo en accesos
 * ACS (`personName`). AcuSense = human/vehicle sin nombre.
 *
 * Transporte: SSE (primario) + sondeo `afterId` de respaldo. Bajo ráfagas
 * (reconfig FieldDetection) se **deduplica y se agrupa el fan-out**; el paint
 * del overlay se limita por rAF — no se ralentiza el poll.
 *
 * Lo que se dibuja (`_detection.module.css`): esquinas en L al estilo VMS,
 * color por tipo, placa con origen y edad, y la estela de las últimas
 * posiciones del track. Todo sale de campos que el evento ya trae; lo que el
 * equipo no manda —confianza del clasificador, por ejemplo— no se pinta.
 */

export type PushTarget = { type: string; x: number; y: number; w: number; h: number };

export type PushEvent = {
  id: number;
  deviceIp: string;
  deviceName?: string | null;
  eventType: string;
  major?: number | null;
  minor?: number | null;
  label?: string | null;
  occurredAt: string;
  personId?: string | null;
  personName?: string | null;
  doorNo?: number | null;
  verifyMode?: string | null;
  photoPath?: string | null;
  outcome?: "granted" | "denied" | null;
  targets?: PushTarget[] | null;
};

/**
 * Quién vio la detección. Se deduce del propio evento, no se configura:
 * solo los avisos del terminal de accesos traen `major/minor`
 * (`AccessControllerEvent`), y `VMD` es el detector de movimiento del firmware.
 */
export type DetSource = "acs" | "acusense" | "vmd";

/** Un punto de la estela: centro de la caja cuando el track estaba ahí. */
type TrailPoint = { x: number; y: number; at: number };

type Box = PushTarget & {
  key: string;
  at: number;
  personName?: string | null;
  personId?: string | null;
  photoPath?: string | null;
  ttl: number;
  /** Origen del aviso: se enseña en la placa (antes era solo un `title`). */
  source: DetSource;
  /** `label` del evento ya traducido por la API: «Intrusión en zona», etc. */
  eventLabel?: string | null;
  /** Solo en ACS: concedido / denegado. */
  outcome?: "granted" | "denied" | null;
  /** Solo en ACS: cómo se autenticó (`currentVerifyMode` del terminal). */
  verifyMode?: string | null;
  /** Posiciones anteriores del mismo track, de más vieja a más nueva. */
  trail: TrailPoint[];
};

/**
 * Cadencia real Oficinas (prod, 2h, FieldDetection+line con TargetRect):
 * Meeting p50≈16s · Support 01/02 p50≈12–13s · Planning p90≈48s.
 * 3.5s apagaba cajas entre ráfagas; 90s + VMD hold = fantasmas en sillas.
 * Puente el p50 con margen corto; sin VMD que reinicie `at`.
 */
const BOX_TTL_OPTICAL_MS = 15_000;
/** ACS FaceRect + nombre: pase es flash; un poco más que óptica, no ~75–90s. */
const BOX_TTL_NAMED_MS = 20_000;
/** Badge DET del rail / toolbar: misma ventana que óptica fresca. */
export const LIVE_DET_BADGE_MS = BOX_TTL_OPTICAL_MS;
/** Poll de respaldo cuando SSE está sano (ráfagas las come SSE). */
const POLL_HEALTHY_MS = 1200;
/** Poll agresivo si SSE cayó. */
const POLL_DEGRADED_MS = 280;
/** Semilla: alinear al TTL nombrado (no 2 min de fantasmas). */
const SEED_MS = BOX_TTL_NAMED_MS;
/** Chip «Movimiento» sin caja: VMD no debe resucitar tracks ópticos. */
const MOTION_CHIP_MS = 4_000;
/** Edad en placa solo si aporta (evitar parpadeo «ahora»/1s). */
const AGE_LABEL_MIN_S = 2;
/** Distancia de centros (0..1) bajo la cual dos humanos se consideran el mismo.
 *  Conservador: Meeting Room tres sentados lejos → no fusionar. */
const SOFT_CENTER_DIST = 0.1;
/** Tope de cajas sticky simultáneas (multi-persona / sala de juntas). */
const MAX_TRACKS = 12;
/** Agrupa fan-out SSE/poll: dedupe por id, un solo tick a listeners. */
const FANOUT_COALESCE_MS = 32;
/** Paint del overlay: máx ~30 fps aunque lleguen 200 eventos/s. */
const PAINT_MIN_MS = 33;
/** Reloj de caducidad + edad en placa (~2 Hz). */
const AGE_TICK_MS = 500;
/** Estela: cuántas posiciones anteriores del track se guardan. */
const TRAIL_MAX = 8;
/** Estela: un punto más viejo que esto ya no se dibuja (se desvanece antes). */
const TRAIL_MAX_AGE_MS = 6_000;
/** Estela: desplazamiento mínimo (0..1) para apuntar un punto nuevo.
 *  Por debajo es tembleque del rect, no movimiento real de la persona. */
const TRAIL_MIN_STEP = 0.012;

type Listener = (events: PushEvent[]) => void;

const listeners = new Set<Listener>();
let pollTimer: number | null = null;
let lastId = 0;
let sseAbort: AbortController | null = null;
let sseRetryTimer: number | null = null;
let sseHealthy = false;
let coalesceTimer: number | null = null;
/** Última versión por id (foto diferida pisa la anterior). */
const pendingById = new Map<number, PushEvent>();

function ttlFor(ev: PushEvent, t: PushTarget): number {
  if (ev.personName?.trim()) return BOX_TTL_NAMED_MS;
  if (t.type === "face") return BOX_TTL_NAMED_MS;
  return BOX_TTL_OPTICAL_MS;
}

function sameTrackKind(
  a: PushTarget,
  b: PushTarget,
  namedA?: string | null,
  namedB?: string | null,
): boolean {
  const na = namedA?.trim();
  const nb = namedB?.trim();
  // Nombres distintos = personas distintas (Meeting Room multi-caja).
  if (na && nb) return na === nb;
  if (a.type === b.type) return true;
  // AcuSense a veces alterna human / unknown en la misma persona sentada.
  const soft = new Set(["human", "unknown", "face"]);
  return soft.has(a.type) && soft.has(b.type);
}

function overlapScore(a: PushTarget, b: PushTarget): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) {
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const d = Math.hypot(acx - bcx, acy - bcy);
    return d < SOFT_CENTER_DIST ? 0.28 : 0;
  }
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Fusiona cajas solapadas / cercanas para que el track “siga” (sentados). */
export function mergeBoxes(prev: Box[], incoming: Box[]): Box[] {
  // Colapsa el lote entrante contra sí mismo (varios eventos del mismo frame).
  let seed = incoming;
  if (incoming.length > 1) {
    seed = [];
    for (const n of incoming) seed = mergeOne(seed, n);
  }
  let out = [...prev];
  for (const n of seed) out = mergeOne(out, n);
  if (out.length <= MAX_TRACKS) return out;
  return out
    .slice()
    .sort((a, b) => {
      const named = Number(Boolean(b.personName)) - Number(Boolean(a.personName));
      if (named) return named;
      return b.at - a.at;
    })
    .slice(0, MAX_TRACKS);
}

/**
 * Estela del track: se apunta dónde estaba la caja *antes* de moverse.
 *
 * Se calcula al fusionar (una vez por evento), no en cada pintado: el rastro
 * es un dato del track, no una animación que haya que recalcular a 30 fps.
 */
function nextTrail(prev: Box, at: number): TrailPoint[] {
  const cx = prev.x + prev.w / 2;
  const cy = prev.y + prev.h / 2;
  const last = prev.trail[prev.trail.length - 1];
  const moved = !last || Math.hypot(cx - last.x, cy - last.y) >= TRAIL_MIN_STEP;
  const base = moved ? [...prev.trail, { x: cx, y: cy, at: prev.at }] : prev.trail;
  const cut = at - TRAIL_MAX_AGE_MS;
  const kept = base.filter((p) => p.at >= cut);
  return kept.length > TRAIL_MAX ? kept.slice(kept.length - TRAIL_MAX) : kept;
}

function mergeOne(out: Box[], n: Box): Box[] {
  const next = [...out];
  let best = -1;
  let bestScore = 0.18;
  for (let i = 0; i < next.length; i++) {
    const o = next[i];
    if (!sameTrackKind(o, n, o.personName, n.personName)) continue;
    const s = overlapScore(o, n);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0) {
    next.push(n);
    return next;
  }
  const prevBox = next[best];
  // Preferir el rect más reciente (FieldDetection) sobre ghost sticky.
  const blend = (a: number, b: number) => a * 0.88 + b * 0.12;
  next[best] = {
    ...n,
    x: blend(n.x, prevBox.x),
    y: blend(n.y, prevBox.y),
    w: blend(n.w, prevBox.w),
    h: blend(n.h, prevBox.h),
    type:
      n.type === "face" || prevBox.type === "face"
        ? "face"
        : n.type === "unknown"
          ? prevBox.type
          : n.type,
    key: prevBox.key,
    at: n.at,
    personName: n.personName || prevBox.personName,
    personId: n.personId || prevBox.personId,
    photoPath: n.photoPath || prevBox.photoPath,
    ttl: n.ttl,
    // El ACS manda más que AcuSense: una vez que un track tiene nombre y modo
    // de verificación, un human anónimo posterior no debe borrarlos.
    source: n.source === "vmd" ? prevBox.source : n.source,
    eventLabel: n.eventLabel || prevBox.eventLabel,
    outcome: n.outcome ?? prevBox.outcome,
    verifyMode: n.verifyMode || prevBox.verifyMode,
    trail: nextTrail(prevBox, n.at),
  };
  return next;
}

/**
 * De dónde viene el aviso, leído del evento tal cual llega.
 *
 * Solo el terminal de accesos rellena `major/minor` (`AccessControllerEvent`);
 * la cámara los deja en null. `facedetection` es AcuSense aunque traiga
 * FaceRect: un rostro visto por la cámara no es una identidad del ACS.
 */
export function sourceOf(ev: PushEvent): DetSource {
  if (ev.major != null || ev.eventType === "AccessControllerEvent") return "acs";
  if (ev.eventType === "VMD") return "vmd";
  return "acusense";
}

function boxesFromEvents(events: PushEvent[], deviceIp: string, now = Date.now()): Box[] {
  const fresh: Box[] = [];
  const maxAge = Math.max(BOX_TTL_OPTICAL_MS, BOX_TTL_NAMED_MS);
  for (const ev of events) {
    if (ev.deviceIp !== deviceIp || !ev.targets?.length) continue;
    const age = now - Date.parse(ev.occurredAt);
    if (!Number.isFinite(age) || age > maxAge) continue;
    const source = sourceOf(ev);
    for (const [i, t] of ev.targets.entries()) {
      const ttl = ttlFor(ev, t);
      if (age > ttl) continue;
      fresh.push({
        ...t,
        key: `${ev.id}-${i}`,
        at: now - Math.max(0, age),
        personName: ev.personName,
        personId: ev.personId,
        photoPath: ev.photoPath,
        ttl,
        source,
        eventLabel: ev.label,
        outcome: ev.outcome ?? null,
        verifyMode: ev.verifyMode ?? null,
        trail: [],
      });
    }
  }
  return fresh;
}

function flushFanOut() {
  coalesceTimer = null;
  if (pendingById.size === 0) return;
  const items = [...pendingById.values()].sort((a, b) => a.id - b.id);
  pendingById.clear();
  lastId = Math.max(lastId, ...items.map((e) => e.id));
  for (const fn of listeners) {
    try {
      fn(items);
    } catch {
      /* un listener roto no tumba el bus */
    }
  }
}

/** Encola eventos: mismo id (foto diferida) pisa; un solo flush coalescido. */
function fanOut(items: PushEvent[]) {
  if (!items.length) return;
  for (const ev of items) {
    if (!ev?.id) continue;
    const prev = pendingById.get(ev.id);
    if (prev) {
      pendingById.set(ev.id, {
        ...prev,
        ...ev,
        photoPath: ev.photoPath || prev.photoPath,
        targets: ev.targets?.length ? ev.targets : prev.targets,
        personName: ev.personName || prev.personName,
      });
    } else {
      pendingById.set(ev.id, ev);
    }
  }
  if (coalesceTimer != null) return;
  coalesceTimer = window.setTimeout(flushFanOut, FANOUT_COALESCE_MS);
}

function reschedulePoll() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (listeners.size === 0) return;
  const ms = sseHealthy ? POLL_HEALTHY_MS : POLL_DEGRADED_MS;
  pollTimer = window.setInterval(() => void pollOnce(), ms);
}

async function pollOnce() {
  try {
    if (lastId <= 0) {
      const data = await integraApi<{ items: PushEvent[] }>("integra/push/events?limit=1");
      lastId = Math.max(lastId, data.items?.[0]?.id ?? 0);
      return;
    }
    const data = await integraApi<{ items: PushEvent[] }>(
      `integra/push/events?afterId=${lastId}&limit=120`,
    );
    fanOut(data.items || []);
  } catch {
    // Quedarse sin recuadros no debe romper el video.
  }
}

function parseSseChunk(buffer: string): {
  events: Array<{ type?: string; item?: PushEvent }>;
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: Array<{ type?: string; item?: PushEvent }> = [];
  for (const block of parts) {
    const dataLine = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine));
    } catch {
      /* ignore */
    }
  }
  return { events, rest };
}

async function runSse(signal: AbortSignal) {
  const siteId = getActiveIntegraSiteId();
  if (!siteId) throw new Error("sin sitio");
  const url = buildApiUrl(withSiteQuery(`integra/push/stream?siteId=${siteId}`));
  const headers = new Headers(withTenantHeaders({ Accept: "text/event-stream" }));
  const res = await fetch(url, { credentials: "include", headers, signal });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
  sseHealthy = true;
  reschedulePoll();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  // Micro-lote por chunk de red: varios eventos en un solo fanOut.
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buf);
    buf = parsed.rest;
    const batch: PushEvent[] = [];
    for (const msg of parsed.events) {
      if (msg.type === "event" && msg.item?.id) batch.push(msg.item);
    }
    if (batch.length) fanOut(batch);
  }
}

function ensureTransport() {
  if (pollTimer == null) {
    void pollOnce();
    reschedulePoll();
  }
  if (sseAbort) return;
  const start = () => {
    sseAbort?.abort();
    sseAbort = new AbortController();
    void runSse(sseAbort.signal)
      .catch(() => {
        /* reconnect abajo */
      })
      .finally(() => {
        sseHealthy = false;
        sseAbort = null;
        reschedulePoll();
        if (listeners.size === 0) return;
        if (sseRetryTimer != null) window.clearTimeout(sseRetryTimer);
        sseRetryTimer = window.setTimeout(() => {
          sseRetryTimer = null;
          if (listeners.size > 0) start();
        }, 800);
      });
  };
  start();
}

function stopTransportIfIdle() {
  if (listeners.size > 0) return;
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (coalesceTimer != null) {
    window.clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  pendingById.clear();
  sseAbort?.abort();
  sseAbort = null;
  sseHealthy = false;
  if (sseRetryTimer != null) {
    window.clearTimeout(sseRetryTimer);
    sseRetryTimer = null;
  }
}

/** Un solo canal compartido: muro, foco, tira de accesos, badges y ocupación. */
export function subscribePushEvents(fn: Listener): () => void {
  listeners.add(fn);
  ensureTransport();
  return () => {
    listeners.delete(fn);
    stopTransportIfIdle();
  };
}

/**
 * Una sola placa: ACS con nombre vs óptica sin inventar Face ID.
 * No duplicar «Humano» + «sin ID» en dos spans.
 */
export function plateLabel(type: string, personName?: string | null): string {
  const name = personName?.trim();
  if (name) return name;
  if (type === "human" || type === "unknown") return "Humano · sin ID";
  // Un FaceRect puede venir de la cámara (facedetection) o del terminal: quién
  // lo vio lo dice la línea de origen, la placa no debe afirmarlo.
  if (type === "face") return "Rostro · sin nombre";
  if (type === "vehicle") return "Vehículo · sin placa";
  return `${type} · sin ID`;
}

function relAge(at: number, now = Date.now()): string | null {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < AGE_LABEL_MIN_S) return null;
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}

function isHumanish(type: string): boolean {
  return type === "human" || type === "unknown" || type === "face";
}

/** Familia visual de la caja: manda el color, el icono y la estela. */
type DetKind = "person" | "named" | "face" | "vehicle";

function kindOf(b: Box): DetKind {
  if (b.personName?.trim()) return "named";
  if (b.type === "vehicle") return "vehicle";
  if (b.type === "face") return "face";
  return "person";
}

/** Origen en tres letras: lo que antes solo estaba en el `title` del span. */
function sourceText(s: DetSource): string {
  if (s === "acs") return "ACS";
  if (s === "vmd") return "VMD";
  return "AcuSense";
}

/**
 * `currentVerifyMode` del terminal, en castellano.
 *
 * El firmware manda una jerga corta y no siempre la misma; lo que no está en
 * la tabla se enseña crudo antes que inventarle una traducción.
 */
const VERIFY_ES: Record<string, string> = {
  face: "Rostro",
  faceOrFp: "Rostro o huella",
  faceOrFpOrCardOrPw: "Rostro/huella/tarjeta",
  card: "Tarjeta",
  cardOrFace: "Tarjeta o rostro",
  cardOrFaceOrFp: "Tarjeta/rostro/huella",
  fp: "Huella",
  fingerprint: "Huella",
  fpOrCard: "Huella o tarjeta",
  pw: "PIN",
  password: "PIN",
  cardAndPw: "Tarjeta + PIN",
  faceAndFp: "Rostro + huella",
};

function verifyText(v?: string | null): string | null {
  const k = v?.trim();
  if (!k) return null;
  return VERIFY_ES[k] ?? k;
}

/**
 * Dónde cabe la placa.
 *
 * Anclada arriba-izquierda se sale del cuadro en dos casos reales: una caja
 * pegada al techo (la placa queda fuera por arriba) y una caja en el tercio
 * derecho (el texto se sale por la derecha). Se recoloca sola.
 */
function tagPlacement(b: Box): { place: "above" | "inside"; align: "left" | "right" } {
  return {
    place: b.y < 0.09 ? "inside" : "above",
    align: b.x > 0.6 ? "right" : "left",
  };
}

/* Iconos MUI como elementos constantes: creados una vez por módulo, React ve
   la misma referencia en cada pintado y se salta ese subárbol. Nada de emojis:
   cambian de forma con el sistema operativo y no se pueden colorear. */
const ICON_NAMED = (
  <span className={det.icon} aria-hidden="true">
    <BadgeIcon fontSize="inherit" />
  </span>
);
const ICON_PERSON = (
  <span className={det.icon} aria-hidden="true">
    <PersonIcon fontSize="inherit" />
  </span>
);
const ICON_FACE = (
  <span className={det.icon} aria-hidden="true">
    <FaceIcon fontSize="inherit" />
  </span>
);
const ICON_VEHICLE = (
  <span className={det.icon} aria-hidden="true">
    <DirectionsCarIcon fontSize="inherit" />
  </span>
);
const ICON_DENIED = (
  <span className={det.icon} aria-hidden="true">
    <BlockIcon fontSize="inherit" />
  </span>
);
const ICON_GROUP = (
  <span className={det.icon} aria-hidden="true">
    <GroupsIcon fontSize="inherit" />
  </span>
);
const ICON_MOTION = (
  <span className={det.icon} aria-hidden="true">
    <SensorsIcon fontSize="inherit" />
  </span>
);
const ICON_IDLE = (
  <span className={det.icon} aria-hidden="true">
    <VisibilityOffIcon fontSize="inherit" />
  </span>
);

const KIND_ICON: Record<DetKind, ReactElement> = {
  named: ICON_NAMED,
  person: ICON_PERSON,
  face: ICON_FACE,
  vehicle: ICON_VEHICLE,
};

/**
 * Texto para lector de pantalla. A propósito sin edades: el reloj de 2 Hz las
 * cambiaría cada tick y `aria-live` cantaría la escena entera cada medio
 * segundo. Solo cambia cuando cambia la composición de la detección.
 */
function liveSummary(boxes: Box[], motionAt: number | null): string {
  if (boxes.length === 0) {
    return motionAt != null ? "Movimiento detectado, sin caja de objeto." : "";
  }
  const named: string[] = [];
  let anon = 0;
  let vehicles = 0;
  for (const b of boxes) {
    const name = b.personName?.trim();
    if (name) named.push(name);
    else if (b.type === "vehicle") vehicles += 1;
    else if (isHumanish(b.type)) anon += 1;
  }
  const parts: string[] = [];
  if (named.length) parts.push(`identificado ${named.join(", ")}`);
  if (anon) parts.push(`${anon} ${anon === 1 ? "persona" : "personas"} sin identificar`);
  if (vehicles) parts.push(`${vehicles} ${vehicles === 1 ? "vehículo" : "vehículos"}`);
  if (!parts.length) parts.push(`${boxes.length} objetos`);
  return `Detección en vivo: ${parts.join("; ")}.`;
}

export function IntegraDetectionOverlay({
  deviceIp,
  showEmpty = false,
}: {
  /** IP del equipo cuyo video se está viendo: las cajas son suyas. */
  deviceIp: string | null;
  /**
   * Foco: mensaje corto si no hay caja fresca.
   * Muro: false (16 celdas no deben gritar «sin detección»).
   */
  showEmpty?: boolean;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [motionAt, setMotionAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const boxesRef = useRef<Box[]>([]);
  const motionRef = useRef<number | null>(null);
  const pendingRef = useRef<{ boxes: Box[] | null; motion: number | null | undefined }>({
    boxes: null,
    motion: undefined,
  });
  const paintTimer = useRef<number | null>(null);
  const lastPaint = useRef(0);

  const flushPaint = () => {
    paintTimer.current = null;
    lastPaint.current = Date.now();
    const p = pendingRef.current;
    if (p.boxes) {
      boxesRef.current = p.boxes;
      setBoxes(p.boxes);
      p.boxes = null;
    }
    if (p.motion !== undefined) {
      motionRef.current = p.motion;
      setMotionAt(p.motion);
      p.motion = undefined;
    }
  };

  const schedulePaint = () => {
    if (paintTimer.current != null) return;
    const wait = Math.max(0, PAINT_MIN_MS - (Date.now() - lastPaint.current));
    paintTimer.current = window.setTimeout(() => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(flushPaint);
      } else {
        flushPaint();
      }
    }, wait);
  };

  const applyBoxes = (next: Box[]) => {
    pendingRef.current.boxes = next;
    schedulePaint();
  };

  const applyMotion = (at: number | null) => {
    pendingRef.current.motion = at;
    schedulePaint();
  };

  useEffect(() => {
    boxesRef.current = [];
    motionRef.current = null;
    pendingRef.current = { boxes: null, motion: undefined };
    setBoxes([]);
    setMotionAt(null);
    return () => {
      if (paintTimer.current != null) window.clearTimeout(paintTimer.current);
    };
  }, [deviceIp]);

  // Semilla: últimos segundos de esta cámara (el canal solo ve lo nuevo).
  useEffect(() => {
    if (!deviceIp) return;
    let stop = false;
    void integraApi<{ items: PushEvent[] }>(
      `integra/push/events?sinceMs=${SEED_MS}&limit=80&live=1`,
    )
      .then((d) => {
        if (stop) return;
        const items = d.items || [];
        const fresh = boxesFromEvents(items, deviceIp);
        if (fresh.length) {
          const merged = mergeBoxes(boxesRef.current, fresh);
          boxesRef.current = merged;
          applyBoxes(merged);
        }
        const maxId = Math.max(0, ...items.map((e) => e.id));
        if (maxId > lastId) lastId = maxId;
        const motion = items.find(
          (e) =>
            e.deviceIp === deviceIp &&
            (e.eventType === "VMD" || e.eventType === "fielddetection") &&
            Date.now() - Date.parse(e.occurredAt) < MOTION_CHIP_MS,
        );
        if (motion) {
          const at = Date.parse(motion.occurredAt) || Date.now();
          motionRef.current = at;
          applyMotion(at);
        }
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint helpers estables por render
  }, [deviceIp]);

  useEffect(() => {
    if (!deviceIp) return;
    return subscribePushEvents((events) => {
      const fresh = boxesFromEvents(events, deviceIp);
      if (fresh.length) {
        const merged = mergeBoxes(boxesRef.current, fresh);
        boxesRef.current = merged;
        applyBoxes(merged);
      }

      // VMD / fielddetection sin TargetRect solo alimentan el chip de movimiento.
      // No reiniciar `at` ni alargar TTL: eso dejaba fantasmas 60–90s en sillas.
      let sawMotion = false;
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp) continue;
        if (ev.eventType === "VMD" || ev.eventType === "fielddetection") {
          sawMotion = true;
        }
      }
      if (sawMotion) {
        motionRef.current = Date.now();
        applyMotion(motionRef.current);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIp]);

  useEffect(() => {
    if (boxes.length === 0 && motionAt == null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const next = boxesRef.current.filter((b) => now - b.at < b.ttl);
      if (next.length !== boxesRef.current.length) {
        boxesRef.current = next;
        applyBoxes(next);
      }
      const m = motionRef.current;
      if (m != null && now - m > MOTION_CHIP_MS) {
        motionRef.current = null;
        applyMotion(null);
      }
      setTick((n) => n + 1);
    }, AGE_TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes.length, motionAt, showEmpty]);

  if (!deviceIp) return null;

  // Un solo reloj por pintado: la edad de todas las cajas y el desvanecido de
  // la estela salen del mismo `now`, así no se descuadran entre sí.
  const now = Date.now();
  const namedCount = boxes.filter((b) => b.personName?.trim()).length;
  const humanCount = boxes.filter((b) => isHumanish(b.type)).length;
  const vehicleCount = boxes.filter((b) => b.type === "vehicle").length;
  const hasMotionOnly = motionAt != null && boxes.length === 0;
  const idle = boxes.length === 0 && motionAt == null;
  const trailed = boxes.filter((b) => b.trail.length > 0);

  if (idle && !showEmpty) return null;

  return (
    <div className={`${styles.detOverlay} ${det.overlay}`}>
      {/* Lo visual queda fuera del árbol de accesibilidad; lo que se anuncia
          es el resumen de abajo, que no cambia con el reloj de edades. */}
      <div className={det.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {liveSummary(boxes, motionAt)}
      </div>
      <div className={det.hud} aria-hidden="true">
        {humanCount > 0 && (
          <span
            className={det.chip}
            data-kind={namedCount > 0 ? "named" : undefined}
            title="Cajas humanas con TargetRect fresco"
          >
            {namedCount > 0 ? ICON_NAMED : ICON_GROUP}
            <b>{humanCount}</b>
            {humanCount === 1 ? "persona" : "personas"}
            {namedCount > 0 ? ` · ${namedCount} con ID` : ""}
          </span>
        )}
        {vehicleCount > 0 && (
          <span className={det.chip} data-kind="vehicle">
            {ICON_VEHICLE}
            <b>{vehicleCount}</b>
            {vehicleCount === 1 ? "vehículo" : "vehículos"}
          </span>
        )}
        {hasMotionOnly && (
          <span className={det.chip} data-kind="motion">
            {ICON_MOTION}
            Movimiento · sin caja AcuSense
          </span>
        )}
        {idle && showEmpty && (
          <span className={det.chip} data-kind="idle">
            {ICON_IDLE}
            Sin detección reciente · FieldDetection
          </span>
        )}
      </div>
      {trailed.length > 0 && (
        <svg
          className={det.trails}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {trailed.map((b) => {
            // Punto vivo al final: la estela llega hasta donde está la caja.
            const pts = [...b.trail, { x: b.x + b.w / 2, y: b.y + b.h / 2, at: b.at }].filter(
              (p) => now - p.at < TRAIL_MAX_AGE_MS,
            );
            if (pts.length < 2) return null;
            return (
              <g key={`t-${b.key}`} className={det.trail} data-kind={kindOf(b)}>
                {pts.slice(1).map((p, i) => (
                  <line
                    key={`${b.key}-${i}`}
                    x1={pts[i].x * 100}
                    y1={pts[i].y * 100}
                    x2={p.x * 100}
                    y2={p.y * 100}
                    // Cuanto más viejo el tramo, más transparente: el rastro se
                    // apaga por sí solo sin un temporizador propio.
                    strokeOpacity={Math.max(0.06, 0.6 * (1 - (now - p.at) / TRAIL_MAX_AGE_MS))}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      )}
      {boxes.map((b) => {
        const name = b.personName?.trim();
        const kind = kindOf(b);
        const denied = b.outcome === "denied";
        const tag = plateLabel(b.type, b.personName);
        const age = relAge(b.at, now);
        const place = tagPlacement(b);
        const verify = verifyText(b.verifyMode);
        return (
          <div
            key={b.key}
            className={det.box}
            data-kind={kind}
            data-denied={denied ? "1" : undefined}
            aria-hidden="true"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              // El apagado lo lleva la animación `detLife` con el TTL real de
              // esta caja: una sola fuente de verdad para la opacidad.
              ["--det-ttl" as string]: `${b.ttl}ms`,
            }}
          >
            <span className={det.tag} data-place={place.place} data-align={place.align}>
              <span className={det.tagHead}>
                {name && b.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={det.tagFace} src={b.photoPath} alt="" />
                ) : (
                  (denied ? ICON_DENIED : KIND_ICON[kind])
                )}
                <span className={det.tagName}>{tag}</span>
                {age ? <span className={det.tagAge}>{age}</span> : null}
              </span>
              {/* Segunda línea: solo lo que el evento trae de verdad. Sin
                  confianza del clasificador —el push de Hikvision no la manda—
                  y sin rellenos: si no hay dato, el trozo no se pinta. */}
              <span className={det.tagMeta}>
                <span className={det.tagSource}>{sourceText(b.source)}</span>
                {b.eventLabel ? (
                  <>
                    <span className={det.tagDot}>·</span>
                    <span>{b.eventLabel}</span>
                  </>
                ) : null}
                {verify ? (
                  <>
                    <span className={det.tagDot}>·</span>
                    <span>{verify}</span>
                  </>
                ) : null}
                {denied ? (
                  <>
                    <span className={det.tagDot}>·</span>
                    <span className={det.tagDenied}>Denegado</span>
                  </>
                ) : null}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
