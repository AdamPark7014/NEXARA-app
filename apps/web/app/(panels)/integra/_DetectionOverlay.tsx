"use client";

import { useEffect, useRef, useState } from "react";
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

function labelFor(type: string): string {
  if (type === "human") return "Persona";
  if (type === "vehicle") return "Vehículo";
  if (type === "face") return "Rostro";
  return type;
}

export function IntegraDetectionOverlay({
  deviceIp,
  siteId,
}: {
  /** IP del equipo cuyo video se está viendo: las cajas son suyas. */
  deviceIp: string | null;
  siteId?: number | null;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    setBoxes([]);
    seen.current = new Set();
  }, [deviceIp]);

  useEffect(() => {
    if (!deviceIp) return;
    let stop = false;

    const tick = async () => {
      try {
        const qs = new URLSearchParams({ limit: "20" });
        if (siteId) qs.set("siteId", String(siteId));
        const data = await integraApi<{ items: PushEvent[] }>(
          `integra/push/events?${qs.toString()}`,
        );
        if (stop) return;
        const fresh: Box[] = [];
        for (const ev of data.items) {
          if (ev.deviceIp !== deviceIp || !ev.targets?.length) continue;
          if (seen.current.has(ev.id)) continue;
          // Un evento de hace un minuto ya no dice dónde está nadie.
          const age = Date.now() - Date.parse(ev.occurredAt);
          if (!Number.isFinite(age) || age > BOX_TTL_MS * 2) continue;
          seen.current.add(ev.id);
          for (const [i, t] of ev.targets.entries()) {
            fresh.push({ ...t, key: `${ev.id}-${i}`, at: Date.now() });
          }
        }
        if (fresh.length) setBoxes((prev) => [...prev, ...fresh]);
      } catch {
        // Quedarse sin recuadros no debe romper el video que hay debajo.
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [deviceIp, siteId]);

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
