"use client";

import { useEffect, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import { getActiveIntegraSiteId, integraApi, withSiteQuery } from "./_lib";
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

type Box = PushTarget & {
  key: string;
  at: number;
  personName?: string | null;
  personId?: string | null;
  photoPath?: string | null;
  ttl: number;
};

/** AcuSense FieldDetection: caduca rápido si no llega rect fresco.
 *  Sticky 90s dejó fantasmas en sillas vacías (68–89s) — ver Video 24h. */
const BOX_TTL_OPTICAL_MS = 3_500;
/** ACS FaceRect + nombre: un poco más (pase es flash), nunca ~90s. */
const BOX_TTL_NAMED_MS = 10_000;
/** Poll de respaldo cuando SSE está sano (ráfagas las come SSE). */
const POLL_HEALTHY_MS = 1200;
/** Poll agresivo si SSE cayó. */
const POLL_DEGRADED_MS = 280;
/** Semilla: solo eventos dentro del TTL útil (no pintar fantasmas de 2 min). */
const SEED_MS = 12_000;
/** Chip «Movimiento» sin caja: VMD no debe resucitar tracks ópticos. */
const MOTION_CHIP_MS = 4_000;
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
  };
  return next;
}

function boxesFromEvents(events: PushEvent[], deviceIp: string, now = Date.now()): Box[] {
  const fresh: Box[] = [];
  const maxAge = Math.max(BOX_TTL_OPTICAL_MS, BOX_TTL_NAMED_MS);
  for (const ev of events) {
    if (ev.deviceIp !== deviceIp || !ev.targets?.length) continue;
    const age = now - Date.parse(ev.occurredAt);
    if (!Number.isFinite(age) || age > maxAge) continue;
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
  if (type === "face") return "Rostro ACS · sin nombre";
  if (type === "vehicle") return "Vehículo · sin placa";
  return `${type} · sin ID`;
}

function relAge(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 1) return "ahora";
  return `${s}s`;
}

export function IntegraDetectionOverlay({
  deviceIp,
}: {
  /** IP del equipo cuyo video se está viendo: las cajas son suyas. */
  deviceIp: string | null;
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
  }, [boxes.length, motionAt]);

  if (!deviceIp) return null;
  if (boxes.length === 0 && motionAt == null) return null;

  return (
    <div className={styles.detOverlay} aria-hidden>
      {motionAt != null && (
        <div className={styles.detMotionChip} data-boxes={boxes.length ? "1" : undefined}>
          {boxes.length
            ? `Presencia · ${boxes.length}`
            : "Movimiento · sin caja AcuSense"}
        </div>
      )}
      {boxes.map((b) => {
        const name = b.personName?.trim();
        const tag = plateLabel(b.type, b.personName);
        const life = Math.max(0.25, 1 - (Date.now() - b.at) / b.ttl);
        const tagInside = b.y < 0.08;
        return (
          <div
            key={b.key}
            className={styles.detBox}
            data-kind={b.type}
            data-named={name ? "1" : undefined}
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              opacity: 0.4 + life * 0.6,
              animationDuration: `${b.ttl}ms`,
            }}
          >
            <span
              className={styles.detTag}
              data-named={name ? "1" : undefined}
              data-inside={tagInside ? "1" : undefined}
            >
              {name && b.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.detTagFace} src={b.photoPath} alt="" />
              ) : null}
              <span className={styles.detTagName}>{tag}</span>
              <span className={styles.detTagAge}>{relAge(b.at)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
