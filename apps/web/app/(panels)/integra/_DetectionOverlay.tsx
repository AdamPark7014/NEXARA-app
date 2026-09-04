"use client";

import { useEffect, useState } from "react";
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
 * Transporte: SSE con headers de tenant (fetch stream) + sondeo `afterId`
 * cada ~400 ms de respaldo. Antes solo poll 1.5 s → cajas “fantasma” tarde.
 */

export type PushTarget = { type: string; x: number; y: number; w: number; h: number };

export type PushEvent = {
  id: number;
  deviceIp: string;
  deviceName?: string | null;
  eventType: string;
  label?: string | null;
  occurredAt: string;
  personId?: string | null;
  personName?: string | null;
  doorNo?: number | null;
  verifyMode?: string | null;
  photoPath?: string | null;
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

/** AcuSense FieldDetection es puntual: la caja debe “pegarse” mientras
 *  alguien sigue sentado y solo llega VMD / re-intrusiones esporádicas. */
const BOX_TTL_OPTICAL_MS = 90_000;
/** ACS FaceRect + nombre: sticky más largo — el pase es un flash, la placa no. */
const BOX_TTL_NAMED_MS = 75_000;
/** Sondeo incremental si SSE cae o aún no conectó. */
const POLL_MS = 250;
const SEED_MS = 120_000;
/** VMD sin TargetRect: solo mantiene cajas ya pintadas (presencia sentada). */
const PRESENCE_HOLD_MS = 90_000;
/** Distancia de centros (0..1) bajo la cual dos humanos se consideran el mismo.
 *  Conservador: en Meeting Room tres sentados están lejos; no fusionarlos. */
const SOFT_CENTER_DIST = 0.1;
/** Tope de cajas sticky simultáneas (multi-persona / sala de juntas). */
const MAX_TRACKS = 12;

type Listener = (events: PushEvent[]) => void;

const listeners = new Set<Listener>();
let pollTimer: number | null = null;
let lastId = 0;
let sseAbort: AbortController | null = null;
let sseRetryTimer: number | null = null;

function ttlFor(ev: PushEvent, t: PushTarget): number {
  if (ev.personName?.trim()) return BOX_TTL_NAMED_MS;
  if (t.type === "face") return BOX_TTL_NAMED_MS;
  return BOX_TTL_OPTICAL_MS;
}

function sameTrackKind(a: PushTarget, b: PushTarget, namedA?: string | null, namedB?: string | null): boolean {
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
    // Personas sentadas: el TargetRect tiembla poco; unir por centro cercano.
    return d < SOFT_CENTER_DIST ? 0.28 : 0;
  }
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Fusiona cajas solapadas / cercanas para que el track “siga” (sentados). */
export function mergeBoxes(prev: Box[], incoming: Box[]): Box[] {
  const out = [...prev];
  for (const n of incoming) {
    let best = -1;
    let bestScore = 0.18;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (!sameTrackKind(o, n, o.personName, n.personName)) continue;
      const s = overlapScore(o, n);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best >= 0) {
      const prevBox = out[best];
      // Suaviza posición: 65 % nueva + 35 % previa evita saltos de bbox.
      const blend = (a: number, b: number) => a * 0.65 + b * 0.35;
      out[best] = {
        ...n,
        x: blend(n.x, prevBox.x),
        y: blend(n.y, prevBox.y),
        w: blend(n.w, prevBox.w),
        h: blend(n.h, prevBox.h),
        // ACS face gana sobre human óptico; no volver a "unknown".
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
        ttl: Math.max(n.ttl, prevBox.ttl, PRESENCE_HOLD_MS),
      };
    } else {
      out.push(n);
    }
  }
  if (out.length <= MAX_TRACKS) return out;
  // Conserva las más recientes / con nombre; no tira las demás al llegar 1 caja nueva.
  return out
    .slice()
    .sort((a, b) => {
      const named = Number(Boolean(b.personName)) - Number(Boolean(a.personName));
      if (named) return named;
      return b.at - a.at;
    })
    .slice(0, MAX_TRACKS);
}

