"use client";

import { useEffect, useState } from "react";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

/**
 * Recuadros sobre el video, encima de quien la cámara acaba de detectar.
 *
 * Vienen del propio equipo, que ya clasifica persona de vehículo: `TargetRect`
 * llega normalizado 0..1, así que el recuadro se posiciona en porcentaje y
 * sigue cuadrando aunque el mosaico cambie de tamaño.
 *
 * Identidad real solo llega en accesos (`AccessControllerEvent.name`). Las
 * cámaras AcuSense mandan human/vehicle sin nombre: se etiqueta el tipo, no
 * se inventa matching facial.
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
};

/** Cuánto se queda pintado un recuadro desde que llega su evento. */
const BOX_TTL_MS = 4000;
/** Cada cuánto se pregunta por detecciones nuevas. */
const POLL_MS = 2000;

type Listener = (events: PushEvent[]) => void;

const listeners = new Set<Listener>();
let timer: number | null = null;
let lastId = 0;

async function pollOnce() {
  try {
    const data = await integraApi<{ items: PushEvent[] }>("integra/push/events?limit=40");
    const items = (data.items || []).filter((e) => e.id > lastId);
    if (items.length === 0) return;
    lastId = Math.max(lastId, ...items.map((e) => e.id));
    for (const fn of listeners) fn(items);
  } catch {
    // Quedarse sin recuadros no debe romper el video que hay debajo.
  }
}

/** Un solo sondeo compartido: muro, foco, tira de accesos y badges del rail. */
export function subscribePushEvents(fn: Listener): () => void {
  listeners.add(fn);
  if (timer == null) {
    // La primera vez solo se toma la marca: sin esto, al abrir el muro
    // aparecerían de golpe los recuadros de los últimos minutos.
    void integraApi<{ items: PushEvent[] }>("integra/push/events?limit=1")
      .then((d) => {
        lastId = Math.max(lastId, d.items?.[0]?.id ?? 0);
      })
      .catch(() => undefined);
    timer = window.setInterval(() => void pollOnce(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function labelFor(type: string): string {
  if (type === "human") return "Humano";
  if (type === "vehicle") return "Vehículo";
  if (type === "face") return "Rostro";
  return type;
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
  const [, setTick] = useState(0);

  useEffect(() => {
    setBoxes([]);
  }, [deviceIp]);

  useEffect(() => {
    if (!deviceIp) return;
    return subscribePushEvents((events) => {
      const fresh: Box[] = [];
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp || !ev.targets?.length) continue;
        const age = Date.now() - Date.parse(ev.occurredAt);
        if (!Number.isFinite(age) || age > BOX_TTL_MS * 2) continue;
        for (const [i, t] of ev.targets.entries()) {
          fresh.push({
            ...t,
            key: `${ev.id}-${i}`,
            at: Date.now(),
            personName: ev.personName,
            personId: ev.personId,
          });
        }
      }
      if (fresh.length) setBoxes((prev) => [...prev, ...fresh]);
    });
  }, [deviceIp]);

  useEffect(() => {
    if (boxes.length === 0) return;
    const id = window.setInterval(() => {
      const cut = Date.now() - BOX_TTL_MS;
      setBoxes((prev) => prev.filter((b) => b.at > cut));
      setTick((n) => n + 1);
    }, 500);
    return () => window.clearInterval(id);
  }, [boxes.length]);

  if (!deviceIp || boxes.length === 0) return null;

  return (
    <div className={styles.detOverlay} aria-hidden>
      {boxes.map((b) => {
        const name = b.personName?.trim();
        const tag = name || labelFor(b.type);
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
            }}
          >
            <span className={styles.detTag} data-named={name ? "1" : undefined}>
              <span className={styles.detTagName}>{tag}</span>
              <span className={styles.detTagAge}>
                {name ? relAge(b.at) : `sin ID · ${relAge(b.at)}`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
