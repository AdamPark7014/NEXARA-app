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
 * Un aviso importante sobre lo que esto es y lo que no: la cámara **avisa por
 * evento**, no manda una pista de seguimiento cuadro a cuadro. El recuadro
 * aparece cuando detecta y se desvanece a los pocos segundos; no va pegado a la
 * persona mientras camina. Ese seguimiento fino viaja en los metadatos Dual-VCA
 * dentro del RTSP, y go2rtc los descarta al reempaquetar el video.
 */

type Target = { type: string; x: number; y: number; w: number; h: number };
type Box = Target & { key: string; at: number };

type PushEvent = {
  id: number;
  deviceIp: string;
  eventType: string;
  occurredAt: string;
  targets?: Target[] | null;
};

/** Cuánto se queda pintado un recuadro desde que llega su evento. */
const BOX_TTL_MS = 4000;
/** Cada cuánto se pregunta por detecciones nuevas. */
const POLL_MS = 2000;

/**
 * Un solo sondeo para todo el muro.
 *
 * Cada mosaico monta su propia capa, y si cada uno preguntara por su cuenta,
 * dieciséis mosaicos serían ocho peticiones por segundo contra la API para leer
 * exactamente la misma lista. Se pregunta una vez y se reparte: los mosaicos se
 * suscriben y cada uno se queda con lo suyo.
 */
type Listener = (events: PushEvent[]) => void;

const listeners = new Set<Listener>();
let timer: number | null = null;
let lastId = 0;

async function pollOnce() {
  try {
    const data = await integraApi<{ items: PushEvent[] }>("integra/push/events?limit=40");
    const items = (data.items || []).filter((e) => e.id > lastId && e.targets?.length);
    if (items.length === 0) return;
    lastId = Math.max(lastId, ...items.map((e) => e.id));
    for (const fn of listeners) fn(items);
  } catch {
    // Quedarse sin recuadros no debe romper el video que hay debajo.
  }
}

function subscribe(fn: Listener): () => void {
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
  if (type === "human") return "Persona";
  if (type === "vehicle") return "Vehículo";
  if (type === "face") return "Rostro";
  return type;
}

export function IntegraDetectionOverlay({
  deviceIp,
}: {
  /** IP del equipo cuyo video se está viendo: las cajas son suyas. */
  deviceIp: string | null;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    setBoxes([]);
  }, [deviceIp]);

  useEffect(() => {
    if (!deviceIp) return;
    return subscribe((events) => {
      const fresh: Box[] = [];
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp || !ev.targets?.length) continue;
        // Un evento de hace un minuto ya no dice dónde está nadie.
        const age = Date.now() - Date.parse(ev.occurredAt);
        if (!Number.isFinite(age) || age > BOX_TTL_MS * 2) continue;
        for (const [i, t] of ev.targets.entries()) {
          fresh.push({ ...t, key: `${ev.id}-${i}`, at: Date.now() });
        }
      }
      if (fresh.length) setBoxes((prev) => [...prev, ...fresh]);
    });
  }, [deviceIp]);

  // Barrido de los caducados, aparte del sondeo: si no, un recuadro se quedaría
  // pintado hasta que llegara el siguiente evento.
  useEffect(() => {
    if (boxes.length === 0) return;
    const id = window.setInterval(() => {
      const cut = Date.now() - BOX_TTL_MS;
      setBoxes((prev) => prev.filter((b) => b.at > cut));
    }, 500);
    return () => window.clearInterval(id);
  }, [boxes.length]);

  if (!deviceIp || boxes.length === 0) return null;

  return (
    <div className={styles.detOverlay} aria-hidden>
      {boxes.map((b) => (
        <div
          key={b.key}
          className={styles.detBox}
          data-kind={b.type}
          style={{
            left: `${b.x * 100}%`,
            top: `${b.y * 100}%`,
            width: `${b.w * 100}%`,
            height: `${b.h * 100}%`,
          }}
        >
          <span className={styles.detTag}>{labelFor(b.type)}</span>
        </div>
      ))}
    </div>
  );
}