function boxesFromEvents(events: PushEvent[], deviceIp: string, now = Date.now()): Box[] {
  const fresh: Box[] = [];
  const maxAge = Math.max(BOX_TTL_OPTICAL_MS, BOX_TTL_NAMED_MS, PRESENCE_HOLD_MS);
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

function fanOut(items: PushEvent[]) {
  if (!items.length) return;
  lastId = Math.max(lastId, ...items.map((e) => e.id));
  for (const fn of listeners) fn(items);
}

async function pollOnce() {
  try {
    if (lastId <= 0) {
      const data = await integraApi<{ items: PushEvent[] }>("integra/push/events?limit=1");
      lastId = Math.max(lastId, data.items?.[0]?.id ?? 0);
      return;
    }
    const data = await integraApi<{ items: PushEvent[] }>(
      `integra/push/events?afterId=${lastId}&limit=80`,
    );
    fanOut(data.items || []);
  } catch {
    // Quedarse sin recuadros no debe romper el video.
  }
}

function parseSseChunk(buffer: string): { events: Array<{ type?: string; item?: PushEvent }>; rest: string } {
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
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buf);
    buf = parsed.rest;
    for (const msg of parsed.events) {
      if (msg.type === "event" && msg.item?.id) fanOut([msg.item]);
    }
  }
}

function ensureTransport() {
  if (pollTimer == null) {
    void pollOnce();
    pollTimer = window.setInterval(() => void pollOnce(), POLL_MS);
  }
  if (sseAbort) return;
  const start = () => {
    sseAbort?.abort();
    sseAbort = new AbortController();
    void runSse(sseAbort.signal).catch(() => {
      sseAbort = null;
      if (listeners.size === 0) return;
      if (sseRetryTimer != null) window.clearTimeout(sseRetryTimer);
      sseRetryTimer = window.setTimeout(() => {
        sseRetryTimer = null;
        if (listeners.size > 0) start();
      }, 2500);
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
  sseAbort?.abort();
  sseAbort = null;
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

  useEffect(() => {
    setBoxes([]);
    setMotionAt(null);
  }, [deviceIp]);

  // Semilla: últimos segundos de esta cámara (el canal solo ve lo nuevo).
  useEffect(() => {
    if (!deviceIp) return;
    let stop = false;
    void integraApi<{ items: PushEvent[] }>(
      `integra/push/events?sinceMs=${SEED_MS}&limit=80`,
    )
      .then((d) => {
        if (stop) return;
        const items = d.items || [];
        const fresh = boxesFromEvents(items, deviceIp);
        if (fresh.length) setBoxes((prev) => mergeBoxes(prev, fresh));
        const maxId = Math.max(0, ...items.map((e) => e.id));
        if (maxId > lastId) lastId = maxId;
        const motion = items.find(
          (e) =>
            e.deviceIp === deviceIp &&
            (e.eventType === "VMD" || e.eventType === "fielddetection") &&
            Date.now() - Date.parse(e.occurredAt) < PRESENCE_HOLD_MS,
        );
        if (motion) setMotionAt(Date.parse(motion.occurredAt) || Date.now());
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [deviceIp]);

  useEffect(() => {
    if (!deviceIp) return;
    return subscribePushEvents((events) => {
      const fresh = boxesFromEvents(events, deviceIp);
      if (fresh.length) setBoxes((prev) => mergeBoxes(prev, fresh));

      // FieldDetection es puntual (entra a la zona). VMD no trae caja, pero
      // si hay gente quieta mantiene las últimas posiciones un rato más.
      let sawMotion = false;
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp) continue;
        if (ev.eventType === "VMD" || ev.eventType === "fielddetection") {
          sawMotion = true;
        }
      }
      if (sawMotion) {
        const now = Date.now();
        setMotionAt(now);
        setBoxes((prev) =>
          prev.map((b) => ({
            ...b,
            at: now,
            ttl: Math.max(b.ttl, PRESENCE_HOLD_MS),
          })),
        );
      }
    });
  }, [deviceIp]);

  useEffect(() => {
    if (boxes.length === 0 && motionAt == null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setBoxes((prev) => prev.filter((b) => now - b.at < b.ttl));
      setMotionAt((m) => (m != null && now - m > PRESENCE_HOLD_MS ? null : m));
      setTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
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
        // Placa sticky dentro del marco si la caja está arriba (evita clip + doble label).
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
