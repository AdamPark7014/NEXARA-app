"use client";

import { useEffect, useState } from "react";
import { subscribePushEvents, type PushEvent } from "./_DetectionOverlay";
import { PersonFaceThumb, prefetchPersonFace } from "./_PersonFace";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

/**
 * Tira de accesos recientes en Foco de una cámara-puerta.
 *
 * Solo hay identidad en eventos ACS (`personName`). Se filtra por la IP del
 * terminal que alimenta el stream — no se cruza con cámaras AcuSense.
 */

type AccessHit = {
  id: number;
  at: number;
  personName: string;
  personId: string | null;
  photoPath: string | null;
  label: string | null;
  verifyMode: string | null;
};

const ACCESS_TTL_MS = 90_000;
const SEED_MS = 90_000;

function relAge(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 1) return "ahora";
  return `${s}s`;
}

function toHit(ev: PushEvent): AccessHit | null {
  const name = ev.personName?.trim();
  if (!name) return null;
  const at = Date.parse(ev.occurredAt);
  if (!Number.isFinite(at) || Date.now() - at > ACCESS_TTL_MS) return null;
  if (ev.personId) prefetchPersonFace(ev.personId);
  return {
    id: ev.id,
    at,
    personName: name,
    personId: ev.personId ?? null,
    photoPath: ev.photoPath ?? null,
    label: ev.label ?? null,
    verifyMode: ev.verifyMode ?? null,
  };
}

export function IntegraRecentAccess({
  deviceIp,
  enabled,
}: {
  deviceIp: string | null;
  enabled: boolean;
}) {
  const [hits, setHits] = useState<AccessHit[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    setHits([]);
  }, [deviceIp]);

  useEffect(() => {
    if (!enabled || !deviceIp) return;
    let stop = false;
    void integraApi<{ items: PushEvent[] }>(
      `integra/push/events?sinceMs=${SEED_MS}&limit=40&live=1`,
    )
      .then((d) => {
        if (stop) return;
        const fresh: AccessHit[] = [];
        for (const ev of d.items || []) {
          if (ev.deviceIp !== deviceIp) continue;
          const h = toHit(ev);
          if (h) fresh.push(h);
        }
        if (!fresh.length) return;
        setHits(fresh.sort((a, b) => b.at - a.at).slice(0, 12));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [deviceIp, enabled]);

  useEffect(() => {
    if (!enabled || !deviceIp) return;
    return subscribePushEvents((events: PushEvent[]) => {
      const fresh: AccessHit[] = [];
      for (const ev of events) {
        if (ev.deviceIp !== deviceIp) continue;
        const h = toHit(ev);
        if (h) fresh.push(h);
      }
      if (!fresh.length) return;
      setHits((prev) => {
        const map = new Map(prev.map((h) => [h.id, h]));
        for (const h of fresh) map.set(h.id, h);
        return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 12);
      });
    });
  }, [deviceIp, enabled]);

  useEffect(() => {
    if (!enabled || hits.length === 0) return;
    const id = window.setInterval(() => {
      const cut = Date.now() - ACCESS_TTL_MS;
      setHits((prev) => prev.filter((h) => h.at > cut));
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, hits.length]);

  if (!enabled || !deviceIp || hits.length === 0) return null;

  return (
    <aside className={styles.accessStrip} aria-label="Últimos accesos">
      <header className={styles.accessStripHead}>
        <strong>Últimos accesos</strong>
        <span>ACS · 90 s</span>
      </header>
      <ul className={styles.accessStripList}>
        {hits.map((h) => (
          <li key={h.id} className={styles.accessStripRow} data-fresh={Date.now() - h.at < 4000 ? "1" : undefined}>
            <PersonFaceThumb
              className={styles.accessStripPhoto}
              size="md"
              personId={h.personId}
              personName={h.personName}
              photoPath={h.photoPath}
            />
            <div className={styles.accessStripBody}>
              <strong>{h.personName}</strong>
              <span>
                {h.label || "Acceso"}
                {h.verifyMode ? ` · ${h.verifyMode}` : ""}
              </span>
              <em>{relAge(h.at)}</em>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
